// Compat: validação real é /api/check-license + código em localStorage (modelo Método).
// POST { license_key } delega para a mesma regra do Airtable.
import { evaluateLicenseKey } from "../lib/airtable-license-check.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    return res.status(200).json({ ok: true, msg: "up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "method_not_allowed" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const license_key = body.license_key || body.code;
  if (!license_key) {
    return res.status(400).json({ ok: false, msg: "license_key required" });
  }

  const { status, body: out } = await evaluateLicenseKey(String(license_key).trim());
  const ok = status === 200 && out.ok === true;
  return res.status(200).json({ ok, ...out });
}

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } }
};
