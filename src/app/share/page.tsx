import type { Metadata } from "next";
import { redirect } from "next/navigation";

// PWA share_target (GET). Text shared from another app becomes a store search.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share to Digisms Pro", robots: { index: false, follow: false } };

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || "";

export default async function SharePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const shared = [first(params.title), first(params.text), first(params.url)].find(value => value.trim()) || "";
  const query = shared.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  redirect(query ? `/store?q=${encodeURIComponent(query)}` : "/store");
}
