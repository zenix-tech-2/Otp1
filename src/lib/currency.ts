// Shared, deterministic minor-unit arithmetic. Never treat all currencies as cents.
export type CurrencyQuote = { currency: string; usdRate: string; asOf: string; source: "exchange-rate-api" | "configured" | "sandbox" | "base" };
const SCALE = BigInt(100000000);
export function currencyDigits(currency: string) {
  if (currency === "USDT") return 2; // Merchant requests denominated in whole USDT cents; provider network amounts remain exact strings.
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
export function currencyFactor(currency: string) { return 10 ** currencyDigits(currency); }
export function formatMoney(minor: number, currency = "USD") {
  if (currency === "USDT") return `${(minor / 100).toFixed(2)} USDT`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: currency === "USD" ? "symbol" : "code" }).format(minor / currencyFactor(currency));
}
export function majorToMinor(input: string | number, currency: string): number {
  const text = String(input).trim(); const digits = currencyDigits(currency);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a positive amount using digits and a decimal point.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.slice(digits).replace(/0/g, "")) throw new Error(`${currency} accepts ${digits} decimal places.`);
  const value = BigInt(whole) * BigInt(currencyFactor(currency)) + BigInt((fraction.slice(0, digits).padEnd(digits, "0")) || "0");
  if (value > BigInt(2000000000)) throw new Error("This amount is too large.");
  return Number(value);
}
export function minorToMajor(minor: number, currency: string) { return (minor / currencyFactor(currency)).toFixed(currencyDigits(currency)); }
function scaledRate(quote: CurrencyQuote) { const number = Number(quote.usdRate); if (!Number.isFinite(number) || number <= 0 || number > 1000000) throw new Error("Invalid conversion rate."); return BigInt(Math.round(number * 100000000)); }
function bounded(number: bigint) { if (number < BigInt(0) || number > BigInt(2000000000)) throw new Error("The converted amount is outside the supported range."); return Number(number); }
export function fromUsd(usdCents: number, quote: CurrencyQuote) {
  if (!Number.isSafeInteger(usdCents) || usdCents < 0) throw new Error("Invalid base amount.");
  const numerator = BigInt(usdCents) * scaledRate(quote) * BigInt(currencyFactor(quote.currency)); const denominator = BigInt(100) * SCALE;
  return bounded((numerator + denominator - BigInt(1)) / denominator);
}
export function toUsd(localMinor: number, quote: CurrencyQuote) { const numerator = BigInt(localMinor) * BigInt(100) * SCALE; const denominator = scaledRate(quote) * BigInt(currencyFactor(quote.currency)); return bounded((numerator + denominator / BigInt(2)) / denominator); }
export function convertMinor(amount: number, source: CurrencyQuote, destination: CurrencyQuote) {
  if (source.currency === destination.currency) return amount;
  const numerator = BigInt(amount) * scaledRate(destination) * BigInt(currencyFactor(destination.currency)); const denominator = scaledRate(source) * BigInt(currencyFactor(source.currency));
  return bounded((numerator + denominator - BigInt(1)) / denominator);
}
export function baseOrderAmount(order: { amount: number; currency?: string; baseAmount?: number | null }) { return order.baseAmount ?? (!order.currency || order.currency === "USD" ? order.amount : 0); }
