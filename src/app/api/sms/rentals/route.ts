import { db } from "@/db";
import { orders, rentals, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, AppError, audit, getSettings, IS_DEMO, limit, sameOrigin } from "@/lib/server";
import { getRentQuote, listServices, providerOrder, ProviderError, record, rentLabel, unwrap } from "@/lib/numberotp";
import { healStuckNumbers, refundOrder } from "@/lib/billing";
import { getCurrencyQuote } from "@/lib/fx";
import { fromUsd } from "@/lib/currency";
import { GIFT_MESSAGE_MAX, maskedName } from "@/lib/gift-core";
import { resolveGiftRecipient } from "@/lib/gift-recipient";
import { notifyUser } from "@/lib/notify";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // room for the provider call plus its automatic retries
/** A buyer who sends a gift never receives the recipient's number, only a confirmation. */
function giftReply(order: { id: string; metadata: Record<string, unknown> }, rental: unknown) { const gift = order.metadata.gift as { toName?: string } | undefined; return gift ? { gift: { orderId: order.id, toName: gift.toName ?? "your friend" } } : { rental }; }
export async function GET() { try { const user = await requireUser(); await healStuckNumbers(user.id).catch(() => {}); return Response.json({ rentals: await db.select().from(rentals).where(eq(rentals.userId, user.id)).orderBy(desc(rentals.createdAt)).limit(100) }); } catch (e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request); const [, user, config] = await Promise.all([limit(request, "rental-buy", 10), requireUser(), getSettings()]); if (config.maintenance) throw new AppError("We’re making a few improvements. New purchases will be back shortly.", 503);
    const data = z.object({ service: z.string().min(1).max(30), country: z.string().min(1).max(10), countryName: z.string().max(100), hours: z.number().int().min(2).max(720), expectedPrice: z.number().int().nonnegative(), expectedAmount: z.number().int().nonnegative().optional(), expectedCurrency: z.string().length(3).optional(), idempotencyKey: z.string().uuid(), gift: z.object({ email: z.string().trim().toLowerCase().email().max(200), message: z.string().trim().max(GIFT_MESSAGE_MAX).default("") }).optional() }).parse(await request.json());
    const key = `rental:${user.id}:${data.idempotencyKey}`;
    const [previous] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    if (previous) { const [rental] = await db.select().from(rentals).where(eq(rentals.orderId, previous.id)); return Response.json(giftReply(previous, rental)); }
    const [quote, services, fx] = await Promise.all([getRentQuote(data.service, data.country, data.hours, config.smsMarkup), listServices(), getCurrencyQuote(user.currency)]);
    const service = services.find(s => s.code === data.service); if (!service) throw new AppError("Please choose an available service.");
    if (quote.price !== data.expectedPrice) throw new AppError("The price has changed. Please refresh the rental options and review the new price.", 409);
    const amount = fromUsd(quote.price, fx);
    if ((user.currency !== "USD" && (data.expectedAmount == null || data.expectedCurrency !== user.currency)) || (data.expectedAmount != null && data.expectedAmount !== amount) || (data.expectedCurrency && data.expectedCurrency !== user.currency)) throw new AppError("The local price or exchange rate has changed. Refresh and review the amount before renting.", 409);
    const recipient = data.gift ? await resolveGiftRecipient(user, data.gift.email) : null; const giftMessage = data.gift?.message ?? "";
    const reservation = await db.transaction(async tx => {
      const [wallet] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const [duplicate] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key));
      if (duplicate) { const [existing] = await tx.select().from(rentals).where(eq(rentals.orderId, duplicate.id)); return { rental: existing, order: duplicate, created: false }; }
      if (!wallet || wallet.suspended || wallet.currency !== user.currency) throw new AppError("Your account is unavailable.", 403);
      if (wallet.balance < amount) throw new AppError("Please top up your wallet before renting this number.", 402);
      await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` }).where(eq(users.id, user.id));
      const [order] = await tx.insert(orders).values({ userId: user.id, kind: "sms", title: `${recipient ? "Gift: " : ""}Rental · ${service.name} · ${data.countryName} · ${rentLabel(data.hours)}`, amount, currency: user.currency, baseAmount: quote.price, status: "processing", idempotencyKey: key, metadata: { rental: true, service: data.service, country: data.country, hours: data.hours, demo: IS_DEMO, fx, ...(recipient ? { gift: { to: recipient.id, toName: recipient.masked, message: giftMessage } } : {}) } }).returning();
      const [rental] = await tx.insert(rentals).values({ userId: recipient?.id ?? user.id, orderId: order.id, ...(recipient ? { giftFromName: maskedName(user.name), giftMessage } : {}), service: data.service, serviceName: service.name, country: data.country, countryName: data.countryName, durationHours: data.hours, price: amount, currency: user.currency, providerCost: quote.cost, status: "provisioning", expiresAt: new Date(Date.now() + data.hours * 3600000), isDemo: IS_DEMO }).returning();
      return { rental, order, created: true };
    });
    if (!reservation.created) return Response.json(giftReply(reservation.order, reservation.rental));
    const pending = reservation.rental;
    try {
      let providerId: string; let phone: string; let expiresAt = pending.expiresAt;
      if (IS_DEMO) { providerId = `demo_${pending.id}`; phone = `+1 202 555 01${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`; }
      else {
        const result = record(unwrap(await providerOrder("/rentals", { service: data.service, country: data.country, duration: data.hours }, pending.orderId)));
        providerId = String(result.id ?? result.rental_id ?? ""); phone = String(result.phoneNumber ?? result.phone_number ?? result.phone ?? result.number ?? "");
        if (!providerId || !phone) throw new ProviderError("The provider response needs manual reconciliation. Your rental is saved; please do not rent again.", 502, true);
        const expiry = new Date(String(result.expiresAt ?? result.expires_at ?? "")); if (Number.isFinite(expiry.getTime())) expiresAt = expiry;
      }
      const [rental] = await db.update(rentals).set({ providerId, phone, expiresAt, status: "active" }).where(eq(rentals.id, pending.id)).returning();
      await db.update(orders).set({ status: "completed" }).where(eq(orders.id, pending.orderId));
      // Bookkeeping runs after the response is sent, so the buyer isn't kept waiting for it.
      after(async () => {
        await audit(user.id, "rental.reserved", pending.id, { demo: IS_DEMO, amount, currency: user.currency, hours: data.hours, gift: Boolean(recipient) }).catch(() => {});
        if (recipient) await notifyUser(recipient.id, { kind: "gift", title: `${maskedName(user.name)} sent you a number`, body: `A ${rentLabel(data.hours)} rental for ${service.name} · ${data.countryName} is ready in My numbers.${giftMessage ? ` “${giftMessage}”` : ""}`, url: `/numbers?tab=rentals&rental=${pending.id}` }).catch(() => {});
      });
      return Response.json(giftReply(reservation.order, rental));
    } catch (error) {
      if (error instanceof ProviderError && error.uncertain && !error.retryable) {
        const [rental] = await db.update(rentals).set({ status: "reconciliation" }).where(eq(rentals.id, pending.id)).returning();
        await db.update(orders).set({ status: "reconciliation" }).where(eq(orders.id, pending.orderId));
        return Response.json({ ...giftReply(reservation.order, rental), warning: error.message });
      }
      await refundOrder(pending.orderId, "Rental could not be provisioned");
      // The provider never answered after several tries, so the buyer is refunded right away.
      if (error instanceof ProviderError && error.retryable) throw new AppError("The number provider didn’t respond, so you haven’t been charged. Please try again in a moment.", 502);
      throw error;
    }
  } catch (e) { return apiError(e); }
}
