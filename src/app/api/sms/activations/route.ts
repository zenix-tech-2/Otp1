import { db } from "@/db";
import { activations, orders, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, AppError, audit, getSettings, IS_DEMO, limit, sameOrigin } from "@/lib/server";
import { getQuote, listServices, providerOrder, ProviderError, record, unwrap } from "@/lib/numberotp";
import { healStuckNumbers, refundOrder } from "@/lib/billing";
import { getCurrencyQuote } from "@/lib/fx";
import { fromUsd } from "@/lib/currency";
import { GIFT_MESSAGE_MAX, maskedName } from "@/lib/gift-core";
import { resolveGiftRecipient } from "@/lib/gift-recipient";
import { notifyUser } from "@/lib/notify";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // room for the provider call plus its automatic retries
/** A buyer who sends a gift never receives the recipient's number or code, only a confirmation. */
function giftReply(order: { id: string; metadata: Record<string, unknown> }, activation: unknown) { const gift = order.metadata.gift as { toName?: string } | undefined; return gift ? { gift: { orderId: order.id, toName: gift.toName ?? "your friend" } } : { activation }; }
export async function GET() { try { const user = await requireUser(); await healStuckNumbers(user.id).catch(() => {}); return Response.json({ activations: await db.select().from(activations).where(eq(activations.userId, user.id)).orderBy(desc(activations.createdAt)).limit(100) }); } catch(e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request); const [, user, config] = await Promise.all([limit(request, "number-buy", 10), requireUser(), getSettings()]); if (config.maintenance) throw new AppError("We’re making a few improvements. New purchases will be back shortly.", 503);
    const data = z.object({ service: z.string().min(1).max(30), country: z.string().min(1).max(10), countryName: z.string().max(100), expectedPrice: z.number().int().nonnegative(), expectedAmount: z.number().int().nonnegative().optional(), expectedCurrency: z.string().length(3).optional(), idempotencyKey: z.string().uuid(), gift: z.object({ email: z.string().trim().toLowerCase().email().max(200), message: z.string().trim().max(GIFT_MESSAGE_MAX).default("") }).optional() }).parse(await request.json());
    const key = `${user.id}:${data.idempotencyKey}`;
    const [previous] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    if (previous) { const [activation] = await db.select().from(activations).where(eq(activations.orderId, previous.id)); return Response.json(giftReply(previous, activation)); }
    const [quote, services, fx] = await Promise.all([getQuote(data.service, data.country, config.smsMarkup), listServices(), getCurrencyQuote(user.currency)]);
    const service = services.find(s => s.code === data.service); if (!service) throw new AppError("Please choose an available service.");
    if (quote.price !== data.expectedPrice) throw new AppError("The price has changed. Please refresh the country list and review the new price.", 409);
    const amount = fromUsd(quote.price, fx);
    if ((user.currency !== "USD" && (data.expectedAmount == null || data.expectedCurrency !== user.currency)) || (data.expectedAmount != null && data.expectedAmount !== amount) || (data.expectedCurrency && data.expectedCurrency !== user.currency)) throw new AppError("The local price or exchange rate has changed. Refresh and review the amount before purchasing.", 409);
    const recipient = data.gift ? await resolveGiftRecipient(user, data.gift.email) : null; const giftMessage = data.gift?.message ?? "";
    const reservation = await db.transaction(async tx => {
      const [wallet] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
      const [duplicate] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key));
      if (duplicate) { const [act] = await tx.select().from(activations).where(eq(activations.orderId, duplicate.id)); return { activation: act, order: duplicate, created: false }; }
      if (!wallet || wallet.suspended || wallet.currency !== user.currency) throw new AppError("Your account is unavailable.", 403);
      if (wallet.balance < amount) throw new AppError("Please top up your wallet before reserving this number.", 402);
      await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` }).where(eq(users.id, user.id));
      const [order] = await tx.insert(orders).values({ userId: user.id, kind: "sms", title: `${recipient ? "Gift: " : ""}${service.name} · ${data.countryName}`, amount, currency: user.currency, baseAmount: quote.price, status: "processing", idempotencyKey: key, metadata: { service: data.service, country: data.country, demo: IS_DEMO, fx, ...(recipient ? { gift: { to: recipient.id, toName: recipient.masked, message: giftMessage } } : {}) } }).returning();
      const [activation] = await tx.insert(activations).values({ userId: recipient?.id ?? user.id, orderId: order.id, ...(recipient ? { giftFromName: maskedName(user.name), giftMessage } : {}), service: data.service, serviceName: service.name, country: data.country, countryName: data.countryName, price: amount, currency: user.currency, providerCost: quote.cost, status: "provisioning", expiresAt: new Date(Date.now() + Number(process.env.NUMBEROTP_ACTIVATION_MINUTES || 20) * 60000), isDemo: IS_DEMO }).returning();
      return { activation, order, created: true };
    });
    if (!reservation.created) return Response.json(giftReply(reservation.order, reservation.activation));
    const act = reservation.activation;
    try {
      let providerId: string; let phone: string; let expiresAt = act.expiresAt;
      if (IS_DEMO) { providerId = `demo_${act.id}`; phone = `+1 202 555 01${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`; }
      else {
        const result = record(unwrap(await providerOrder("/activations", { service: data.service, country: data.country, pool: "auto", max_price: quote.cost / 100 }, act.id)));
        providerId = String(result.id ?? result.activation_id ?? ""); phone = String(result.phone_number ?? result.phone ?? result.number ?? "");
        if (!providerId || !phone) throw new ProviderError("The provider response needs manual reconciliation. Your reservation is saved; please do not buy again.", 502, true);
        const expiry = new Date(String(result.expires_at ?? result.expiresAt ?? "")); if (Number.isFinite(expiry.getTime())) expiresAt = expiry;
      }
      const [activation] = await db.update(activations).set({ providerId, phone, expiresAt, status: "waiting" }).where(eq(activations.id, act.id)).returning();
      // Bookkeeping runs after the response is sent, so the buyer isn't kept waiting for it.
      after(async () => {
        await audit(user.id, "sms.reserved", act.id, { demo: IS_DEMO, amount, currency: user.currency, gift: Boolean(recipient) }).catch(() => {});
        if (recipient) await notifyUser(recipient.id, { kind: "gift", title: `${maskedName(user.name)} sent you a number`, body: `${service.name} · ${data.countryName} is ready in My numbers.${giftMessage ? ` “${giftMessage}”` : ""}`, url: "/numbers?tab=active" }).catch(() => {});
      });
      return Response.json(giftReply(reservation.order, activation));
    } catch(error) {
      if (error instanceof ProviderError && error.uncertain && !error.retryable) {
        const [activation] = await db.update(activations).set({ status: "reconciliation" }).where(eq(activations.id, act.id)).returning();
        await db.update(orders).set({ status: "reconciliation" }).where(eq(orders.id, act.orderId));
        return Response.json({ ...giftReply(reservation.order, activation), warning: error.message });
      }
      await refundOrder(act.orderId, "Number could not be provisioned");
      await db.update(activations).set({ status: "cancelled" }).where(eq(activations.id, act.id));
      // The provider never answered after several tries and refunds unused numbers by itself, so the buyer is refunded right away.
      if (error instanceof ProviderError && error.retryable) throw new AppError("The number provider didn’t respond, so you haven’t been charged. Please try again in a moment.", 502);
      throw error;
    }
  } catch(e) { return apiError(e); }
}
