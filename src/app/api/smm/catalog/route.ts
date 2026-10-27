import { apiError, AppError, getSettings, IS_DEMO, limit } from "@/lib/server";
import { categoriesOf, isSmmProvider, platformsOf, providerLabel, servicesOf, SMM_PROVIDERS, toPublicService } from "@/lib/smm-core";
import { getSmmCatalog, providerConnected } from "@/lib/smm";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Browse Boost services one level at a time (platforms → categories → services) so the full provider catalog never reaches the browser.
export async function GET(request: Request) {
  try {
    await limit(request, "smm-catalog", 90);
    const query = new URL(request.url).searchParams; const provider = query.get("provider") || "v1";
    if (!isSmmProvider(provider)) throw new AppError("Choose a valid provider.");
    const providers = SMM_PROVIDERS.map(p => ({ ...p, available: providerConnected(p.id) }));
    if (!providerConnected(provider)) throw new AppError(`${providerLabel(provider)} isn’t available right now. Please choose another provider.`, 503);
    const platform = (query.get("platform") || "").slice(0, 40); const category = (query.get("category") || "").slice(0, 16);
    const [services, config] = await Promise.all([getSmmCatalog(provider), getSettings()]);
    if (!platform) return Response.json({ provider, providers, platforms: platformsOf(services), demo: IS_DEMO });
    if (!category) return Response.json({ provider, providers, categories: categoriesOf(services, platform) });
    return Response.json({ provider, providers, services: servicesOf(services, platform, category).slice(0, 400).map(s => toPublicService(s, config.smmMarkup)) });
  } catch (e) { return apiError(e); }
}
