import "server-only";
import { db } from "@/db";
import { activations, orders, rentals, smmOrders, users } from "@/db/schema";
import { releaseRedemption } from "./coupons";
import { notifyUser } from "./notify";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { AppError } from "./server";
import { record, unwrap } from "./numberotp";
export async function refundOrder(id: string, reason: string, allowCompleted = false) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!order) throw new AppError("Order not found.", 404);
    if (["refunded", "failed", "cancelled"].includes(order.status)) return order;
    if (order.kind === "topup") throw new AppError("Wallet deposits cannot be refunded as purchases.");
    const gift = order.metadata.gift as { recipientOrderId?: string; from?: string } | undefined;
    if (gift?.from) throw new AppError("This order is a gift you received. Refund the sender’s order instead.", 409);
    // A gift is "completed" for the buyer as soon as it is sent, but it can still be refunded while the recipient's copy has not been delivered.
    let giftPending = false;
    if (gift?.recipientOrderId) { const [received] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, gift.recipientOrderId)).for("update"); giftPending = received?.status === "processing"; }
    if (order.status === "completed" && !allowCompleted && !giftPending) throw new AppError("This order has already been delivered.", 409);
    const [wallet] = await tx.select().from(users).where(eq(users.id, order.userId)).for("update");
    if (!wallet || wallet.currency !== order.currency || wallet.balance + order.amount > 2000000000) throw new AppError("This refund needs a currency or balance reconciliation.", 409);
    await tx.update(users).set({ balance: sql`${users.balance} + ${order.amount}` }).where(eq(users.id, order.userId));
    const [updated] = await tx.update(orders).set({ status: "refunded", metadata: { ...order.metadata, refundReason: reason, refundedAt: new Date().toISOString() } }).where(eq(orders.id, id)).returning();
    if (order.kind === "sms") { await tx.update(activations).set({ status: "refunded" }).where(eq(activations.orderId, id)); await tx.update(rentals).set({ status: "refunded" }).where(eq(rentals.orderId, id)); }
    if (gift?.recipientOrderId) await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, gift.recipientOrderId));
    await releaseRedemption(tx, id);
    if (order.kind === "smm") await tx.update(smmOrders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(smmOrders.orderId, id));
    return updated;
  });
}
async function applyActivationInner(id: string, payload: unknown) {
  const data = record(unwrap(payload));
  const status = String(data.status || "waiting").toLowerCase();
  const otp = data.otp ?? data.code ?? record(data.sms).code;
  const fullSms = data.full_sms ?? data.message ?? record(data.sms).text;
  return db.transaction(async tx => {
    const [reference] = await tx.select({ orderId: activations.orderId }).from(activations).where(eq(activations.id, id));
    if (!reference) throw new AppError("Number not found.", 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, reference.orderId)).for("update");
    const [act] = await tx.select().from(activations).where(eq(activations.id, id)).for("update");
    if (!act) throw new AppError("Number not found.", 404);
    if (["received", "cancelled", "expired", "refunded"].includes(act.status)) return act;
    if (!order || order.status === "refunded") return act;
    if (otp != null && String(otp).length > 0) {
      const [updated] = await tx.update(activations).set({ status: "received", code: String(otp).slice(0, 100), message: String(fullSms || "Your verification code has arrived.").slice(0, 4000), lastPolledAt: new Date() }).where(eq(activations.id, id)).returning();
      await tx.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
      return updated;
    }
    if (["expired", "cancelled", "canceled", "failed", "refunded"].includes(status)) {
      const [wallet] = await tx.select().from(users).where(eq(users.id, order.userId)).for("update");
      if (!wallet || wallet.currency !== order.currency || wallet.balance + order.amount > 2000000000) throw new AppError("This refund requires currency or balance reconciliation.", 409);
      const [updated] = await tx.update(activations).set({ status: status === "expired" ? "expired" : "cancelled", lastPolledAt: new Date() }).where(eq(activations.id, id)).returning();
      await tx.update(users).set({ balance: sql`${users.balance} + ${order.amount}` }).where(eq(users.id, order.userId));
      await tx.update(orders).set({ status: "refunded", metadata: { ...order.metadata, refundReason: `Provider confirmed ${status}` } }).where(eq(orders.id, order.id));
      return updated;
    }
    await tx.update(activations).set({ lastPolledAt: new Date() }).where(eq(activations.id, id));
    return act;
  });
}

export async function applyActivationUpdate(id: string, payload: unknown) {
  const [before] = await db.select({ status: activations.status }).from(activations).where(eq(activations.id, id));
  const act = await applyActivationInner(id, payload);
  if (before && before.status !== act.status && act.status === "received") await notifyUser(act.userId, { kind: "number", title: "Your code has arrived", body: `A verification code for ${act.serviceName} is ready.`, url: "/numbers" });
  return act;
}

// Rentals are paid for time, not for a single code: they are never refunded when they expire.
// This only mirrors the provider's rental record (status, expiry and the SMS history).
export async function applyRentalUpdate(id: string, payload: unknown) {
  const data = record(unwrap(payload));
  const status = String(data.status || "active").toLowerCase();
  const history = Array.isArray(data.smsHistory) ? data.smsHistory : Array.isArray(data.sms_history) ? data.sms_history : Array.isArray(data.sms) ? data.sms : [];
  const messages = history.map(item => { const r = record(item); return { code: String(r.code ?? "").slice(0, 100), text: String(r.text ?? r.message ?? "").slice(0, 4000), receivedAt: String(r.receivedAt ?? r.received_at ?? new Date().toISOString()) }; }).filter(m => m.code || m.text).slice(-200);
  const expiry = new Date(String(data.expiresAt ?? data.expires_at ?? ""));
  return db.transaction(async tx => {
    const [rental] = await tx.select().from(rentals).where(eq(rentals.id, id)).for("update");
    if (!rental) throw new AppError("Rental not found.", 404);
    if (["refunded", "cancelled"].includes(rental.status)) return rental;
    const expiresAt = Number.isFinite(expiry.getTime()) ? expiry : rental.expiresAt;
    const ended = ["expired", "cancel", "finish", "complete", "ended"].some(word => status.includes(word)) || expiresAt.getTime() <= Date.now();
    const [updated] = await tx.update(rentals).set({ status: ended ? "expired" : "active", expiresAt, messages: messages.length >= rental.messages.length ? messages : rental.messages, lastPolledAt: new Date() }).where(eq(rentals.id, id)).returning();
    return updated;
  });
}

/**
 * Clears numbers that were paid for but never linked to a provider number (status "reconciliation" with no provider id).
 * After 15 minutes the buyer could not use such a number anyway, and NumberOTP refunds unused numbers automatically,
 * so the buyer is refunded instead of waiting for manual help. Safe to run often: refunds only happen once.
 */
export async function healStuckNumbers(userId?: string) {
  const cutoff = new Date(Date.now() - 15 * 60_000); let healed = 0;
  const stuckActivations = await db.select().from(activations).where(and(eq(activations.status, "reconciliation"), or(isNull(activations.providerId), eq(activations.providerId, "")), lt(activations.createdAt, cutoff), ...(userId ? [eq(activations.userId, userId)] : []))).limit(25);
  for (const row of stuckActivations) { try { await refundOrder(row.orderId, "The number was never linked to the provider and could not be used"); healed++; } catch { /* leave it for manual reconciliation */ } }
  const stuckRentals = await db.select().from(rentals).where(and(eq(rentals.status, "reconciliation"), or(isNull(rentals.providerId), eq(rentals.providerId, "")), lt(rentals.createdAt, cutoff), ...(userId ? [eq(rentals.userId, userId)] : []))).limit(25);
  for (const row of stuckRentals) { try { await refundOrder(row.orderId, "The rental was never linked to the provider and could not be used"); healed++; } catch { /* leave it for manual reconciliation */ } }
  return healed;
}
