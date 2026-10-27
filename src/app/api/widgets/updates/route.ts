import { loadStoreCatalog } from "@/lib/store-catalog";

// Data feed for the Windows widget declared in the manifest (widgets[].data). Public content only.
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const { announcements } = await loadStoreCatalog();
    const items = announcements.slice(0, 3).map(post => ({
      title: post.title,
      text: (post.excerpt || post.body || "").replace(/\s+/g, " ").slice(0, 110),
      url: `${origin}${post.slug ? `/news/${post.slug}` : "/news"}`,
    }));
    return Response.json({ items, openUrl: `${origin}/news`, empty: items.length === 0 });
  } catch {
    return Response.json({ items: [], openUrl: `${origin}/news`, empty: true });
  }
}
