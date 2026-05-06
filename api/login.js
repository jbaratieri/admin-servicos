import crypto from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function issueSessionToken(secret) {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const sig = crypto.createHmac("sha256", secret).update(`${exp}|${nonce}`).digest("hex");
  return `${exp}.${nonce}.${sig}`;
}

function parseCodes() {
  const raw = process.env.OS_ACCESS_CODES || "";
  return raw
    .split(/[,;\n\r]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    return res.status(200).json({ ok: true, msg: "up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "method_not_allowed" });
  }

  const codes = parseCodes();
  if (!codes.length) {
    return res.status(503).json({ ok: false, msg: "server_misconfigured" });
  }

  const secret = process.env.OS_SESSION_SECRET || "";
  if (secret.length < 24) {
    return res.status(503).json({ ok: false, msg: "server_misconfigured" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const code = String(body.code || "").trim().toUpperCase();
  if (!code || !codes.includes(code)) {
    return res.status(401).json({ ok: false, msg: "invalid_code" });
  }

  const token = issueSessionToken(secret);
  return res.status(200).json({ ok: true, token });
}

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } }
};
