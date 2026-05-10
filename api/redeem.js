// Recupera código de licença pelo e-mail (fluxo “Resgatar”) — tabela AIRTABLE_TABLE (licences_os).
import Airtable from "airtable";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID;
const AIRTABLE_KEY = process.env.AIRTABLE_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "licences_os";

function base() {
  if (!AIRTABLE_BASE || !AIRTABLE_KEY) return null;
  return new Airtable({ apiKey: AIRTABLE_KEY }).base(AIRTABLE_BASE);
}

function normEmail(s = "") {
  return String(s).trim().toLowerCase();
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      return res.status(200).json({ ok: true, msg: "redeem up" });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, msg: "Method not allowed" });
    }

    const emailRaw = req.body?.email || "";
    const email = normEmail(emailRaw);
    if (!email) return res.status(400).json({ ok: false, msg: "email required" });

    const b = base();
    if (!b) return res.status(200).json({ ok: false, msg: "airtable env missing" });

    const emailEsc = email.replace(/'/g, "\\'");
    const recs = await b(AIRTABLE_TABLE)
      .select({
        filterByFormula: `LOWER({email})='${emailEsc}'`
      })
      .all();

    if (!recs.length) {
      return res.status(200).json({ ok: false, msg: "not_found" });
    }

    function getExp(r) {
      const v = r.get("expires_at");
      if (!v) return 0;
      const t = new Date(v).getTime();
      return isFinite(t) ? t : 0;
    }
    recs.sort((a, b) => {
      const da = getExp(a);
      const db = getExp(b);
      if (db !== da) return db - da;
      const ca = new Date(a._rawJson?.createdTime || 0).getTime();
      const cb = new Date(b._rawJson?.createdTime || 0).getTime();
      return cb - ca;
    });

    const candidates = recs.filter(r => (r.get("code") || "").toString().trim());
    const firstUnblocked = candidates.find(r => !r.get("blocked"));
    const r = firstUnblocked || candidates[0] || recs[0];

    const code = (r.get("code") || "").toString().trim();
    if (!code) {
      return res.status(200).json({ ok: false, msg: "no_code" });
    }

    const plan_type = (r.get("plan_type") || "").toString().toLowerCase();
    const expires_at = r.get("expires_at") || null;
    const blocked = !!r.get("blocked");

    if (blocked) {
      return res.status(200).json({ ok: false, msg: "blocked" });
    }

    return res.status(200).json({
      ok: true,
      email,
      code,
      plan_type,
      expires_at
    });
  } catch (e) {
    console.error("redeem error:", e);
    return res.status(200).json({ ok: false, msg: "server_error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
