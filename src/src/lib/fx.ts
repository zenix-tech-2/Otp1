import "server-only";
import { AppError, IS_DEMO } from "./server";
import type { CurrencyQuote } from "./currency";
const previewRates: Record<string, number> = { USD: 1, USDT: 1, XAF: 600, XOF: 600, GHS: 12, NGN: 1500, KES: 130, CDF: 2800, GNF: 8600, GMD: 72 };
export async function getCurrencyQuote(currency: string): Promise<CurrencyQuote> {
  if (currency === "USD" || currency === "USDT") return { currency, usdRate: "1", asOf: new Date().toISOString(), source: "base" };
  if (IS_DEMO && previewRates[currency]) return { currency, usdRate: String(previewRates[currency]), asOf: new Date().toISOString(), source: "sandbox" };
  if (process.env.STORE_FX_RATES) {
    let rates: Record<string, unknown>; try { rates = JSON.parse(process.env.STORE_FX_RATES); } catch { throw new AppError("Store conversion rates need configuration.", 503); }
    const rate = Number(rates[currency]); if (Number.isFinite(rate) && rate > 0 && rate <= 1000000) return { currency, usdRate: rate.toFixed(8), asOf: new Date().toISOString(), source: "configured" };
  }
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Rate service unavailable");
    const data = await response.json(); const rate = Number(data.rates?.[currency]); const updated = Number(data.time_last_update_unix);
    if (data.result !== "success" || data.base_code !== "USD" || !Number.isFinite(rate) || rate <= 0 || rate > 1000000 || !updated || Date.now() - updated * 1000 > 72 * 3600000) throw new Error("Missing or stale rate");
    return { currency, usdRate: rate.toFixed(8), asOf: new Date(updated * 1000).toISOString(), source: "exchange-rate-api" };
  } catch { throw new AppError(`We can’t confirm the ${currency} exchange rate right now. Your wallet is safe; please try again shortly.`, 503); }
}
export async function safeCurrencyQuote(currency: string) { try { return await getCurrencyQuote(currency); } catch { return null; } }
