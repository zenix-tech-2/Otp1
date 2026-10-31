import { createHmac, timingSafeEqual } from "node:crypto";
import { majorToMinor } from "./currency";
export function verifyAshtechSignature(raw: string, timestamp: string, signature: string, secret: string, now = Date.now()) {
  if (!/^\d{10,13}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const seconds = Number(timestamp); if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  return Buffer.byteLength(signature) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}
export function verifyTransactionFields(expected: { providerId: string; merchantReference: string; providerReference: string | null; otpReference: string | null; amount: number; currency: string; countryCode: string; method: string; merchantId: string }, data: Record<string, unknown>) {
  if (data.sandbox === true || data.simulation === true || data.status === "sandbox_test" || data.history_status === "sandbox_test") throw new Error("Provider simulation cannot credit a real wallet.");
  const id = String(data.transaction_id ?? data.id ?? ""); if (id !== expected.providerId) throw new Error("Transaction ID mismatch.");
  const references = [data.merchant_reference, data.reference].filter((r): r is string => typeof r === "string");
  const accepted = [expected.merchantReference, expected.providerReference, expected.otpReference].filter(Boolean);
  if (!references.some(r => accepted.includes(r))) throw new Error("Merchant reference mismatch or missing reference.");
  if (data.merchant_reference && ![expected.merchantReference, expected.otpReference].includes(String(data.merchant_reference))) throw new Error("Merchant reference does not belong to this payment.");
  if (String(data.currency || "").toUpperCase() !== expected.currency) throw new Error("Payment currency mismatch.");
  const amount = majorToMinor(String(data.amount ?? ""), expected.currency); if (amount !== expected.amount) throw new Error("Payment amount mismatch.");
  if (data.user_id != null && String(data.user_id) !== expected.merchantId) throw new Error("Payment merchant mismatch.");
  const country = data.country_code ?? data.country; if (typeof country === "string" && country.toUpperCase() !== expected.countryCode) throw new Error("Payment country mismatch.");
  const status = String(data.status || "").toLowerCase();
  if (status === "success" || status === "completed") return "completed";
  if (["failed", "cancelled", "canceled", "expired"].includes(status)) return status === "canceled" ? "cancelled" : status;
  return "pending";
}
