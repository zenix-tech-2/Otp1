import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { devProjects, devRequests, orders, users, type DevRequest } from "@/db/schema";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "./server";
import { refundOrder } from "./billing";
import { getCurrencyQuote } from "./fx";
import { fromUsd } from "./currency";
import { devClosed, devTypes, getDevType, validateBrief, type DevLink, type DevMessage } from "./dev-forms";

// ---------------- Portfolio ----------------
const imageUrl = z.string().max(1000).refine(s => /^https:\/\//.test(s) || /^\/api\/media\/[a-f0-9-]{36}$/.test(s), "Use an HTTPS image link or an uploaded image.");
const webUrl = z.string().trim().max(500).refine(s => { try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; } }, "Enter a full link starting with https://");
export const devProjectSchema = z.object({
  id: z.string().uuid().optional(), title: z.string().trim().min(3).max(120), type: z.enum(devTypes.map(t => t.id) as [string, ...string[]]),
  summary: z.string().trim().min(10).max(400), description: z.string().trim().max(10000).default(""),
  techStack: z.array(z.string().trim().min(1).max(40)).max(20).default([]), features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  liveUrl: webUrl.nullable().optional(), clientName: z.string().trim().max(100).nullable().optional(), year: z.number().int().min(2000).max(2100).nullable().optional(),
  coverUrl: imageUrl.nullable().optional(), gallery: z.array(imageUrl).max(10).default([]), featured: z.boolean().default(false), active: z.boolean().default(true), position: z.number().int().min(0).max(100000).default(0),
});
function slugify(text: string) { return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project"; }
export async function saveDevProject(input: unknown) {
  const data = devProjectSchema.parse(input);
  const values = { title: data.title, type: data.type, summary: data.summary, description: data.description, techStack: data.techStack, features: data.features, liveUrl: data.liveUrl || null, clientName: data.clientName || null, year: data.year ?? null, coverUrl: data.coverUrl || null, gallery: data.gallery, featured: data.featured, active: data.active, position: data.position, updatedAt: new Date() };
  if (data.id) { const [row] = await db.update(devProjects).set(values).where(eq(devProjects.id, data.id)).returning(); if (!row) throw new AppError("Project not found.", 404); return row; }
  const base = slugify(data.title);
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const [row] = await db.insert(devProjects).values({ ...values, slug }).onConflictDoNothing().returning();
    if (row) return row;
  }
  throw new AppError("Could not create a unique link for this project. Try a different title.", 409);
}
export async function deleteDevProject(id: string) { z.string().uuid().parse(id); await db.delete(devProjects).where(eq(devProjects.id, id)); }
export async function listPublicProjects(type?: string) {
  const where = type && getDevType(type) ? and(eq(devProjects.active, true), eq(devProjects.type, type)) : eq(devProjects.active, true);
  return db.select().from(devProjects).where(where).orderBy(desc(devProjects.featured), asc(devProjects.position), desc(devProjects.createdAt)).limit(200);
}
export async function getPublicProject(slug: string) {
  const [row] = await db.select().from(devProjects).where(and(eq(devProjects.slug, slug.slice(0, 80)), eq(devProjects.active, true)));
  if (!row) throw new AppError("This project could not be found.", 404);
  return row;
}

// ---------------- Requests ----------------
export type PublicDevRequest = Omit<DevRequest, "adminNote">;
export function publicRequest(row: DevRequest): PublicDevRequest { const { adminNote: _private, ...rest } = row; return rest; }
function newReference() { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = randomBytes(6); return "DEV-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join(""); }
export async function listUserRequests(userId: string) { return (await db.select().from(devRequests).where(eq(devRequests.userId, userId)).orderBy(desc(devRequests.createdAt)).limit(100)).map(publicRequest); }
export async function getUserRequest(userId: string, id: string) {
  z.string().uuid().parse(id); const [row] = await db.select().from(devRequests).where(and(eq(devRequests.id, id), eq(devRequests.userId, userId)));
  if (!row) throw new AppError("We could not find that project request.", 404); return row;
}
export async function createDevRequest(userId: string, typeId: string, answers: Record<string, unknown>) {
  const result = validateBrief(typeId, answers);
  if (!result.ok) { const first = Object.entries(result.errors)[0]; throw new AppError(first ? `Please check your answers. ${first[1]}` : "Please check your answers.", 422); }
  const type = getDevType(typeId)!; const title = String(result.brief.projectName || type.name).slice(0, 100);
  const [open] = await db.select({ count: sql<number>`count(*)::int` }).from(devRequests).where(and(eq(devRequests.userId, userId), inArray(devRequests.status, ["submitted", "reviewing", "quoted"])));
  if ((open?.count ?? 0) >= 15) throw new AppError("You have several requests waiting for review. Please wait for a quote before sending more.", 429);
  const [recent] = await db.select().from(devRequests).where(and(eq(devRequests.userId, userId), eq(devRequests.type, typeId), eq(devRequests.title, title), sql`${devRequests.createdAt} > now() - interval '2 minutes'`));
  if (recent) return publicRequest(recent);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db.insert(devRequests).values({ reference: newReference(), userId, type: typeId, title, brief: result.brief }).onConflictDoNothing().returning();
    if (row) return publicRequest(row);
  }
  throw new AppError("We could not save your request. Please try again.", 503);
}
// Runs a change on one request under a row lock so quotes, payments and status changes can never interleave.
async function mutate<T>(id: string, fn: (row: DevRequest, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  z.string().uuid().parse(id);
  return db.transaction(async tx => { const [row] = await tx.select().from(devRequests).where(eq(devRequests.id, id)).for("update"); if (!row) throw new AppError("Project request not found.", 404); return fn(row, tx); });
}
const textSchema = z.string().trim().min(1).max(2000);
function withMessage(row: DevRequest, from: DevMessage["from"], text: string) { const messages = [...row.messages, { from, text, at: new Date().toISOString() }]; if (messages.length > 300) throw new AppError("This conversation is full. Please contact support.", 409); return messages; }
export async function addMessage(id: string, from: DevMessage["from"], text: unknown, userId?: string) {
  const clean = textSchema.parse(text);
  return mutate(id, async (row, tx) => {
    if (from === "customer" && (row.userId !== userId || devClosed.includes(row.status))) throw new AppError("This request is closed. Please start a new request.", 409);
    const [updated] = await tx.update(devRequests).set({ messages: withMessage(row, from, clean), updatedAt: new Date() }).where(eq(devRequests.id, id)).returning(); return updated;
  });
}
export async function customerCancel(id: string, userId: string) {
  return mutate(id, async (row, tx) => {
    if (row.userId !== userId) throw new AppError("Project request not found.", 404);
    if (!["submitted", "reviewing", "quoted"].includes(row.status)) throw new AppError("This request can no longer be cancelled here. Please message us.", 409);
    const [updated] = await tx.update(devRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(devRequests.id, id)).returning(); return updated;
  });
}
export async function customerApprove(id: string, userId: string) {
  return mutate(id, async (row, tx) => {
    if (row.userId !== userId) throw new AppError("Project request not found.", 404);
    if (row.status !== "delivered") throw new AppError("There is nothing to approve yet.", 409);
    const [updated] = await tx.update(devRequests).set({ status: "completed", messages: withMessage(row, "customer", "I have reviewed the delivery and approve it. Thank you!"), updatedAt: new Date() }).where(eq(devRequests.id, id)).returning(); return updated;
  });
}
export async function acceptQuote(user: { id: string; currency: string }, id: string, expectedUsd: number, expectedAmount?: number, expectedCurrency?: string) {
  const [current] = await db.select().from(devRequests).where(and(eq(devRequests.id, id), eq(devRequests.userId, user.id)));
  if (!current) throw new AppError("Project request not found.", 404);
  if (current.status !== "quoted" || !current.quoteUsd) throw new AppError("There is no quote waiting for your approval.", 409);
  if (current.quoteUsd !== expectedUsd) throw new AppError("The quote has just been updated. Please review the new price.", 409);
  const fx = await getCurrencyQuote(user.currency); const amount = fromUsd(current.quoteUsd, fx);
  if ((user.currency !== "USD" && (expectedAmount == null || expectedCurrency !== user.currency)) || (expectedAmount != null && expectedAmount !== amount) || (expectedCurrency && expectedCurrency !== user.currency)) throw new AppError("The local price or exchange rate has changed. Please review the amount and try again.", 409);
  return mutate(id, async (row, tx) => {
    if (row.userId !== user.id || row.status !== "quoted" || row.quoteUsd !== current.quoteUsd) throw new AppError("This quote is no longer available.", 409);
    const [wallet] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
    if (!wallet || wallet.suspended || wallet.currency !== user.currency) throw new AppError("Your account is unavailable.", 403);
    if (wallet.balance < amount) throw new AppError("Please top up your wallet to accept this quote.", 402);
    await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` }).where(eq(users.id, user.id));
    const [order] = await tx.insert(orders).values({ userId: user.id, kind: "service", title: `Project · ${row.title}`, amount, currency: user.currency, baseAmount: current.quoteUsd!, status: "processing", idempotencyKey: `dev:${row.id}`, metadata: { devRequest: row.id, reference: row.reference, fx } }).returning();
    const [updated] = await tx.update(devRequests).set({ status: "in_progress", orderId: order.id, paidAt: new Date(), messages: withMessage(row, "customer", "I accepted the quote and paid from my wallet."), updatedAt: new Date() }).where(eq(devRequests.id, id)).returning();
    return updated;
  });
}

// ---------------- Admin ----------------
export async function adminQuote(id: string, input: unknown) {
  const data = z.object({ usd: z.number().int().min(100).max(100000000), days: z.number().int().min(1).max(730), note: z.string().trim().max(3000).default("") }).parse(input);
  return mutate(id, async (row, tx) => {
    if (row.orderId || !["submitted", "reviewing", "quoted"].includes(row.status)) throw new AppError("A quote can only be set before the customer pays.", 409);
    const text = `Quote: $${(data.usd / 100).toFixed(2)} USD, about ${data.days} day${data.days === 1 ? "" : "s"}.${data.note ? ` ${data.note}` : ""}`;
    const [updated] = await tx.update(devRequests).set({ status: "quoted", quoteUsd: data.usd, quoteDays: data.days, quoteNote: data.note || null, quotedAt: new Date(), messages: withMessage(row, "admin", text.slice(0, 2000)), updatedAt: new Date() }).where(eq(devRequests.id, id)).returning(); return updated;
  });
}
export async function adminStatus(id: string, status: string) {
  z.enum(["reviewing", "declined", "cancelled", "in_progress", "completed"]).parse(status);
  const [peek] = await db.select().from(devRequests).where(eq(devRequests.id, id));
  if (!peek) throw new AppError("Project request not found.", 404);
  if (devClosed.includes(peek.status)) throw new AppError("This request is already closed.", 409);
  // A paid project that is cancelled is refunded to the customer's wallet first.
  if (status === "cancelled" && peek.orderId) await refundOrder(peek.orderId, "Project cancelled by the developer", true);
  return mutate(id, async (row, tx) => {
    if (devClosed.includes(row.status)) throw new AppError("This request is already closed.", 409);
    const paid = !!row.orderId;
    if (status === "reviewing" && (paid || !["submitted", "quoted"].includes(row.status))) throw new AppError("This request cannot go back to review.", 409);
    if (status === "declined" && paid) throw new AppError("A paid project cannot be declined. Cancel it to refund the customer.", 409);
    if (status === "in_progress" && !(paid && row.status === "delivered")) throw new AppError("Only a delivered project can be reopened for changes.", 409);
    if (status === "completed" && !(paid && ["in_progress", "delivered"].includes(row.status))) throw new AppError("Only a paid project can be completed.", 409);
    const [updated] = await tx.update(devRequests).set({ status, updatedAt: new Date() }).where(eq(devRequests.id, id)).returning();
    if (status === "completed" && row.orderId) await tx.update(orders).set({ status: "completed" }).where(eq(orders.id, row.orderId));
    return updated;
  });
}
export async function adminDeliver(id: string, input: unknown) {
  const data = z.object({ links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: webUrl })).max(10).default([]), note: z.string().trim().max(3000).default("") }).parse(input);
  if (!data.links.length && !data.note) throw new AppError("Add at least one link or a delivery note.", 422);
  return mutate(id, async (row, tx) => {
    if (!row.orderId || !["in_progress", "delivered"].includes(row.status)) throw new AppError("Only a paid project that is in progress can be delivered.", 409);
    const messages = withMessage(row, "admin", "Your project has been delivered. Please review it and confirm, or message me if something needs changing.");
    const [updated] = await tx.update(devRequests).set({ status: "delivered", deliverables: data.links as DevLink[], deliveryNote: data.note || null, messages, updatedAt: new Date() }).where(eq(devRequests.id, id)).returning();
    await tx.update(orders).set({ status: "completed" }).where(and(eq(orders.id, row.orderId), ne(orders.status, "refunded")));
    return updated;
  });
}
export async function adminNote(id: string, note: unknown) {
  const clean = z.string().trim().max(4000).parse(note ?? "");
  return mutate(id, async (_row, tx) => { const [updated] = await tx.update(devRequests).set({ adminNote: clean || null, updatedAt: new Date() }).where(eq(devRequests.id, id)).returning(); return updated; });
}
