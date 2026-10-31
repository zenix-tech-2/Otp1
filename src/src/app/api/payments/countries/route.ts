import { getPaymentCountries } from "@/lib/ashtech";
import { limit, apiError } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await limit(request, "payment-countries", 90); try { return Response.json(await getPaymentCountries()); } catch { return Response.json({ countries: [], source: "unavailable", available: false, message: "Supported countries are temporarily unavailable. You can retry or choose Other for a USD account." }); } } catch(e) { return apiError(e); }
}
