import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { activations, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyActivationUpdate } from "@/lib/billing";
import { apiError, AppError } from "@/lib/server";
import { record } from "@/lib/numberotp";
export async function POST(request: Request) {
  try {
    const raw = await request.text(); if (raw.length > 100000) throw new AppError("Payload too large.", 413);
    const reseller = request.headers.has("x-numberotp-reseller-signature");
    const secret = reseller ? process.env.NUMBEROTP_RESELLER_WEBHOOK_SECRET : process.env.NUMBEROTP_WEBHOOK_SECRET;
    if (!secret) throw new AppError("Webhook not configured.", 503);
    const signature = request.headers.get(reseller ? "x-numberotp-reseller-signature" : "x-numberotp-signature") || "";
    const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError("Invalid webhook signature.", 401);
    const eventHash = createHash("sha256").update(`${reseller ? "reseller:" : "activation:"}${raw}`).digest("hex");
    const [seen] = await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.eventHash, eventHash));
    if (seen) return Response.json({ received: true, duplicate: true });
    const payload = record(JSON.parse(raw));
    if (reseller) {
      if (!["sub_user.created", "sub_user.topup", "sub_user.purchase"].includes(String(payload.event))) throw new AppError("Unsupported reseller event.");
      await db.insert(auditLogs).values({ action: `webhook.${String(payload.event)}`, target: String(payload.subUserId || ""), eventHash, details: { amount: payload.amount, resellerEarned: payload.resellerEarned, timestamp: payload.timestamp } }).onConflictDoNothing();
    } else {
      const providerId = String(payload.id || "");
      const [activation] = await db.select().from(activations).where(eq(activations.providerId, providerId));
      if (!activation) throw new AppError("Activation is not yet linked. Retry this webhook.", 409);
      await applyActivationUpdate(activation.id, payload);
      await db.insert(auditLogs).values({ action: "webhook.activation", target: activation.id, eventHash, details: { status: payload.status } }).onConflictDoNothing();
    }
    return Response.json({ received: true });
  } catch(e) { return apiError(e); }
}
