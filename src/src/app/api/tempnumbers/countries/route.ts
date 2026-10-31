import { requireUser } from "@/lib/auth";
import { apiError, limit } from "@/lib/server";
import { freeAdapter, numberProviderOptions } from "@/lib/tempnumbers";
export const dynamic = "force-dynamic";
// Lists the Number versions and the countries the chosen one has free numbers for.
export async function GET(request: Request) {
  try {
    await limit(request, "tempnumbers", 120); await requireUser(); const { adapter, id } = freeAdapter(new URL(request.url).searchParams.get("provider"));
    return Response.json({ providers: numberProviderOptions(), provider: id, countries: await adapter.countries() });
  } catch (e) { return apiError(e); }
}
