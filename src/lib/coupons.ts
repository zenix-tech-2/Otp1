import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { AppError } from "./server";
import { couponDiscount, normalizeCouponCode } from "./coupon-core";
type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete">;
// Checks every rule for one code, locking the coupon row when `lock` is true (use that inside the purchase transaction).
export async function evaluateCoupon(executor: Executor, rawCode: unknown, userId: string, subtotalUsd: number, categoryId: string, lock = false) {
  const code = normalizeCouponCode(rawCode);
  if (!code) throw new AppError("Enter a coupon code.");
  const query = executor.select().from(coupons).where(eq(coupons.code, code));
  const [coupon] = lock ? await query.for("update") : await query;
  const now = Date.now();
  if (!coupon || !coupon.active) throw new AppError("That coupon code isn’t valid.", 404);
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new AppError("This coupon isn’t active yet.", 409);
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now) throw new AppError("This coupon has expired.", 409);
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new AppError("This coupon has reached its usage limit.", 409);
  if (coupon.categoryId && coupon.categoryId !== categoryId) throw new AppError("This coupon doesn’t apply to this kind of product.", 409);
  if (subtotalUsd < coupon.minSubtotal) throw new AppError(`This coupon needs a larger order (minimum $${(coupon.minSubtotal / 100).toFixed(2)}).`, 409);
  const [{ used }] = await executor.select({ used: sql<number>`count(*)::int` }).from(couponRedemptions).where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, userId)));
  if (used >= coupon.perUserLimit) throw new AppError("You’ve already used this coupon.", 409);
  const discount = couponDiscount(coupon, subtotalUsd);
  if (discount <= 0) throw new AppError("This coupon doesn’t reduce the price of this order.", 409);
  return { coupon, discount };
}
export async function recordRedemption(executor: Executor, couponId: string, userId: string, orderId: string, amount: number) {
  const bumped = await executor.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, couponId)).returning({ id: coupons.id });
  if (!bumped.length) throw new AppError("This coupon is no longer available.", 409);
  await executor.insert(couponRedemptions).values({ couponId, userId, orderId, amount });
}
// A refunded order gives its coupon use back.
export async function releaseRedemption(executor: Executor, orderId: string) {
  const [row] = await executor.delete(couponRedemptions).where(eq(couponRedemptions.orderId, orderId)).returning();
  if (row) await executor.update(coupons).set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.id, row.couponId));
}
