import "server-only";
import { AppError, IS_DEMO } from "./server";
import { demoCountries, demoServices, serviceBrands, brandDomains } from "./catalog";
export type Service = { code: string; name: string; brand: string; logo?: string };
export type Country = { id: string; name: string; iso: string; cost: number; count: number; price: number; pool?: string };
export type Json = Record<string, unknown>;
export function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
export function unwrap(value: unknown): unknown { const r = record(value); return r.data ?? value; }
/** `uncertain`: we can't tell whether the provider created something. `retryable`: a network, timeout or 5xx failure that the provider documents as safe to retry. */
export class ProviderError extends AppError { constructor(message: string, status: number, public uncertain = false, public retryable = false) { super(message, status); } }
export async function providerRequest(path: string, options: { method?: string; body?: unknown; auth?: "account" | "public" | "subuser"; wait?: boolean; cache?: boolean; idempotencyKey?: string; timeoutMs?: number } = {}): Promise<unknown> {
  if (IS_DEMO) throw new AppError("Live NumberOTP requests are disabled in the sandbox. Set APP_MODE=live and configure your server credentials to connect.", 503);
  const base = (process.env.NUMBEROTP_BASE_URL || "https://api.numberotp.com/v1").replace(/\/$/, "");
  const auth = options.auth || "account";
  const key = auth === "subuser" ? process.env.NUMBEROTP_SUBUSER_API_KEY : process.env.NUMBEROTP_API_KEY;
  if (auth !== "public" && !key) throw new AppError("The SMS provider is not connected yet. Please contact store support.", 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method: options.method || "GET", headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(auth !== "public" ? { Authorization: `Bearer ${key}` } : {}), ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(options.timeoutMs ?? (options.wait ? 58000 : 20000)), ...(options.cache ? { next: { revalidate: 300 } } : { cache: "no-store" as const }) });
  } catch { throw new ProviderError("The provider could not be reached. If a number was being reserved, its status will be reconciled before funds are released.", 502, true, true); }
  let data: unknown;
  try { data = await response.json(); } catch { throw new ProviderError("The provider returned an unexpected response.", 502, true, true); }
  const result = record(data);
  if (!response.ok || result.success === false) {
    const message = typeof result.error === "string" ? result.error.slice(0, 300) : "The provider could not complete this request. Please try again.";
    throw new ProviderError(message, response.status === 429 ? 429 : response.status >= 500 ? 502 : 400, response.status >= 500, response.status >= 500);
  }
  return data;
}
/**
 * Places an order with the provider. NumberOTP documents 5xx errors as safe to retry and refunds unused numbers
 * automatically, so network errors, timeouts and 5xx answers are retried a couple of times before giving up.
 * Definite answers (out of stock, price cap, balance) are never retried.
 */
export async function providerOrder(path: string, body: unknown, idempotencyKey: string): Promise<unknown> {
  const pauses = [600, 1500];
  for (let attempt = 0; ; attempt++) {
    try { return await providerRequest(path, { method: "POST", body, idempotencyKey, timeoutMs: 12000 }); }
    catch (error) {
      if (!(error instanceof ProviderError && error.retryable) || attempt >= pauses.length) throw error;
      await new Promise(resolve => setTimeout(resolve, pauses[attempt]));
    }
  }
}
export async function listServices(country?: string): Promise<Service[]> {
  if (IS_DEMO) return demoServices;
  const data = unwrap(await providerRequest(`/public/services${country ? `?country=${encodeURIComponent(country)}` : ""}`, { auth: "public", cache: true }));
  const list = Array.isArray(data) ? data : record(data).services;
  if (!Array.isArray(list)) throw new AppError("Service information is temporarily unavailable.", 502);
  return list.map(item => { const r = record(item); const name = String(r.name || r.title || "Service"); const code = String(r.code || r.id || ""); const matched = Object.keys(brandDomains).find(b => name.toLowerCase().includes(b)); return { code, name, brand: serviceBrands[code] || matched || "generic" }; }).filter(s => s.code);
}
const isoNames = new Map<string, string>();
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) { const iso = String.fromCharCode(a, b); const name = displayNames.of(iso); if (name && name !== iso) isoNames.set(name.toLowerCase(), iso.toLowerCase()); }
function countryIso(name: string) { const text = name.toLowerCase(); if (text.includes("united states") || text.includes("usa")) return "us"; if (text.includes("united kingdom") || text === "england") return "gb"; if (text.includes("congo")) return "cd"; return isoNames.get(text) || ""; }
export async function rawPrices(service: string, country?: string, fresh = false) {
  return unwrap(await providerRequest(`/public/prices?service=${encodeURIComponent(service)}${country ? `&country=${encodeURIComponent(country)}` : ""}`, { auth: "public", cache: !fresh }));
}
export function extractPrice(prices: unknown, country: string, service: string) {
  const countries = record(prices); const row = record(record(countries[country])[service]);
  const cost = Number(row.cost ?? row.price); const count = Number(row.count ?? row.available ?? 0);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return { cost: Math.ceil(cost * 100), count: Number.isFinite(count) ? count : 0, pool: String(row.pool || "auto") };
}
export async function listCountries(service: string, markup: number): Promise<Country[]> {
  if (IS_DEMO) return demoCountries.map(c => ({ ...c, price: Math.ceil(c.cost * (1 + markup / 100)), pool: "auto" }));
  const [countryResponse, prices] = await Promise.all([providerRequest(`/public/countries?service=${encodeURIComponent(service)}`, { auth: "public", cache: true }), rawPrices(service)]);
  const data = unwrap(countryResponse); const list = Array.isArray(data) ? data : Object.values(record(data));
  return list.map(item => { const r = record(item); const id = String(r.id ?? r.code ?? ""); const name = String(r.eng ?? r.name ?? r.country ?? "Unknown"); const price = extractPrice(prices, id, service); return { id, name, iso: countryIso(name), cost: price?.cost ?? 0, count: price?.count ?? 0, price: price ? Math.ceil(price.cost * (1 + markup / 100)) : 0, pool: price?.pool || "auto" }; }).filter(c => c.id).sort((a,b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.name.localeCompare(b.name));
}
export async function getQuote(service: string, country: string, markup: number): Promise<Country> {
  if (IS_DEMO) { const c = demoCountries.find(c => c.id === country); if (!c || !demoServices.some(s => s.code === service)) throw new AppError("Choose a valid service and country."); return { ...c, price: Math.ceil(c.cost * (1 + markup / 100)), pool: "auto" }; }
  const p = extractPrice(await rawPrices(service, country, true), country, service);
  if (!p || p.count <= 0) throw new AppError("This number is currently out of stock. Please choose another country.", 409);
  return { id: country, name: country, iso: "", ...p, price: Math.ceil(p.cost * (1 + markup / 100)) };
}

// ---------- Long-term rentals (NumberOTP /public/rent-prices and /rentals) ----------
// Durations the provider accepts: 2, 4, 12 hours, or multiples of 24 up to 720 (30 days).
export const RENT_HOURS = [2, 4, 12, 24, 48, 72, 96, 120, 144, 168, 336, 504, 720];
export type RentOption = { hours: number; cost: number; price: number; count: number };
export type RentCountry = { id: string; name: string; iso: string; options: RentOption[] };
export function rentLabel(hours: number) { return hours < 24 ? `${hours} hours` : hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hours`; }
// Sandbox pricing: a simple multiple of the one-time price so the flow can be previewed.
function demoRentCost(base: number, hours: number) { return Math.max(1, Math.round(base * (hours < 24 ? 3 + hours / 4 : 6 + (hours / 24) * 4))); }
export async function rawRentPrices(service: string, fresh = false) {
  return unwrap(await providerRequest(`/public/rent-prices?service=${encodeURIComponent(service)}`, { auth: "public", cache: !fresh }));
}
export function extractRentOption(prices: unknown, country: string, hours: number) {
  const row = record(record(record(prices)[country])[String(hours)]);
  const cost = Number(row.cost ?? row.price); const count = Number(row.count ?? row.available ?? 0);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return { cost: Math.ceil(cost * 100), count: Number.isFinite(count) ? count : 0 };
}
export async function listRentCountries(service: string, markup: number): Promise<RentCountry[]> {
  if (IS_DEMO) {
    if (!demoServices.some(s => s.code === service)) return [];
    return demoCountries.map(c => ({ id: c.id, name: c.name, iso: c.iso, options: [24, 72, 168, 720].map(hours => { const cost = demoRentCost(c.cost, hours); return { hours, cost, price: Math.ceil(cost * (1 + markup / 100)), count: Math.max(1, Math.floor(c.count / 20)) }; }) }));
  }
  const [countryResponse, prices] = await Promise.all([providerRequest(`/public/countries?service=${encodeURIComponent(service)}`, { auth: "public", cache: true }), rawRentPrices(service)]);
  const countryData = unwrap(countryResponse); const list = Array.isArray(countryData) ? countryData : Object.values(record(countryData));
  const names = new Map<string, string>(); for (const item of list) { const r = record(item); names.set(String(r.id ?? r.code ?? ""), String(r.eng ?? r.name ?? r.country ?? "")); }
  const result: RentCountry[] = [];
  for (const [id, byHours] of Object.entries(record(prices))) {
    const options: RentOption[] = [];
    for (const [hoursKey, value] of Object.entries(record(byHours))) {
      const hours = Number(hoursKey); const row = record(value); const cost = Number(row.cost ?? row.price); const count = Number(row.count ?? row.available ?? 0);
      if (!RENT_HOURS.includes(hours) || !Number.isFinite(cost) || cost < 0) continue;
      const cents = Math.ceil(cost * 100); options.push({ hours, cost: cents, price: Math.ceil(cents * (1 + markup / 100)), count: Number.isFinite(count) ? count : 0 });
    }
    if (!options.length) continue;
    const name = names.get(id) || `Country ${id}`;
    result.push({ id, name, iso: countryIso(name), options: options.sort((a, b) => a.hours - b.hours) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
export async function getRentQuote(service: string, country: string, hours: number, markup: number) {
  if (!RENT_HOURS.includes(hours)) throw new AppError("Choose a valid rental duration.");
  if (IS_DEMO) {
    const c = demoCountries.find(c => c.id === country); if (!c || !demoServices.some(s => s.code === service)) throw new AppError("Choose a valid service and country.");
    const cost = demoRentCost(c.cost, hours); return { cost, price: Math.ceil(cost * (1 + markup / 100)), count: c.count };
  }
  const option = extractRentOption(await rawRentPrices(service, true), country, hours);
  if (!option || option.count <= 0) throw new AppError("This rental is currently out of stock. Please choose another country or duration.", 409);
  return { ...option, price: Math.ceil(option.cost * (1 + markup / 100)) };
}
