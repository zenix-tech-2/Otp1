import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { evaluateCoupon } from "@/lib/coupons";
import { couponLabel } from "@/lib/coupon-core";
export const dynamic = "force-dynamic";
// Previews a coupon for one product. The purchase route re-checks everything, so this is only for showing the new total.
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "coupon-check", 12); const user = await requireUser();
    const data = z.object({ code: z.string().min(1).max(40), productId: z.string().min(1).max(100) }).parse(await request.json());
    const [product] = await db.select().from(products).where(eq(products.id, data.productId));
    if (!product || !product.active) throw new AppError("This product is no longer available.", 404);
    const { coupon, discount } = await evaluateCoupon(db, data.code, user.id, product.price, product.category);
    return Response.json({ code: coupon.code, description: coupon.description, discount, total: product.price - discount, label: couponLabel(coupon, c => `$${(c / 100).toFixed(2)}`) });
  } catch (e) { return apiError(e); }
}
