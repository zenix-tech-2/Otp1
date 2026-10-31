import { BuildHome } from "@/components/dev-pages";
import { listPublicProjects } from "@/lib/dev-service";
import type { DevProject } from "@/db/schema";
export const dynamic = "force-dynamic";
export const metadata = { title: "Websites & Bots", description: "Websites, web apps, Telegram and WhatsApp bots, built to your brief." };
export default async function Page() {
  let projects: DevProject[] = [];
  try { projects = (await listPublicProjects()).slice(0, 3); } catch (error) { console.error("Portfolio preview failed:", error instanceof Error ? error.message : "Unknown error"); }
  return <BuildHome projects={projects} />;
}
