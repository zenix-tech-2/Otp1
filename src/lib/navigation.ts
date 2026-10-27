export const customerRoutes: Record<string, string> = {
  news:"/news", updates:"/updates", install:"/install", account: "/account", profile: "/account/profile", notifications: "/notifications", wallet: "/wallet",
  support: "/support", terms: "/terms", login: "/login", register: "/register",
};
export function safeReturnTo(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try { const url = new URL(value, "https://sms-store.local"); if (url.origin !== "https://sms-store.local" || /^\/(api|_next)(\/|$)/.test(url.pathname) || ["/login", "/register"].includes(url.pathname)) return fallback; return url.pathname + url.search; } catch { return fallback; }
}
