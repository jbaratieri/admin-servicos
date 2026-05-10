import { evaluateLicenseKey } from "../lib/airtable-license-check.js";

function parseCodes() {
  const list = process.env.OS_ACCESS_CODES || "";
  const single = process.env.OS_ACCESS_CODE || "";
  const raw = [list, single].filter(Boolean).join(",");
  const out = raw
    .split(/[,;\n\r]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(out)];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    return res.status(200).json({ ok: true, msg: "up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "method_not_allowed" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ ok: false, msg: "invalid_code" });
  }

  const envCodes = parseCodes();
  if (envCodes.length && envCodes.includes(code)) {
    return res.status(200).json({
      ok: true,
      plan_type: "vitalicio",
      expires_at: null,
      grace_days: 5,
      bypass: "env_code",
      server_time: new Date().toISOString()
    });
  }

  const { status, body: out } = await evaluateLicenseKey(code);

  if (status === 503) {
    return res.status(503).json(out);
  }
  if (status === 400) {
    return res.status(400).json(out);
  }
  if (status === 404) {
    return res.status(401).json({ ok: false, msg: "license_not_found" });
  }

  if (out.ok === true) {
    return res.status(200).json(out);
  }

  const msg = out.msg || "invalid_code";
  const http = msg === "blocked" || msg === "expired" ? 403 : 401;
  return res.status(http).json({ ok: false, msg, ...out });
}

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } }
};
