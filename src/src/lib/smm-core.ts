// Boost (social media growth / SMM) — shared, dependency-free logic.
// Safe to import from both the browser and the server: no secrets, no provider names, no I/O.
// Customers only ever see the neutral aliases below ("SMM v1", "SMM v2").

export type SmmProviderId = "v1" | "v2";
export const SMM_PROVIDERS: { id: SmmProviderId; label: string; tagline: string }[] = [
  { id: "v1", label: "SMM v1", tagline: "Fast starts, wide choice" },
  { id: "v2", label: "SMM v2", tagline: "Alternative catalog and pricing" },
];
export function isSmmProvider(value: unknown): value is SmmProviderId { return value === "v1" || value === "v2"; }
export function providerLabel(id: string) { return SMM_PROVIDERS.find(p => p.id === id)?.label || "SMM"; }

// A service as returned by an upstream provider, normalized. `rate` is USD per 1,000 units, before our markup.
export type SmmService = { id: string; name: string; category: string; type: string; rate: number; min: number; max: number; refill: boolean; cancel: boolean };
// What a browser receives: markup already applied (`unit` = USD per 1,000, `per1000` = that rounded up to cents for display).
export type PublicSmmService = { id: string; name: string; min: number; max: number; unit: number; per1000: number; refill: boolean; cancel: boolean };
export type SmmPlatform = { id: string; name: string; count: number };
export type SmmCategory = { id: string; name: string; count: number };
export type PublicSmmOrder = { id: string; provider: string; platform: string; serviceName: string; link: string; quantity: number; remains: number | null; startCount: number | null; price: number; currency: string; status: string; isDemo: boolean; createdAt: string };

// ---------- Platforms ----------
// `re` is matched against the provider's category name first, then the service name.
export const PLATFORMS: { id: string; name: string; color: string; re: RegExp }[] = [
  { id: "instagram", name: "Instagram", color: "#e1306c", re: /instagram|\binsta\b|\big\b/i },
  { id: "facebook", name: "Facebook", color: "#1877f2", re: /facebook|\bfb\b/i },
  { id: "tiktok", name: "TikTok", color: "#111111", re: /tik\s?-?tok/i },
  { id: "youtube", name: "YouTube", color: "#ff0000", re: /youtube|\byt\b/i },
  { id: "twitter", name: "X (Twitter)", color: "#111111", re: /twitter|\btweets?\b|\bx\s*\(twitter\)|\bx[\s-]+(followers|likes|views|retweets|reposts|comments|impressions|polls?|spaces|bookmarks)/i },
  { id: "telegram", name: "Telegram", color: "#229ed9", re: /telegram|\btg\b/i },
  { id: "whatsapp", name: "WhatsApp", color: "#25d366", re: /whats\s?app/i },
  { id: "spotify", name: "Spotify", color: "#1db954", re: /spotify/i },
  { id: "linkedin", name: "LinkedIn", color: "#0a66c2", re: /linked\s?in/i },
  { id: "snapchat", name: "Snapchat", color: "#f7d400", re: /snap\s?chat/i },
  { id: "pinterest", name: "Pinterest", color: "#e60023", re: /pinterest/i },
  { id: "reddit", name: "Reddit", color: "#ff4500", re: /reddit/i },
  { id: "twitch", name: "Twitch", color: "#9146ff", re: /twitch/i },
  { id: "discord", name: "Discord", color: "#5865f2", re: /discord/i },
  { id: "kick", name: "Kick", color: "#53fc18", re: /\bkick\b/i },
  { id: "likee", name: "Likee", color: "#ff2d55", re: /likee/i },
  { id: "quora", name: "Quora", color: "#b92b27", re: /quora/i },
  { id: "soundcloud", name: "SoundCloud", color: "#ff5500", re: /sound\s?cloud/i },
  { id: "audiomack", name: "Audiomack", color: "#ffa200", re: /audiomack/i },
  { id: "threads", name: "Threads", color: "#111111", re: /\bthreads\b/i },
  { id: "bluesky", name: "Bluesky", color: "#1185fe", re: /bluesky/i },
  { id: "apple", name: "Apple", color: "#111111", re: /apple\s?(music|podcasts?)|itunes|\bapple\b/i },
  { id: "google", name: "Google", color: "#4285f4", re: /google|\bgmb\b|play\s?store/i },
  { id: "shopee", name: "Shopee", color: "#ee4d2d", re: /shopee/i },
  { id: "yandex", name: "Yandex", color: "#fc3f1d", re: /yandex|\bzen\b/i },
  { id: "vk", name: "VK", color: "#0077ff", re: /\bvk\b|vkontakte/i },
  { id: "trustpilot", name: "Trustpilot", color: "#00b67a", re: /trustpilot/i },
  { id: "dailymotion", name: "Dailymotion", color: "#0066dc", re: /dailymotion/i },
  { id: "vimeo", name: "Vimeo", color: "#1ab7ea", re: /vimeo/i },
  { id: "rumble", name: "Rumble", color: "#85c742", re: /rumble/i },
  { id: "mixcloud", name: "Mixcloud", color: "#5000ff", re: /mixcloud/i },
  { id: "deezer", name: "Deezer", color: "#a238ff", re: /deezer/i },
  { id: "tumblr", name: "Tumblr", color: "#36465d", re: /tumblr/i },
  { id: "website", name: "Website", color: "#475569", re: /web\s?site|web\s?traffic|\btraffic\b|\bseo\b|backlink|\bvisitors?\b/i },
];
export const OTHER_PLATFORM = { id: "other", name: "Other", color: "#64748b" };
export function platformInfo(id: string) { return PLATFORMS.find(p => p.id === id) || { ...OTHER_PLATFORM, re: /$^/ }; }
export function detectPlatform(service: Pick<SmmService, "category" | "name">): string {
  for (const p of PLATFORMS) if (p.re.test(service.category)) return p.id;
  for (const p of PLATFORMS) if (p.re.test(service.name)) return p.id;
  return OTHER_PLATFORM.id;
}

// Short, stable id for a provider category (providers have no usable category id). FNV-1a, 32-bit.
export function categoryId(name: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// Removes URLs and any provider branding that a catalog might embed in names, so aliases stay neutral.
const BRANDING = /exo\s?supplier|peakerr/gi;
export function cleanText(text: string) {
  return text.replace(/https?:\/\/\S+/gi, "").replace(/\b[a-z0-9-]+\.(com|net|org|io|co|app|shop)\b/gi, "").replace(BRANDING, "").replace(/\s{2,}/g, " ").replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, "").trim();
}

// ---------- Catalog navigation ----------
export function platformsOf(services: SmmService[]): SmmPlatform[] {
  const counts = new Map<string, number>();
  for (const s of services) { const id = detectPlatform(s); counts.set(id, (counts.get(id) || 0) + 1); }
  return [...counts].map(([id, count]) => ({ id, name: platformInfo(id).name, count })).sort((a, b) => (a.id === "other" ? 1 : b.id === "other" ? -1 : a.name.localeCompare(b.name)));
}
export function categoriesOf(services: SmmService[], platform: string): SmmCategory[] {
  const map = new Map<string, SmmCategory>();
  for (const s of services) {
    if (detectPlatform(s) !== platform) continue;
    const id = categoryId(s.category); const row = map.get(id);
    if (row) row.count++; else map.set(id, { id, name: s.category, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
export function servicesOf(services: SmmService[], platform: string, category: string) {
  return services.filter(s => detectPlatform(s) === platform && categoryId(s.category) === category).sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
}

// ---------- Pricing (USD cents) ----------
// Provider rate = USD per 1,000 units. The browser receives only `unit` (rate with our markup applied) and runs the
// exact same arithmetic as the server (`priceFor`), so the total shown is the total charged — without exposing the raw
// provider rate or the margin.
const EPS = 1e-7;
export function unitRate(rate: number, markupPercent: number) { return rate * (1 + markupPercent / 100); }
export function priceFor(unit: number, quantity: number) { return Math.max(1, Math.ceil((unit * quantity) / 10 - EPS)); }
export function quoteSmm(rate: number, quantity: number, markupPercent: number) {
  return { cost: Math.max(1, Math.ceil((rate * quantity) / 10 - EPS)), price: priceFor(unitRate(rate, markupPercent), quantity) };
}
export function per1000Cents(unit: number) { return Math.max(1, Math.ceil(unit * 100 - EPS)); }
export function toPublicService(s: SmmService, markupPercent: number): PublicSmmService {
  const unit = unitRate(s.rate, markupPercent);
  return { id: s.id, name: s.name, min: s.min, max: s.max, unit, per1000: per1000Cents(unit), refill: s.refill, cancel: s.cancel };
}
export function validQuantity(service: Pick<SmmService, "min" | "max">, quantity: number) {
  return Number.isInteger(quantity) && quantity >= service.min && quantity <= service.max;
}
export function validLink(value: string) {
  if (value.length < 8 || value.length > 500 || /\s/.test(value)) return false;
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes("."); } catch { return false; }
}

// ---------- Status ----------
export type SmmStatus = "provisioning" | "pending" | "processing" | "completed" | "partial" | "cancelled" | "failed" | "reconciliation";
export const SMM_ACTIVE: SmmStatus[] = ["provisioning", "pending", "processing"];
export const SMM_TERMINAL: SmmStatus[] = ["completed", "partial", "cancelled", "failed"];
export function mapProviderStatus(raw: unknown): SmmStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "completed" || s === "complete" || s === "success" || s === "finished") return "completed";
  if (s === "partial") return "partial";
  if (s.startsWith("cancel") || s === "refunded" || s === "fail" || s === "failed" || s === "error") return "cancelled";
  if (s === "pending" || s === "queued" || s === "awaiting") return "pending";
  return "processing"; // "In progress", "Processing", anything new — keep polling.
}
// Customer refund for a partially delivered order: the undelivered share of what they paid (rounded down).
export function partialRefundAmount(price: number, quantity: number, remains: number) {
  if (!(quantity > 0) || !(remains > 0)) return 0;
  return Math.min(price, Math.floor((price * Math.min(remains, quantity)) / quantity));
}
export function isActiveStatus(status: string) { return (SMM_ACTIVE as string[]).includes(status); }
export function statusLabel(status: string) {
  return ({ provisioning: "Starting", pending: "Pending", processing: "In progress", completed: "Completed", partial: "Partially delivered", cancelled: "Refunded", failed: "Refunded", reconciliation: "Being checked" } as Record<string, string>)[status] || status;
}

// ---------- Sandbox catalog ----------
// A believable sample catalog for demo mode. v1 and v2 differ on purpose so switching providers is visible.
type Kind = { key: string; label: string; rate: [number, number, number]; min: number; max: number };
const KINDS: Kind[] = [
  { key: "followers", label: "Followers", rate: [0.9, 1.6, 3.2], min: 50, max: 100000 },
  { key: "likes", label: "Likes", rate: [0.35, 0.7, 1.4], min: 20, max: 50000 },
  { key: "views", label: "Views", rate: [0.03, 0.08, 0.18], min: 100, max: 1000000 },
];
const DEMO_PLATFORMS: Record<string, string[]> = {
  instagram: ["Followers", "Likes", "Views"], facebook: ["Followers", "Likes", "Views"], tiktok: ["Followers", "Likes", "Views"], youtube: ["Subscribers", "Likes", "Views"],
  twitter: ["Followers", "Likes", "Views"], telegram: ["Members", "Reactions", "Views"], spotify: ["Followers", "Plays", "Saves"], linkedin: ["Followers", "Likes", "Views"],
  snapchat: ["Followers", "Likes", "Views"], pinterest: ["Followers", "Likes", "Views"], twitch: ["Followers", "Likes", "Views"], discord: ["Members", "Reactions", "Views"],
};
const TIERS: Record<SmmProviderId, string[]> = { v1: ["Standard", "Real", "Premium"], v2: ["Economy", "High Quality", "Elite"] };
export function demoSmmServices(provider: SmmProviderId): SmmService[] {
  const out: SmmService[] = []; let id = provider === "v1" ? 1000 : 5000; const factor = provider === "v1" ? 1 : 0.86;
  for (const [platformId, labels] of Object.entries(DEMO_PLATFORMS)) {
    const platform = platformInfo(platformId).name;
    KINDS.forEach((kind, k) => {
      const label = labels[k] || kind.label;
      TIERS[provider].forEach((tier, t) => {
        const refill = t > 0;
        out.push({ id: String(id++), name: `${platform} ${label} [${tier}]${refill ? ` [Refill: ${t === 1 ? 30 : 90} Days]` : ""} [Start: ${t === 0 ? "0-6" : "0-1"} Hour] [Speed: ${(t + 1) * 5}K/Day]`, category: `${platform} ${label}${t === 2 ? " [Premium]" : ""}`, type: "Default", rate: Math.round(kind.rate[t] * factor * 10000) / 10000, min: kind.min, max: kind.max, refill, cancel: t === 0 });
      });
    });
  }
  return out;
}
// Deterministic sandbox progress so the status screens can be previewed without a provider.
export function demoProgress(quantity: number, createdAt: Date | string, now = Date.now()) {
  const elapsed = Math.max(0, (now - new Date(createdAt).getTime()) / 1000);
  if (elapsed < 12) return { status: "pending" as SmmStatus, remains: quantity, startCount: 0 };
  if (elapsed < 75) return { status: "processing" as SmmStatus, remains: Math.max(1, Math.round(quantity * (1 - (elapsed - 12) / 63))), startCount: 120 };
  return { status: "completed" as SmmStatus, remains: 0, startCount: 120 };
}
