import type { Metadata } from "next";
import { redirect } from "next/navigation";

// PWA protocol_handlers: web+storeotp://store, web+storeotp:numbers, web+storeotp://store/socials ...
// Only known in-app destinations are allowed, so a crafted link can never redirect off-site.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Open Store OTP", robots: { index: false, follow: false } };

const destinations: Record<string, string> = {
  store: "/store", numbers: "/numbers", wallet: "/wallet", orders: "/orders", account: "/account", support: "/support",
  news: "/news", updates: "/updates", notifications: "/notifications", install: "/install", notes: "/notes",
};

function resolveStoreOtpLink(raw: string) {
  const match = /^web\+storeotp:(?:\/\/)?([^?#]*)/i.exec(raw.trim());
  if (!match) return "/";
  const [section = "", slug = ""] = match[1].split("/").filter(Boolean).map(part => part.toLowerCase());
  const base = destinations[section];
  if (!base) return "/";
  if (section === "store" && /^[a-z0-9-]{1,60}$/.test(slug)) return `/store/${slug}`;
  return base;
}

export default async function ProtocolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = Array.isArray(params.url) ? params.url[0] : params.url;
  redirect(resolveStoreOtpLink(value || ""));
}
