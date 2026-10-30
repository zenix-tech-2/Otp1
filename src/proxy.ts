import { NextResponse, type NextRequest } from "next/server";
import { customerRoutes, safeReturnTo } from "./lib/navigation";
import { normalizeCategorySlug } from "./lib/categories";

// Compatibility only. Actual authentication stays in server-side route handlers.
// Dedicated admin host. Visiting https://adminotp.sellizi.store opens the admin panel directly.
// Override with ADMIN_HOST in the environment. Set ADMIN_HOST_ONLY=1 to hide /admin on every other host.
const ADMIN_HOST = (process.env.ADMIN_HOST || "adminotp.sellizi.store").toLowerCase();
const hostOf = (request: NextRequest) => (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
export function proxy(request: NextRequest) {
  const host = hostOf(request); const path = request.nextUrl.pathname; const isAdminPath = path === "/admin" || path.startsWith("/admin/");
  if (host === ADMIN_HOST) {
    if (path === "/") { const url = request.nextUrl.clone(); url.pathname = "/admin"; return NextResponse.rewrite(url); }
    if (!isAdminPath && ["GET", "HEAD"].includes(request.method)) { const url = request.nextUrl.clone(); url.pathname = "/"; url.search = ""; return NextResponse.redirect(url, 307); }
    return NextResponse.next();
  }
  if (process.env.ADMIN_HOST_ONLY === "1" && isAdminPath) return new NextResponse("Not found", { status: 404 });
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
export const config = { matcher: ["/((?!api/|_next/|icons/|images/|screenshots/|brands/|fonts/|widgets/|.*\\..*).*)", "/", "/store/:path*", "/account/:path*", "/notifications", "/wallet/:path*", "/support", "/terms", "/login", "/register", "/orders/:path*", "/numbers", "/services", "/news/:path*", "/updates/:path*", "/install", "/admin/:path*"] };
