import { listRentCountries } from "@/lib/numberotp";
import { apiError, getSettings, IS_DEMO, limit } from "@/lib/server";
export const dynamic = "force-dynamic";
// Rental countries, durations and marked-up USD prices for one service (?service=wa).
export async function GET(request: Request) {
  try {
    await limit(request, "rent-catalog", 60);
    const service = new URL(request.url).searchParams.get("service");
    if (!service || service.length > 30) return Response.json({ error: "Choose a service first." }, { status: 400 });
    const config = await getSettings();
    return Response.json({ countries: await listRentCountries(service, config.smsMarkup), demo: IS_DEMO });
  } catch (e) { return apiError(e); }
}
