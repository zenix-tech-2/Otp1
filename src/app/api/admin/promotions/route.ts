import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { coupons, notifications, pushSubscriptions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { AppError, apiError, audit, IS_DEMO, limit, sameOrigin } from "@/lib/server";
import { normalizeCouponCode } from "@/lib/coupon-core";
import { pushConfigured, sendPush } from "@/lib/webpush";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireAdmin(); return Response.json({ coupons: await db.select().from(coupons).orderBy(desc(coupons.createdAt)).limit(300), pushConfigured: pushConfigured() }); } catch (e) { return apiError(e); }
}
const date = z.string().datetime({ offset: true }).or(z.literal("")).nullish().transform(v => v ? new Date(v) : null);
const couponInput = z.object({
  code: z.string().transform(normalizeCouponCode).pipe(z.string().min(3, "Codes need at least 3 letters or numbers.").max(32)), description: z.string().trim().max(160).default(""),
  type: z.enum(["percent", "fixed"]), value: z.number().int().min(1), minSubtotal: z.number().int().min(0).max(100_000_00).default(0), maxDiscount: z.number().int().min(1).max(100_000_00).nullish().transform(v => v ?? null),
  maxUses: z.number().int().min(1).max(10_000_000).nullish().transform(v => v ?? null), perUserLimit: z.number().int().min(1).max(1000).default(1), categoryId: z.string().max(100).nullish().transform(v => v || null),
  startsAt: date, expiresAt: date, active: z.boolean().default(true),
}).refine(v => v.type !== "percent" || v.value <= 100, { message: "A percentage discount can be at most 100%.", path: ["value"] }).refine(v => !v.startsAt || !v.expiresAt || v.expiresAt > v.startsAt, { message: "The end date must be after the start date.", path: ["expiresAt"] });
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "admin-promotions", 30); const admin = await requireAdmin();
    const body = await request.json(); const action = z.object({ action: z.enum(["save-coupon", "delete-coupon", "broadcast"]) }).parse(body).action;
    if (action === "save-coupon") {
      const data = couponInput.extend({ id: z.string().uuid().optional() }).parse(body); const { id, ...values } = data;
      try {
        if (id) { await db.update(coupons).set(values).where(eq(coupons.id, id)); await audit(admin.id, "coupon.updated", values.code); }
        else { await db.insert(coupons).values(values); await audit(admin.id, "coupon.created", values.code); }
      } catch (error) { if ((error as { code?: string; cause?: { code?: string } }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") throw new AppError("A coupon with that code already exists.", 409); throw error; }
      return Response.json({ ok: true });
    }
    if (action === "delete-coupon") {
      const { id } = z.object({ id: z.string().uuid() }).parse(body); const [row] = await db.select().from(coupons).where(eq(coupons.id, id));
      if (!row) throw new AppError("Coupon not found.", 404);
      if (row.usedCount > 0) { await db.update(coupons).set({ active: false }).where(eq(coupons.id, id)); await audit(admin.id, "coupon.deactivated", row.code); return Response.json({ ok: true, deactivated: true }); }
      await db.delete(coupons).where(eq(coupons.id, id)); await audit(admin.id, "coupon.deleted", row.code); return Response.json({ ok: true });
    }
    // Broadcast: an in-app notification for every active customer, plus web push to every registered device.
    const data = z.object({ title: z.string().trim().min(2).max(100), body: z.string().trim().max(300).default(""), url: z.string().trim().max(200).default("/notifications").refine(v => v.startsWith("/") && !v.startsWith("//"), "Use a path inside the app, like /store.") }).parse(body);
    const active = await db.select({ id: users.id }).from(users).where(and(eq(users.isDemo, IS_DEMO), eq(users.suspended, false))).limit(50_000);
    for (let i = 0; i < active.length; i += 500) await db.insert(notifications).values(active.slice(i, i + 500).map(u => ({ userId: u.id, kind: "system", title: data.title, body: data.body, url: data.url })));
    let pushed = 0;
    if (pushConfigured()) {
      const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, active.map(u => u.id).slice(0, 10_000))).limit(20_000); const dead: string[] = [];
      for (let i = 0; i < subs.length; i += 25) await Promise.all(subs.slice(i, i + 25).map(async s => { const r = await sendPush(s, { title: data.title, body: data.body, url: data.url, tag: "broadcast" }); if (r === "sent") pushed++; if (r === "gone") dead.push(s.id); }));
      if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    }
    await audit(admin.id, "notification.broadcast", data.title, { recipients: active.length, pushed });
    return Response.json({ ok: true, recipients: active.length, pushed });
  } catch (e) { return apiError(e); }
}
