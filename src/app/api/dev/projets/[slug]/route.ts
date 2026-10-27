import { apiError, limit } from "@/lib/server";
import { getPublicProject } from "@/lib/dev-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try { await limit(request, "dev-project", 90); const { slug } = await params; return Response.json({ project: await getPublicProject(slug) }); } catch (e) { return apiError(e); }
}
