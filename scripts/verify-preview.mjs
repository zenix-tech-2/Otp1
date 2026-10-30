// Read-only deployment verification. Also accepts a public preview/Vercel URL.
// PREVIEW_URL=https://your-deployment.example node scripts/verify-preview.mjs
import assert from "node:assert/strict";

const base = (process.env.PREVIEW_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const starter = /Starter template|Arena Next\.js PostgreSQL Starter|Server-rendered with Next\.js after a successful PostgreSQL/i;

async function get(path) {
  const response = await fetch(`${base}${path}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${path} must return 200, not a startup error or redirect.`);
  assert.equal(response.headers.get("x-storeotp-release"), "store-otp-ashtech-v3", `${path} is not being served by the current Store OTP deployment.`);
  return response;
}

const health = await (await get("/api/health")).json();
assert.equal(health.app, "store-otp");
assert.equal(health.ok, true);
assert.equal(health.database, "ready");
console.log("PASS actual store schema and application health");

const home = await get("/");
const html = await home.text();
assert(!starter.test(html), "The starter screen is still being served.");
assert(html.includes('data-application="store-otp"'), "The actual storefront was not server-rendered.");
assert(html.includes("Your digital needs"), "The store hero is missing.");
assert(html.includes("Popular products"), "The product section is missing.");
assert(html.includes("Our services"), "The service categories are missing.");
assert(/no-store/i.test(home.headers.get("cache-control") || ""), "The storefront must not serve cached starter HTML.");
console.log("PASS real Store OTP homepage; no starter screen; entry-page caching disabled");

for (const path of ["/store", "/store/premium", "/store/proxies", "/store/socials", "/numbers", "/services", "/orders", "/news", "/updates", "/install", "/account", "/account/profile", "/notifications", "/wallet", "/support", "/terms", "/register", "/login", "/admin"]) {
  const content = await (await get(path)).text();
  assert(!starter.test(content), `Starter content found at ${path}.`);
  assert(content.includes("Store OTP"), `Missing application branding at ${path}.`);
  console.log(`PASS ${path}`);
}

const catalog = await (await get("/api/catalog")).json();
assert(Array.isArray(catalog.products));
assert(Array.isArray(catalog.categories));
assert(Array.isArray(catalog.announcements));
assert.equal(typeof catalog.settings?.appName, "string");
assert(!catalog.products.some(product => "fulfillment" in product), "Private delivery data leaked into the public catalog.");
console.log(`PASS working catalog API (${catalog.products.length} published products)`);
console.log(`STORE OTP PREVIEW VERIFIED: ${base}`);
