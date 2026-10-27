import { NextResponse, type NextRequest } from "next/server";
import { customerRoutes, safeReturnTo } from "./lib/navigation";
import { normalizeCategorySlug } from "./lib/categories";

// Compatibility only. Actual authentication stays in server-side route handlers.
export function proxy(request: NextRequest) {
  if (!["GET", "HEAD"].includes(request.method)) return NextResponse.next();
  const url = request.nextUrl.clone(); const params = url.searchParams; const panel = params.get("panel");
  if (panel && customerRoutes[panel]) {
    const previous = request.nextUrl.clone(); previous.searchParams.delete("panel"); previous.searchParams.delete("payment");
    const payment = params.get("payment");
    url.pathname = panel === "wallet" && payment && /^[a-f0-9-]{36}$/i.test(payment) ? `/wallet/payments/${payment}` : customerRoutes[panel];
    const returnTo = safeReturnTo(params.get("returnTo") || `${previous.pathname}${previous.search}`, panel === "login" ? "/account" : "/");
    url.search = ""; if (["login", "register", "wallet", "support"].includes(panel) && returnTo !== url.pathname) url.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(url, 307);
  }
  if (url.pathname === "/store" && params.has("category")) {
    const category = normalizeCategorySlug(params.get("category") || "all"); params.delete("category");
    url.pathname = category === "numbers" ? "/numbers" : category === "all" || !category ? "/store" : `/store/${encodeURIComponent(category)}`;
    return NextResponse.redirect(url, 308);
  }
  if (url.pathname === "/store/social") { url.pathname = "/store/socials"; return NextResponse.redirect(url, 308); }
  if (url.pathname === "/wallet" && params.has("payment")) {
    const id = params.get("payment")!; params.delete("payment"); if (/^[a-f0-9-]{36}$/i.test(id)) { url.pathname = `/wallet/payments/${id}`; return NextResponse.redirect(url, 307); }
  }
  if (url.pathname === "/orders" && params.has("order")) {
    const id = params.get("order")!; params.delete("order"); if (/^[a-f0-9-]{36}$/i.test(id)) { url.pathname = `/orders/${id}`; return NextResponse.redirect(url, 307); }
  }
  const oldProduct = url.pathname.match(/^\/store\/(?:product\/)?([^/]+)$/);
  if (oldProduct && params.get("checkout") === "1") { params.delete("checkout"); url.pathname = `/store/product/${oldProduct[1]}/checkout`; return NextResponse.redirect(url, 307); }
  return NextResponse.next();
}
export const config = { matcher: ["/", "/store/:path*", "/account/:path*", "/notifications", "/wallet/:path*", "/support", "/terms", "/login", "/register", "/orders/:path*", "/numbers", "/services", "/news/:path*", "/updates/:path*", "/install", "/admin/:path*"] };
