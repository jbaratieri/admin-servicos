import crypto from "node:crypto";

function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expN = Number(exp);
  if (!Number.isFinite(expN) || Date.now() > expN) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${exp}|${nonce}`).digest("hex");
  if (typeof sig !== "string" || sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    return res.status(200).json({ ok: true, msg: "up" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "method_not_allowed" });
  }

  const secret = process.env.OS_SESSION_SECRET || "";
  if (secret.length < 24) {
    return res.status(503).json({ ok: false, msg: "server_misconfigured" });
  }

  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const ok = verifySessionToken(body.token, secret);
  return res.status(200).json({ ok });
}

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } }
};
