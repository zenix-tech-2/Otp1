import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { devProjects, devRequests, orders, users, type DevRequest } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "./server";
import { getCurrencyQuote } from "./fx";
import { fromUsd } from "./currency";
import { devClosed, getDevType, validateBrief, type DevMessage } from "./dev-forms";

// ---------------- Portfolio ----------------
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
export type PublicDevRequest = DevRequest;
export function publicRequest(row: DevRequest): PublicDevRequest { return row; }
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

