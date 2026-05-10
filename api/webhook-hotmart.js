// Recebe webhooks da Hotmart e cria/atualiza licenças na tabela Airtable do Painel OS.
// Variáveis: HOTMART_HOTTOK, AIRTABLE_BASE|AIRTABLE_BASE_ID, AIRTABLE_KEY|AIRTABLE_API_KEY,
// AIRTABLE_TABLE (ex.: licences_os). Opcional: HOTMART_OS_PRODUCT_IDS=id1,id2 — se definido,
// só processa compras desses product.id; se vazio, aceita qualquer produto (URL dedicada ao OS).
import Airtable from "airtable";
import crypto from "crypto";

const HOTMART_HOTTOK = process.env.HOTMART_HOTTOK;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID;
const AIRTABLE_KEY = process.env.AIRTABLE_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "licences_os";

function parseOsProductIds() {
  const raw = process.env.HOTMART_OS_PRODUCT_IDS || process.env.HOTMART_OS_PRODUCT_ID || "";
  return raw
    .split(/[,;\s]+/)
    .map(s => parseInt(String(s).trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

const OS_PRODUCT_IDS = parseOsProductIds();

function base() {
  if (!AIRTABLE_BASE || !AIRTABLE_KEY) return null;
  return new Airtable({ apiKey: AIRTABLE_KEY }).base(AIRTABLE_BASE);
}

function genCode(prefix = "OS") {
  const s = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toDateOnly(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const getEvent = p => (p?.event || p?.EVENT || "").toString().toUpperCase();
const getStatus = p =>
  (p?.data?.purchase?.status || p?.data?.subscription?.status || p?.purchase?.status || "")
    .toString()
    .toUpperCase();
const getEmail = p => p?.data?.buyer?.email || p?.buyer?.email || p?.email || "";
const getName = p => (p?.data?.buyer?.name || p?.buyer?.name || "").toString();
const getTx = p => p?.data?.purchase?.transaction || p?.purchase?.transaction || "";

function getProductId(payload) {
  const pid =
    payload?.data?.product?.id ??
    payload?.product?.id ??
    payload?.data?.content?.products?.[0]?.id;
  return typeof pid === "string" ? parseInt(pid, 10) : pid;
}

/** Painel OS: pagamento único → vitalício no Airtable (mesmo esquema da tabela licenses). */
function resolvePlanType() {
  return "vitalicio";
}

function isAllowedProduct(payload) {
  if (!OS_PRODUCT_IDS.length) return true;
  const id = getProductId(payload);
  if (!Number.isFinite(id)) return false;
  return OS_PRODUCT_IDS.includes(id);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      return res.status(200).json({ ok: true, msg: "webhook-hotmart up" });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, msg: "Method not allowed" });
    }

    const tok = req.headers["x-hotmart-hottok"];
    if (!tok || tok !== HOTMART_HOTTOK) {
      return res.status(401).json({ ok: false, msg: "Invalid hottok" });
    }

    const payload = req.body || {};
    const event = getEvent(payload);
    const status = getStatus(payload);
    const email = getEmail(payload);
    const name = getName(payload);
    const tx = (getTx(payload) || "").toString();

    if (!email) {
      return res.status(200).json({ ok: true, msg: "No buyer email; ack only", event, status });
    }

    const approved =
      event === "PURCHASE_APPROVED" || status === "APPROVED" || status === "ACTIVE";
    const negative =
      ["PURCHASE_CANCELLED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"].includes(event) ||
      ["CANCELLED", "CHARGEBACK", "REFUNDED", "EXPIRED", "OVERDUE", "INACTIVE"].includes(status);

    if ((approved || negative) && !isAllowedProduct(payload)) {
      return res.status(200).json({
        ok: true,
        msg: "ignored product",
        product_id: getProductId(payload) ?? null
      });
    }

    const b = base();
    if (!b) {
      return res.status(200).json({ ok: true, msg: "ack without airtable", event, status, email });
    }

    const emailNorm = email.toString().toLowerCase();
    const emailEsc = emailNorm.replace(/'/g, "\\'");
    const formula = `LOWER({email})='${emailEsc}'`;
    const recs = await b(AIRTABLE_TABLE).select({ filterByFormula: formula, maxRecords: 10 }).firstPage();

    const chooseTarget = rows => {
      if (!rows || !rows.length) return null;
      const trial = rows.find(
        r => String(r.get("plan_type") || "").toLowerCase() === "trial7" && !r.get("blocked")
      );
      if (trial) return trial;
      const unblocked = rows.find(r => !r.get("blocked"));
      return unblocked || rows[0];
    };

    if (tx && recs.length && recs.some(r => (r.get("last_transaction") || "") === tx)) {
      return res.status(200).json({ ok: true, action: "noop_already_processed", email, tx });
    }

    const now = new Date();
    const planTypeComputed = resolvePlanType();

    if (approved) {
      const target = chooseTarget(recs);

      if (target) {
        const existingCode = (target.get("code") || "").toString().trim();
        const code = existingCode ? existingCode : genCode("OS");
        const currentPlan = (target.get("plan_type") || "").toString().toLowerCase();
        const isAlreadyVitalicio = currentPlan === "vitalicio";
        const finalPlan = isAlreadyVitalicio ? "vitalicio" : planTypeComputed;

        const fieldsToUpdate = {
          code,
          plan_type: finalPlan,
          name: name || target.get("name") || "",
          blocked: false,
          flagged: false,
          MaxDevices: 5,
          last_transaction: tx || target.get("last_transaction") || "",
          last_event_at: now.toISOString()
        };

        if (finalPlan === "mensal") {
          const prev = target.get("expires_at") ? new Date(target.get("expires_at")) : now;
          const baseDate = prev > now ? prev : now;
          fieldsToUpdate.expires_at = toDateOnly(addDays(baseDate, 30));
        } else {
          fieldsToUpdate.expires_at = null;
        }

        await b(AIRTABLE_TABLE).update(target.id, fieldsToUpdate);
        return res.status(200).json({
          ok: true,
          action: "updated",
          email,
          code,
          plan_type: finalPlan,
          expires_at: fieldsToUpdate.expires_at || "",
          tx
        });
      }

      const code = genCode("OS");
      const fields = {
        email,
        name: name || "",
        code,
        plan_type: planTypeComputed,
        use_count: 0,
        blocked: false,
        flagged: false,
        MaxDevices: 5,
        last_transaction: tx || "",
        last_event_at: now.toISOString()
      };
      if (planTypeComputed === "mensal") {
        fields.expires_at = toDateOnly(addDays(now, 30));
      } else {
        fields.expires_at = null;
      }

      await b(AIRTABLE_TABLE).create(fields);
      return res.status(200).json({
        ok: true,
        action: "created",
        email,
        code,
        plan_type: planTypeComputed,
        expires_at: fields.expires_at || "",
        tx
      });
    }

    if (negative) {
      if (recs.length) {
        const target = chooseTarget(recs);
        await b(AIRTABLE_TABLE).update(target.id, {
          blocked: true,
          flagged: true,
          last_transaction: tx || target.get("last_transaction") || "",
          last_event_at: now.toISOString()
        });
      }
      return res.status(200).json({
        ok: true,
        action: "deactivated_blocked",
        email,
        event,
        status,
        tx
      });
    }

    return res.status(200).json({ ok: true, msg: "event ignored", event, status, tx });
  } catch (e) {
    console.error("webhook-hotmart error:", e);
    return res.status(200).json({ ok: true, msg: "ack with error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
