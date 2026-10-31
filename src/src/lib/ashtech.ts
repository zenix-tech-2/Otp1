import "server-only";
import { AppError, IS_DEMO } from "./server";
import type { CryptoAsset, PaymentCatalog, PaymentCountry } from "./payment-types";
export type ProviderObject = Record<string, unknown>;
export function object(value: unknown): ProviderObject { return value && typeof value === "object" && !Array.isArray(value) ? value as ProviderObject : {}; }
export function unwrapAshtech(value: unknown): unknown { const body = object(value); return body.transaction ?? body.data ?? value; }
export class AshtechError extends AppError { constructor(message: string, status: number, public code: string, public uncertain = false) { super(message, status); } }
export function paymentConfigured() { return Boolean(process.env.ASHTECH_API_KEY?.startsWith("ak_") && process.env.ASHTECH_USER_ID && process.env.ASHTECH_WEBHOOK_SECRET && process.env.APP_URL?.startsWith("https://")); }
export function merchantId() { if (!process.env.ASHTECH_USER_ID) throw new AppError("The payment merchant is not configured yet.", 503); return process.env.ASHTECH_USER_ID; }
export function notifyUrl() {
  const base = process.env.APP_URL; if (!base) throw new AppError("The store’s public payment callback URL is not configured.", 503);
  const url = new URL(base); if (url.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) throw new AppError("Payments require a public HTTPS store URL.", 503);
  return new URL("/api/webhooks/ashtechpay", url.origin).toString();
}
export async function ashtechRequest(path: string, options: { method?: "GET" | "POST"; body?: unknown; cache?: boolean } = {}) {
  const key = process.env.ASHTECH_API_KEY;
  if (!key?.startsWith("ak_")) throw new AshtechError("Ashtech Pay is not connected yet. The store needs its server-side Direct API key.", 503, "not_configured");
  if (IS_DEMO && options.method === "POST") throw new AshtechError("Real payment creation is disabled in sandbox mode.", 403, "sandbox_mode");
  const base = (process.env.ASHTECH_BASE_URL || "https://www.ashtechpay.com/v1").replace(/\/$/, "");
  if (!base.startsWith("https://") && process.env.NODE_ENV !== "test") throw new AppError("The payment API must use HTTPS.", 503);
  let response: Response;
  try { response = await fetch(`${base}${path}`, { method: options.method || "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(15000), ...(options.cache ? { next: { revalidate: 300 } } : { cache: "no-store" as const }) }); }
  catch { throw new AshtechError("We couldn’t confirm the provider’s response. This payment is saved for reconciliation; please don’t start another charge.", 502, "network_error", true); }
  let raw: unknown; try { raw = await response.json(); } catch { throw new AshtechError("The payment provider returned an unreadable response. Your payment needs verification.", 502, "invalid_response", true); }
  const data = object(unwrapAshtech(raw)); const code = String(data.error ?? object(raw).error ?? "");
  if (response.status === 400 && code === "otp_required") return { ...data, error: "otp_required" };
  if (!response.ok || (code && code !== "otp_required")) {
    const messages: Record<string, string> = { invalid_otp: "That payment OTP is incorrect. Please try again.", otp_expired: "Your payment OTP session has expired. Start a new payment only after checking this attempt’s status.", otp_confirmation_in_progress: "Your OTP is already being confirmed. Please wait before trying again.", api_not_enabled: "Ashtech Pay Direct API access is not enabled for this merchant.", unauthorized: "The payment provider credentials need to be checked by the store.", reference_conflict: "This payment reference is already in use. Please check its saved status." };
    throw new AshtechError(messages[code] || (response.status === 429 ? "The provider is busy. Please wait a moment and check the payment status." : "The payment provider could not accept this request. Check your details or contact support."), response.status === 429 ? 429 : response.status >= 500 ? 502 : 400, code || `http_${response.status}`, response.status >= 500 || response.status === 409 || response.status === 429);
  }
  return raw;
}
const englishNames = new Intl.DisplayNames(["en"], { type: "region" });
export function normalizeCountries(payload: unknown): PaymentCountry[] {
  const data = unwrapAshtech(payload); const list = Array.isArray(data) ? data : object(data).countries;
  if (!Array.isArray(list)) throw new AppError("The provider’s country catalog is temporarily unavailable.", 502);
  const result = list.map(item => { const row = object(item); const code = String(row.code || "").toUpperCase(); const currency = String(row.currency || "").toUpperCase(); const name = /^[A-Z]{2}$/.test(code) ? englishNames.of(code) || String(row.name || code) : String(row.name || code); const operators = Array.isArray(row.operators) ? row.operators.filter((o): o is string => typeof o === "string" && o.length > 0) : []; return { code, name, currency, operators, active: row.active !== false }; }).filter(c => c.active && /^[A-Z]{2}$/.test(c.code) && /^[A-Z]{3}$/.test(c.currency) && c.operators.length > 0);
  return result.map(({ active: _active, ...country }) => country).sort((a,b) => a.name.localeCompare(b.name));
}
// Explicitly fictional preview fixtures based on the documentation examples, NEVER a production fallback.
const demoCountries: PaymentCountry[] = [
  { code: "CM", name: "Cameroon", currency: "XAF", operators: ["MTN Money", "Orange Money"] },
  { code: "CI", name: "Côte d’Ivoire", currency: "XOF", operators: ["Orange Money", "MTN Money", "Moov Money", "Wave"] },
  { code: "SN", name: "Senegal", currency: "XOF", operators: ["Orange Money", "Wave", "Free Money"] },
  { code: "TG", name: "Togo", currency: "XOF", operators: ["Flooz (Moov)", "Mixx By Yas"] },
  { code: "GH", name: "Ghana", currency: "GHS", operators: ["MTN Mobile Money", "Vodafone Cash", "AirtelTigo Money"] },
  { code: "NG", name: "Nigeria", currency: "NGN", operators: ["OPay", "PalmPay", "Paga"] },
  { code: "KE", name: "Kenya", currency: "KES", operators: ["M-Pesa", "Airtel Money"] },
];
export async function getPaymentCountries(fresh = false): Promise<PaymentCatalog> {
  if (IS_DEMO && !process.env.ASHTECH_API_KEY) return { countries: demoCountries, source: "sandbox", available: true, message: "Preview countries and operators. Live availability is loaded from Ashtech Pay after connection." };
  const countries = normalizeCountries(await ashtechRequest("/countries", { cache: !fresh }));
  return { countries, source: "live", available: true };
}
export async function resolveSignupCountry(code: string) {
  if (code === "OTHER") return { countryCode: "OTHER", countryName: "Other", currency: "USD" };
  const catalog = await getPaymentCountries(); const selected = catalog.countries.find(c => c.code === code);
  if (!selected) throw new AppError("Please select an available payment country or choose Other (USD).", 422);
  return { countryCode: selected.code, countryName: selected.name, currency: selected.currency };
}
export async function getCryptoAssets(): Promise<CryptoAsset[]> {
  if (IS_DEMO) return [{ code: "USDT.TRC20", name: "USDT", network: "TRC20" }];
  const data = unwrapAshtech(await ashtechRequest("/crypto/assets", { cache: true })); const list = Array.isArray(data) ? data : object(data).assets;
  if (!Array.isArray(list)) throw new AppError("Crypto payment networks are temporarily unavailable.", 502);
  return list.map(item => { const row = object(item); return { code: String(row.asset_code ?? row.code ?? ""), name: String(row.name ?? row.currency ?? "USDT"), network: String(row.network ?? ""), active: row.active !== false && row.enabled !== false }; }).filter(a => a.active && /^USDT[._-]/i.test(a.code) && a.network).map(({ active: _active, ...a }) => a);
}
export function isSimulation(data: ProviderObject) { return data.sandbox === true || data.simulation === true || data.status === "sandbox_test" || data.history_status === "sandbox_test"; }
export function safeProviderUrl(value: unknown) { if (typeof value !== "string") return undefined; try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) return undefined; return url.toString(); } catch { return undefined; } }
