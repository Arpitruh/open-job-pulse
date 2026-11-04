import crypto from "crypto";

export const LINK_COOKIE = "ojp-linkedin-link";
const TTL = 5 * 60 * 1000;

function signature(payload: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createLinkIntent(userId: string) {
  const payload = Buffer.from(JSON.stringify({
    userId, expires: Date.now() + TTL, nonce: crypto.randomBytes(16).toString("hex"),
  })).toString("base64url");
  return payload + "." + signature(payload);
}

export function verifyLinkIntent(value?: string): string | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac || !/^[a-f0-9]{64}$/.test(mac)) return null;
  const expected = signature(payload);
  if (!crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || !data.userId || typeof data.expires !== "number" || data.expires < Date.now()) return null;
    return data.userId;
  } catch { return null; }
}
