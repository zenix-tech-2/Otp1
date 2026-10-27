import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { pushConfigured, vapidConfig } from "@/lib/webpush";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await limit(request, "push-status", 60); const user = await requireUser().catch(() => null);
    const [count] = user ? await db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)) : [{ n: 0 }];
    return Response.json({ configured: pushConfigured(), publicKey: vapidConfig()?.publicKey ?? null, devices: count?.n ?? 0 });
  } catch (e) { return apiError(e); }
}
const subscription = z.object({ endpoint: z.string().url().max(1000).refine(v => v.startsWith("https://"), "Push endpoints must use https."), keys: z.object({ p256dh: z.string().min(80).max(120), auth: z.string().min(16).max(40) }) });
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "push-subscribe", 20); const user = await requireUser();
    if (!pushConfigured()) throw new AppError("Push notifications aren’t set up on this store yet.", 503);
    const data = subscription.parse(await request.json());
    const existing = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    if (existing.length >= 10) throw new AppError("You’ve reached the limit of 10 devices. Turn notifications off on one you no longer use.", 409);
    await db.insert(pushSubscriptions).values({ userId: user.id, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: (request.headers.get("user-agent") || "").slice(0, 200) })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: data.keys.p256dh, auth: data.keys.auth } });
    return Response.json({ ok: true });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request); await limit(request, "push-unsubscribe", 20); const user = await requireUser();
    const data = z.object({ endpoint: z.string().url().max(1000) }).parse(await request.json());
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, data.endpoint))); return Response.json({ ok: true });
  } catch (e) { return apiError(e); }
}
