import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, limit } from "@/lib/server";
import { freeAdapter } from "@/lib/tempnumbers";
export const dynamic = "force-dynamic";
const query = z.object({ provider: z.string().max(4).nullable(), country: z.string().regex(/^\d{1,4}$/), number: z.string().regex(/^\d{5,15}$/), limit: z.coerce.number().int().min(10).max(100).default(30) });
export async function GET(request: Request) {
  try {
    await limit(request, "tempnumbers", 240); await requireUser(); const p = new URL(request.url).searchParams;
    const q = query.parse({ provider: p.get("provider"), country: p.get("country"), number: p.get("number"), limit: p.get("limit") ?? undefined }); const { adapter } = freeAdapter(q.provider);
    return Response.json({ messages: await adapter.messages(q.country, q.number, q.limit) });
  } catch (e) { return apiError(e); }
}
