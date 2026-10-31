import "server-only";
import { AppError } from "./server";
import { extractCode } from "./tempmail-core";
import { NUMBER_PROVIDERS, numberProviderLabel, type FreeCountry, type FreeMessage, type FreeNumber, type NumberProviderId, type NumberProviderOption } from "./tempnumbers-core";

// One adapter per upstream service. The free numbers are public and read-only, so nothing is stored per customer.
type J = Record<string, unknown>;
interface FreeAdapter {
  countries(): Promise<FreeCountry[]>;
  numbers(country: string): Promise<FreeNumber[]>;
  messages(country: string, number: string, limit: number): Promise<FreeMessage[]>;
}
const busy = () => new AppError("Free numbers are busy right now. Try again in a moment.", 502);
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const o = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Small in-memory cache so many customers watching the same number don't each hit the upstream API.
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key); if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load(); cache.set(key, { at: Date.now(), value });
  if (cache.size > 400) for (const [k, v] of cache) if (Date.now() - v.at > 120_000) cache.delete(k);
  return value;
}

// ── Number V1 · OnlineSim free numbers ─────────────────────────────────────────
async function onlinesim(params: Record<string, string>): Promise<J> {
  const url = new URL("https://onlinesim.io/api/getFreeList"); url.searchParams.set("lang", "en");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = process.env.ONLINESIM_API_KEY?.trim(); if (key) url.searchParams.set("apikey", key);
  let res: Response; try { res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json" } }); } catch { throw busy(); }
  if (!res.ok) throw busy(); let data: J; try { data = o(await res.json()); } catch { throw busy(); }
  // Errors arrive with HTTP 200 and a text code in `response`; success is the number 1.
  if (typeof data.response === "string") { if (data.response === "ERROR_NO_KEY" || data.response === "ERROR_WRONG_KEY") throw new AppError("This number source isn’t configured correctly.", 502); throw busy(); }
  return data;
}
const hash = (text: string) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const onlineSimV1: FreeAdapter = {
  countries: () => cached("v1:countries", 10 * 60_000, async () => arr((await onlinesim({})).countries).map(c => o(c)).filter(c => s(c.country) && s(c.country_text)).map(c => ({ id: s(c.country), name: s(c.country_text) })).sort((a, b) => a.name.localeCompare(b.name))),
  numbers: country => cached(`v1:numbers:${country}`, 60_000, async () => {
    const d = await onlinesim({ country }); const map = o(d.numbers);
    return Object.entries(map).map(([local, v]) => { const x = o(v); return { number: s(x.full_number) || `+${local}`, local, country, ago: s(x.data_humans), archived: x.is_archive === true }; }).filter(n => !n.archived);
  }),
  messages: (country, number, limit) => cached(`v1:messages:${country}:${number}:${limit}`, 6_000, async () => {
    const d = await onlinesim({ country, number, count: String(limit) }); const rows = arr(o(d.messages).data);
    return rows.map(m => { const x = o(m); const text = s(x.text); const created = s(x.created_at); return { id: `${hash(created + text)}-${created}`, from: s(x.in_number), text, ago: s(x.data_humans), code: extractCode(text) }; });
  }),
};

const adapters: Partial<Record<NumberProviderId, FreeAdapter>> = { v1: onlineSimV1 };
/** Versions that are built and switched on via TEMPNUMBERS_PROVIDERS (default: v1). */
export function enabledNumberProviders(): NumberProviderId[] {
  const wanted = (process.env.TEMPNUMBERS_PROVIDERS ?? "v1").split(",").map(x => x.trim().toLowerCase());
  return NUMBER_PROVIDERS.filter(id => wanted.includes(id) && adapters[id]);
}
export const numberProviderOptions = (): NumberProviderOption[] => enabledNumberProviders().map(id => ({ id, label: numberProviderLabel(id) }));
export function freeAdapter(id: string | null): { adapter: FreeAdapter; id: NumberProviderId } {
  const enabled = enabledNumberProviders(); const pick = id ? enabled.find(p => p === id) : enabled[0];
  if (!pick) throw new AppError("Temp numbers aren’t available right now. Please check back soon.", 503);
  return { adapter: adapters[pick]!, id: pick };
}
