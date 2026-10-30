import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gifts, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { maskedName } from "@/lib/gift-core";
export const dynamic = "force-dynamic";
// Confirms who a gift would go to ("Jane D.") before the buyer pays, without revealing anything else about the account.
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "gift-lookup", 10); const user = await requireUser();
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(await request.json());
    if (email === user.email.toLowerCase()) throw new AppError("That’s your own email. Buy it normally to keep it for yourself.");
    const [target] = await db.select({ name: users.name, suspended: users.suspended, isDemo: users.isDemo }).from(users).where(eq(users.email, email));
    if (!target || target.suspended || target.isDemo !== user.isDemo) throw new AppError("We couldn’t find a Store OTP account with that email. Ask them to sign up first.", 404);
    return Response.json({ name: maskedName(target.name) });
  } catch (e) { return apiError(e); }
}
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.select().from(gifts).where(or(eq(gifts.senderId, user.id), eq(gifts.recipientId, user.id))).orderBy(desc(gifts.createdAt)).limit(100);
    return Response.json({ gifts: rows.map(g => ({ id: g.id, direction: g.senderId === user.id ? "sent" : "received", orderId: g.senderId === user.id ? g.senderOrderId : g.recipientOrderId, message: g.message, createdAt: g.createdAt })) });
  } catch (e) { return apiError(e); }
}
