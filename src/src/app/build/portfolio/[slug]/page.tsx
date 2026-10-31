import { notFound } from "next/navigation";
import { PortfolioDetail } from "@/components/dev-pages";
import { getPublicProject } from "@/lib/dev-service";
import type { DevProject } from "@/db/schema";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; let project: DevProject;
  try { project = await getPublicProject(slug); } catch { notFound(); }
  return <PortfolioDetail project={project} />;
}
