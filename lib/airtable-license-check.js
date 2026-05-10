// Lógica compartilhada com o Método Baratieri (api/check-license): Airtable + expiração + trial7 + bloqueio.
import Airtable from "airtable";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID;
const AIRTABLE_KEY = process.env.AIRTABLE_KEY || process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "licences_os";

function getBase() {
  if (!AIRTABLE_KEY || !AIRTABLE_BASE) return null;
  return new Airtable({ apiKey: AIRTABLE_KEY }).base(AIRTABLE_BASE);
}

function isNotExpired(dateOnlyStr) {
  if (!dateOnlyStr) return false;
  const [y, m, d] = String(dateOnlyStr).split("-").map(Number);
  if (!y || !m || !d) return false;
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return new Date() <= end;
}

function toDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function escapeFormulaString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * @param {string} license_keyRaw
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function evaluateLicenseKey(license_keyRaw) {
  const license_key = String(license_keyRaw || "").trim();
  if (!license_key) {
    return { status: 400, body: { ok: false, msg: "license_key required" } };
  }

  const base = getBase();
  if (!base) {
    return { status: 503, body: { ok: false, msg: "server_misconfigured" } };
  }

  const keyEsc = escapeFormulaString(license_key);
  const server_time = new Date().toISOString();

  try {
    let recs = await base(AIRTABLE_TABLE)
      .select({
        filterByFormula: `{code} = "${keyEsc}"`
      })
      .all();

    if (!recs.length) {
      recs = await base(AIRTABLE_TABLE)
        .select({
          filterByFormula: `{license_key} = "${keyEsc}"`
        })
        .all();
    }

    if (!recs.length) {
      return { status: 404, body: { ok: false, msg: "license_not_found" } };
    }

    const r = recs[0];
    const plan_type = String(r.get("plan_type") || "").toLowerCase();
    let expires_at = r.get("expires_at");
    const flagged = !!r.get("flagged");
    const blocked = !!r.get("blocked");

    if (plan_type === "trial7" && !expires_at) {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const endStr = toDateOnly(end);
      try {
        await base(AIRTABLE_TABLE).update(r.id, { expires_at: endStr });
        expires_at = endStr;
      } catch (e) {
        console.warn("trial7 activate failed:", e);
      }
    }

    if (blocked) {
      return {
        status: 200,
        body: {
          ok: false,
          msg: "blocked",
          plan_type,
          expires_at: expires_at || null,
          flagged,
          server_time
        }
      };
    }

    if (plan_type === "vitalicio") {
      return {
        status: 200,
        body: {
          ok: true,
          plan_type: "vitalicio",
          expires_at: null,
          grace_days: 5,
          flagged,
          server_time
        }
      };
    }

    if (!isNotExpired(expires_at)) {
      return {
        status: 200,
        body: {
          ok: false,
          msg: "expired",
          plan_type: plan_type || "mensal",
          expires_at: expires_at || null,
          flagged,
          server_time
        }
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        plan_type: plan_type || "mensal",
        expires_at,
        grace_days: 5,
        flagged,
        server_time
      }
    };
  } catch (e) {
    console.error("evaluateLicenseKey error:", e);
    return { status: 200, body: { ok: false, msg: "server_error", server_time } };
  }
}
