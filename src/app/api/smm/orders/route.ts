import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, limit, requireStoreOpen, sameOrigin } from "@/lib/server";
import { createSmmOrder, listSmmOrders } from "@/lib/smm";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  try { const user = await requireUser(); return Response.json({ orders: await listSmmOrders(user.id) }); } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "smm-order", 12); const user = await requireUser(); await requireStoreOpen();
    const data = z.object({ provider: z.enum(["v1", "v2"]), service: z.string().min(1).max(40), link: z.string().trim().min(8).max(500), quantity: z.number().int().positive().max(100000000), expectedPrice: z.number().int().nonnegative(), expectedAmount: z.number().int().nonnegative().optional(), expectedCurrency: z.string().length(3).optional(), idempotencyKey: z.string().uuid() }).parse(await request.json());
    return Response.json(await createSmmOrder(user, data));
  } catch (e) { return apiError(e); }
}
