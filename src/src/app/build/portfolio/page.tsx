import { PortfolioList } from "@/components/dev-pages";
import { listPublicProjects } from "@/lib/dev-service";
import type { DevProject } from "@/db/schema";
export const dynamic = "force-dynamic";
export const metadata = { title: "Our work" };
export default async function Page() {
  let projects: DevProject[] = []; let failed = false;
  try { projects = await listPublicProjects(); } catch (error) { failed = true; console.error("Portfolio failed to load:", error instanceof Error ? error.message : "Unknown error"); }
  return <PortfolioList projects={projects} failed={failed} />;
}
