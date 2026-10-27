import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, limit } from "@/lib/server";
import { freeAdapter } from "@/lib/tempnumbers";
export const dynamic = "force-dynamic";
const query = z.object({ provider: z.string().max(4).nullable(), country: z.string().regex(/^\d{1,4}$/) });
export async function GET(request: Request) {
  try {
    await limit(request, "tempnumbers", 120); await requireUser(); const p = new URL(request.url).searchParams;
    const q = query.parse({ provider: p.get("provider"), country: p.get("country") }); const { adapter } = freeAdapter(q.provider);
    return Response.json({ numbers: await adapter.numbers(q.country) });
  } catch (e) { return apiError(e); }
}
