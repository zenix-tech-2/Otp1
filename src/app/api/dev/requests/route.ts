import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, audit, limit, requireStoreOpen, sameOrigin } from "@/lib/server";
import { createDevRequest, listUserRequests } from "@/lib/dev-service";
export const dynamic = "force-dynamic";
export async function GET() { try { const user = await requireUser(); return Response.json({ requests: await listUserRequests(user.id) }); } catch (e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "dev-request", 6, 600); const user = await requireUser(); await requireStoreOpen();
    const data = z.object({ type: z.string().min(1).max(40), answers: z.record(z.string().max(60), z.unknown()) }).parse(await request.json());
    const created = await createDevRequest(user.id, data.type, data.answers);
    await audit(user.id, "dev.request.created", created.id, { type: data.type });
    return Response.json({ request: created });
  } catch (e) { return apiError(e); }
}
