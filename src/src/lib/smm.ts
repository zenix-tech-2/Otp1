import "server-only";
import { notifyUser } from "./notify";
import { db } from "@/db";
import { orders, smmOrders, users, type SmmOrder, type User } from "@/db/schema";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { AppError, audit, getSettings, IS_DEMO } from "./server";
import { ProviderError, record } from "./numberotp";
import { refundOrder } from "./billing";
import { getCurrencyQuote } from "./fx";
import { fromUsd } from "./currency";
import { SMM_ACTIVE, SMM_TERMINAL, cleanText, demoProgress, demoSmmServices, detectPlatform, mapProviderStatus, partialRefundAmount, platformInfo, providerLabel, quoteSmm, validLink, validQuantity, type PublicSmmOrder, type SmmProviderId, type SmmService } from "./smm-core";

// ---------------------------------------------------------------------------------------------
// Provider connections. Customers only know "SMM v1" / "SMM v2"; the real endpoints and keys live
// in server environment variables and are never sent to a browser.
//   SMM_V1_API_URL / SMM_V1_API_KEY   (defaults to the v1 provider's standard v2-style API URL)
//   SMM_V2_API_URL / SMM_V2_API_KEY
// Both providers speak the common SMM-panel protocol: POST form fields { key, action, ... }.
// ---------------------------------------------------------------------------------------------
const DEFAULT_URLS: Record<SmmProviderId, string> = { v1: "https://exosupplier.com/api/v2", v2: "https://peakerr.com/api/v2" };
function config(id: SmmProviderId) {
  const prefix = `SMM_${id.toUpperCase()}`;
  return { url: (process.env[`${prefix}_API_URL`] || DEFAULT_URLS[id]).trim(), key: (process.env[`${prefix}_API_KEY`] || "").trim() };
}
export function providerConnected(id: SmmProviderId) { return IS_DEMO || !!config(id).key; }

// Provider error text can mention balances, domains or account details. Customers get a safe message; the raw text stays in server logs.
function friendlyError(id: SmmProviderId, raw: string) {
  console.error(`[smm ${id}] provider rejected request: ${raw.slice(0, 200)}`);
  const text = raw.toLowerCase();
  if (/active order|already|duplicate|same link/.test(text)) return "You already have an active order for this link and service. Wait for it to finish before ordering again.";
  if (/link|url|username|invalid post|private/.test(text)) return "That link doesn’t work for this service. Check it’s public and correct, then try again.";
  if (/quantity|minimum|maximum|\bmin\b|\bmax\b/.test(text)) return "That quantity isn’t accepted for this service. Try a different amount.";
  if (/service|not found|inactive|disabled|unavailable/.test(text)) return "This service isn’t available right now. Please pick another one.";
  return "The provider couldn’t accept this order. Please try another service or provider.";
}

export async function smmRequest(id: SmmProviderId, params: Record<string, string | number>, timeoutMs = 25000): Promise<unknown> {
  if (IS_DEMO) throw new AppError("Live SMM providers are disabled in the sandbox.", 503);
  const { url, key } = config(id);
  if (!key) throw new AppError(`${providerLabel(id)} isn’t connected yet. Please choose another provider.`, 503);
  const body = new URLSearchParams({ key }); for (const [name, value] of Object.entries(params)) body.set(name, String(value));
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; StoreOTPBoost/1.0)" }, body, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch { throw new ProviderError("The provider could not be reached. Please try again in a moment.", 502, true); }
  let data: unknown;
  try { data = JSON.parse(await response.text()); } catch { throw new ProviderError("The provider returned an unexpected response.", 502, true); }
  if (response.status >= 500) throw new ProviderError("The provider is having trouble right now. Please try again shortly.", 502, true);
  const error = record(data).error;
  if (typeof error === "string" && error) throw new ProviderError(friendlyError(id, error), 400, false);
  if (!response.ok) throw new ProviderError("The provider could not complete this request.", 502, true);
  return data;
}

// ---------- Catalog (cached; provider catalogs can hold thousands of services) ----------
type CatalogEntry = { at: number; services: SmmService[] };
const globals = globalThis as typeof globalThis & { __smmCatalog?: Map<string, CatalogEntry>; __smmLoading?: Map<string, Promise<SmmService[]>> };
const cache = (globals.__smmCatalog ??= new Map()); const loading = (globals.__smmLoading ??= new Map());
const CATALOG_TTL = 10 * 60 * 1000;
function flag(value: unknown) { return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true"; }
export function normalizeServices(data: unknown): SmmService[] {
  const list = Array.isArray(data) ? data : Array.isArray(record(data).services) ? record(data).services as unknown[] : [];
  const out: SmmService[] = [];
  for (const item of list) {
    const r = record(item); const id = String(r.service ?? r.id ?? "").trim(); const rate = Number(r.rate); const min = Math.trunc(Number(r.min)); const max = Math.trunc(Number(r.max));
    // The order form only collects a link and a quantity, so only plain "Default" services are offered.
    if (!id || !/^default$/i.test(String(r.type || "Default")) || !Number.isFinite(rate) || rate < 0 || !(min >= 1) || !(max >= min)) continue;
    const name = cleanText(String(r.name || "")).slice(0, 220); if (!name) continue;
    out.push({ id, name, category: cleanText(String(r.category || "")).slice(0, 120) || "Other", type: "Default", rate, min, max, refill: flag(r.refill), cancel: flag(r.cancel) });
  }
  return out;
}
export async function getSmmCatalog(id: SmmProviderId): Promise<SmmService[]> {
  if (IS_DEMO) return demoSmmServices(id);
  const cached = cache.get(id); if (cached && Date.now() - cached.at < CATALOG_TTL) return cached.services;
  let pending = loading.get(id);
  if (!pending) {
    pending = (async () => { const services = normalizeServices(await smmRequest(id, { action: "services" }, 55000)); if (!services.length) throw new AppError("This provider has no services available right now.", 503); cache.set(id, { at: Date.now(), services }); return services; })().finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  try { return await pending; }
  catch (error) { if (cached) return cached.services; throw error; } // keep serving the last good catalog if the provider hiccups
}
export async function getSmmService(provider: SmmProviderId, serviceId: string) { return (await getSmmCatalog(provider)).find(s => s.id === serviceId); }

// ---------- Orders ----------
export function publicSmmOrder(row: SmmOrder): PublicSmmOrder {
  return { id: row.id, provider: providerLabel(row.provider), platform: row.platform, serviceName: row.serviceName, link: row.link, quantity: row.quantity, remains: row.remains, startCount: row.startCount, price: row.price, currency: row.currency, status: row.status, isDemo: row.isDemo, createdAt: row.createdAt.toISOString() };
}
export type CreateSmmInput = { provider: SmmProviderId; service: string; link: string; quantity: number; expectedPrice: number; expectedAmount?: number; expectedCurrency?: string; idempotencyKey: string };
export async function createSmmOrder(user: User, input: CreateSmmInput): Promise<{ order: PublicSmmOrder; warning?: string }> {
  const key = `${user.id}:smm:${input.idempotencyKey}`;
  const existing = async () => { const [prior] = await db.select().from(orders).where(eq(orders.idempotencyKey, key)); if (!prior) return null; const [row] = await db.select().from(smmOrders).where(eq(smmOrders.orderId, prior.id)); return row || null; };
  const done = await existing(); if (done) return { order: publicSmmOrder(done) };
  const [config, service] = await Promise.all([getSettings(), getSmmService(input.provider, input.service)]);
  if (!service) throw new AppError("This service isn’t available any more. Please pick another one.", 409);
  if (!validQuantity(service, input.quantity)) throw new AppError(`Choose a quantity between ${service.min.toLocaleString("en")} and ${service.max.toLocaleString("en")}.`);
  if (!validLink(input.link)) throw new AppError("Enter a valid public link that starts with https://");
  const quote = quoteSmm(service.rate, input.quantity, config.smmMarkup);
  if (quote.price !== input.expectedPrice) throw new AppError("The price has changed. Please review the new total and try again.", 409);
  const fx = await getCurrencyQuote(user.currency); const amount = fromUsd(quote.price, fx);
  if ((user.currency !== "USD" && (input.expectedAmount == null || input.expectedCurrency !== user.currency)) || (input.expectedAmount != null && input.expectedAmount !== amount) || (input.expectedCurrency && input.expectedCurrency !== user.currency)) throw new AppError("The local price or exchange rate has changed. Refresh and review the amount before ordering.", 409);
  const platform = platformInfo(detectPlatform(service)).name;
  const reservation = await db.transaction(async tx => {
    const [wallet] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    const [duplicate] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key));
    if (duplicate) { const [row] = await tx.select().from(smmOrders).where(eq(smmOrders.orderId, duplicate.id)); return { row, created: false }; }
    if (!wallet || wallet.suspended || wallet.currency !== user.currency) throw new AppError("Your account is unavailable.", 403);
    if (wallet.balance < amount) throw new AppError("Please top up your wallet before placing this order.", 402);
    await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` }).where(eq(users.id, user.id));
    const [order] = await tx.insert(orders).values({ userId: user.id, kind: "smm", title: `${platform} · ${service.name}`.slice(0, 160), amount, currency: user.currency, baseAmount: quote.price, status: "processing", idempotencyKey: key, metadata: { provider: input.provider, platform, quantity: input.quantity, link: input.link, demo: IS_DEMO, fx } }).returning();
    const [row] = await tx.insert(smmOrders).values({ userId: user.id, orderId: order.id, provider: input.provider, providerServiceId: service.id, platform, serviceName: service.name.slice(0, 220), link: input.link, quantity: input.quantity, price: amount, currency: user.currency, providerCost: quote.cost, status: "provisioning", remains: input.quantity, isDemo: IS_DEMO }).returning();
    return { row, created: true };
  });
  if (!reservation.created) return { order: publicSmmOrder(reservation.row) };
  const row = reservation.row;
  try {
    const providerOrderId = IS_DEMO ? `demo_${row.id}` : await placeProviderOrder(input.provider, service.id, input.link, input.quantity);
    const [updated] = await db.update(smmOrders).set({ providerOrderId, status: "pending", updatedAt: new Date() }).where(eq(smmOrders.id, row.id)).returning();
    await audit(user.id, "smm.ordered", row.id, { provider: input.provider, quantity: input.quantity, amount, currency: user.currency, demo: IS_DEMO });
    return { order: publicSmmOrder(updated) };
  } catch (error) {
    if (error instanceof ProviderError && error.uncertain) {
      // The provider may or may not have accepted the order. Never refund or retry automatically.
      const [updated] = await db.update(smmOrders).set({ status: "reconciliation", updatedAt: new Date() }).where(eq(smmOrders.id, row.id)).returning();
      await db.update(orders).set({ status: "reconciliation" }).where(eq(orders.id, row.orderId));
      return { order: publicSmmOrder(updated), warning: "We couldn’t confirm your order with the provider. Your payment is saved and our team will check it. Please don’t order again." };
    }
    await refundOrder(row.orderId, "Boost order could not be placed");
    throw error;
  }
}
async function placeProviderOrder(provider: SmmProviderId, service: string, link: string, quantity: number) {
  const result = record(await smmRequest(provider, { action: "add", service, link, quantity }));
  const id = result.order ?? result.id;
  if (id == null || String(id) === "") throw new ProviderError("The provider response needs manual reconciliation.", 502, true);
  return String(id);
}

function toCount(value: unknown) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null; }
// Applies a provider status to an order exactly once: completion, cancellation refunds and partial refunds are all idempotent.
export async function applySmmStatus(id: string, payload: { status: unknown; remains?: unknown; start_count?: unknown }) {
  const [before] = await db.select({ status: smmOrders.status }).from(smmOrders).where(eq(smmOrders.id, id));
  const row = await applySmmStatusInner(id, payload);
  if (before && before.status !== row.status && (SMM_TERMINAL as string[]).includes(row.status)) {
    const text = row.status === "completed" ? { title: "Your boost is complete", body: `${row.serviceName} finished delivering.` } : row.status === "partial" ? { title: "Your boost partly completed", body: `${row.serviceName}: the undelivered part was refunded to your wallet.` } : { title: "Your boost was refunded", body: `${row.serviceName} couldn’t be delivered, so your wallet was refunded.` };
    await notifyUser(row.userId, { kind: "boost", ...text, url: "/boost" });
  }
  return row;
}
async function applySmmStatusInner(id: string, payload: { status: unknown; remains?: unknown; start_count?: unknown }) {
  const mapped = mapProviderStatus(payload.status); const remains = toCount(payload.remains); const startCount = toCount(payload.start_count);
  return db.transaction(async tx => {
    const [reference] = await tx.select({ orderId: smmOrders.orderId }).from(smmOrders).where(eq(smmOrders.id, id));
    if (!reference) throw new AppError("Order not found.", 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, reference.orderId)).for("update");
    const [row] = await tx.select().from(smmOrders).where(eq(smmOrders.id, id)).for("update");
    if (!row || !order) throw new AppError("Order not found.", 404);
    if ((SMM_TERMINAL as string[]).includes(row.status) || order.status === "refunded") return row;
    const now = new Date();
    if (mapped === "pending" || mapped === "processing") {
      const [updated] = await tx.update(smmOrders).set({ status: mapped, remains: remains ?? row.remains, startCount: startCount ?? row.startCount, lastPolledAt: now, updatedAt: now }).where(eq(smmOrders.id, id)).returning();
      return updated;
    }
    const refund = mapped === "partial" ? partialRefundAmount(row.price, row.quantity, remains ?? row.quantity) : mapped === "completed" ? 0 : order.amount;
    if (mapped === "completed" || (mapped === "partial" && refund === 0)) {
      const [updated] = await tx.update(smmOrders).set({ status: "completed", remains: 0, startCount: startCount ?? row.startCount, lastPolledAt: now, updatedAt: now }).where(eq(smmOrders.id, id)).returning();
      await tx.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
      return updated;
    }
    const [wallet] = await tx.select().from(users).where(eq(users.id, order.userId)).for("update");
    if (!wallet || wallet.currency !== order.currency || wallet.balance + refund > 2000000000) throw new AppError("This refund requires currency or balance reconciliation.", 409);
    await tx.update(users).set({ balance: sql`${users.balance} + ${refund}` }).where(eq(users.id, order.userId));
    if (mapped === "partial") {
      const [updated] = await tx.update(smmOrders).set({ status: "partial", remains: remains ?? row.remains, startCount: startCount ?? row.startCount, lastPolledAt: now, updatedAt: now }).where(eq(smmOrders.id, id)).returning();
      await tx.update(orders).set({ status: "completed", metadata: { ...order.metadata, partialRefund: refund, undelivered: remains } }).where(eq(orders.id, order.id));
      return updated;
    }
    const [updated] = await tx.update(smmOrders).set({ status: "cancelled", lastPolledAt: now, updatedAt: now }).where(eq(smmOrders.id, id)).returning();
    await tx.update(orders).set({ status: "refunded", metadata: { ...order.metadata, refundReason: "Provider cancelled the order", refundedAt: now.toISOString() } }).where(eq(orders.id, order.id));
    return updated;
  });
}

const POLL_GAP_MS = 8000; const STUCK_AFTER_MS = 15 * 60 * 1000;
// Pulls the latest provider status for in-flight orders. Failures are swallowed: the page keeps working from stored data.
async function refreshRows(rows: SmmOrder[]) {
  const now = Date.now(); const live = new Map<SmmProviderId, SmmOrder[]>();
  for (const row of rows) {
    try {
      if (!row.providerOrderId) {
        // Reserved but never handed to the provider (e.g. the server stopped mid-request): flag for manual review, never auto-refund.
        if (now - row.createdAt.getTime() > STUCK_AFTER_MS) { await db.update(smmOrders).set({ status: "reconciliation", updatedAt: new Date() }).where(and(eq(smmOrders.id, row.id), eq(smmOrders.status, "provisioning"))); await db.update(orders).set({ status: "reconciliation" }).where(and(eq(orders.id, row.orderId), eq(orders.status, "processing"))); }
        continue;
      }
      if (row.isDemo) { const p = demoProgress(row.quantity, row.createdAt, now); await applySmmStatus(row.id, { status: p.status, remains: p.remains, start_count: p.startCount }); continue; }
      if (row.lastPolledAt && now - row.lastPolledAt.getTime() < POLL_GAP_MS) continue;
      const group = live.get(row.provider as SmmProviderId) || []; group.push(row); live.set(row.provider as SmmProviderId, group);
    } catch (error) { console.error("SMM refresh skipped:", error instanceof Error ? error.message : "unknown"); }
  }
  for (const [provider, group] of live) {
    for (let i = 0; i < group.length; i += 100) {
      const batch = group.slice(i, i + 100);
      try {
        const result = record(await smmRequest(provider, { action: "status", orders: batch.map(r => r.providerOrderId!).join(",") }, 20000));
        for (const row of batch) {
          const entry = record(result[row.providerOrderId!]);
          if (!entry.status) { await db.update(smmOrders).set({ lastPolledAt: new Date() }).where(eq(smmOrders.id, row.id)); continue; }
          await applySmmStatus(row.id, { status: entry.status, remains: entry.remains, start_count: entry.start_count });
        }
      } catch (error) { console.error(`[smm ${provider}] status refresh skipped:`, error instanceof Error ? error.message : "unknown"); }
    }
  }
}
export async function listSmmOrders(userId: string) {
  const active = await db.select().from(smmOrders).where(and(eq(smmOrders.userId, userId), inArray(smmOrders.status, SMM_ACTIVE))).orderBy(desc(smmOrders.createdAt)).limit(40);
  if (active.length) await refreshRows(active);
  const rows = await db.select().from(smmOrders).where(eq(smmOrders.userId, userId)).orderBy(desc(smmOrders.createdAt)).limit(100);
  return rows.map(publicSmmOrder);
}
// For the scheduled job: keeps orders moving even when the customer isn't looking at the page.
export async function reconcileSmmOrders(limit = 25) {
  const stale = new Date(Date.now() - 60 * 1000);
  const rows = await db.select().from(smmOrders).where(and(eq(smmOrders.isDemo, IS_DEMO), inArray(smmOrders.status, SMM_ACTIVE), or(isNull(smmOrders.lastPolledAt), lt(smmOrders.lastPolledAt, stale)))).orderBy(smmOrders.lastPolledAt).limit(limit);
  await refreshRows(rows); return rows.length;
}
