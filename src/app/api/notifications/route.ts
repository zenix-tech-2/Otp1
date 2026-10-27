import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, limit, sameOrigin } from "@/lib/server";
import { listNotifications, markNotificationsRead } from "@/lib/notify";
export const dynamic = "force-dynamic";
// Polled by the app every ~25 seconds while it is open: the user's inbox plus the unread count that drives the bell badge.
export async function GET(request: Request) { try { await limit(request, "notifications", 60); const user = await requireUser(); return Response.json(await listNotifications(user.id)); } catch (e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "notifications-write", 40); const user = await requireUser();
    const data = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).parse(await request.json().catch(() => ({})));
    await markNotificationsRead(user.id, data.ids); return Response.json(await listNotifications(user.id));
  } catch (e) { return apiError(e); }
}
