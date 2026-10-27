import "server-only";
// Minimal Web Push sender (RFC 8030 + VAPID RFC 8292 + aes128gcm payload encryption RFC 8291) using only node:crypto, so no extra package is required.
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";
const b64u = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64u = (text: string) => Buffer.from(text, "base64url");
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body?: string; url?: string; tag?: string };
export function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim(); const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.SUPPORT_EMAIL || "support@example.com"}` };
}
export const pushConfigured = () => vapidConfig() !== null;
function vapidJwt(audience: string, config: NonNullable<ReturnType<typeof vapidConfig>>) {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }))); const claims = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: config.subject })));
  const pub = fromB64u(config.publicKey); const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: config.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64u(signature)}`;
}
/** Encrypts a payload for one subscription. Exported for tests. */
export function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, payload: Buffer, salt = randomBytes(16), ephemeral?: ReturnType<typeof createECDH>) {
  if (!ephemeral) { ephemeral = createECDH("prime256v1"); ephemeral.generateKeys(); }
  const uaPublic = fromB64u(target.p256dh); const authSecret = fromB64u(target.auth); const asPublic = ephemeral.getPublicKey();
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) throw new Error("Invalid push subscription keys.");
  const shared = ephemeral.computeSecret(uaPublic);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(65, 20);
  return Buffer.concat([header, asPublic, encrypted]);
}
export type PushResult = "sent" | "gone" | "failed" | "disabled";
export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  const config = vapidConfig(); if (!config) return "disabled";
  let url: URL; try { url = new URL(target.endpoint); } catch { return "gone"; }
  if (url.protocol !== "https:") return "gone";
  try {
    const body = encryptPayload(target, Buffer.from(JSON.stringify({ title: message.title.slice(0, 120), body: (message.body || "").slice(0, 300), url: message.url || "/notifications", tag: message.tag })));
    const response = await fetch(target.endpoint, { method: "POST", headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal", Authorization: `vapid t=${vapidJwt(url.origin, config)}, k=${config.publicKey}` }, body: new Uint8Array(body), signal: AbortSignal.timeout(8000) });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch { return "failed"; }
}
