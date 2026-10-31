import { listCountries, listServices } from "@/lib/numberotp";
import { apiError, getSettings, IS_DEMO, limit } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await limit(request, "sms-catalog", 60); const query = new URL(request.url).searchParams; const service = query.get("service"); const config = await getSettings(); if (service) return Response.json({ countries: await listCountries(service, config.smsMarkup), demo: IS_DEMO }); return Response.json({ services: await listServices(query.get("country") || undefined), demo: IS_DEMO }); } catch(e) { return apiError(e); }
}
