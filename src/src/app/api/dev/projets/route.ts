import { apiError, limit } from "@/lib/server";
import { listPublicProjects } from "@/lib/dev-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await limit(request, "dev-projects", 90); const type = new URL(request.url).searchParams.get("type") || undefined; return Response.json({ projects: await listPublicProjects(type) }); } catch (e) { return apiError(e); }
}
