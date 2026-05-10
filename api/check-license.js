// Valida licença no Airtable (tabela licences_os). Mesmo contrato do Método Baratieri.
import { evaluateLicenseKey } from "../lib/airtable-license-check.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    return res.status(200).json({ ok: true, msg: "check-license up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Method not allowed" });
  }

  const { license_key } = req.body || {};
  const { status, body } = await evaluateLicenseKey(license_key);
  return res.status(status).json(body);
}

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
