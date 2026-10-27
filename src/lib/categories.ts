export type CategoryField = { key: string; label: string; placeholder: string };
export type CategoryTemplate = "social" | "proxies" | "premium" | "subscriptions" | "digital" | "generic";
export type StoreCategory = {
  id: string; slug: string; name: string; subtitle: string; detail: string; icon: string; color: string;
  imageUrl: string | null; formType: string; fields: CategoryField[]; position: number; active: boolean; kind: string;
};
export const categoryFields: Record<string, CategoryField[]> = {
  social: [{ key: "platform", label: "Social platform", placeholder: "Instagram" }, { key: "accountType", label: "Account / product type", placeholder: "Creator toolkit" }, { key: "accountAge", label: "Account age", placeholder: "2 years" }, { key: "region", label: "Region", placeholder: "Global" }, { key: "quantity", label: "Included items", placeholder: "120 templates" }],
  proxies: [{ key: "bandwidth", label: "Bandwidth allowance", placeholder: "1 GB" }, { key: "protocol", label: "Supported protocols", placeholder: "HTTP / SOCKS5" }, { key: "region", label: "Country / region", placeholder: "United States" }, { key: "rotation", label: "IP rotation", placeholder: "Rotating" }],
  premium: [{ key: "plan", label: "App plan", placeholder: "Pro" }, { key: "duration", label: "License duration", placeholder: "1 month" }, { key: "devices", label: "Device allowance", placeholder: "1 device" }, { key: "region", label: "Region", placeholder: "Global" }],
  subscriptions: [{ key: "plan", label: "Subscription tier", placeholder: "Premium" }, { key: "duration", label: "Subscription duration", placeholder: "1 month" }, { key: "renewal", label: "Renewal policy", placeholder: "Manual renewal" }, { key: "region", label: "Region", placeholder: "Global" }],
  digital: [{ key: "format", label: "File / product format", placeholder: "PDF, ZIP, website, or template" }, { key: "license", label: "License terms", placeholder: "Personal use" }, { key: "version", label: "Version", placeholder: "1.0" }, { key: "requirements", label: "System requirements", placeholder: "Any modern browser" }],
  generic: [{ key: "type", label: "Product type", placeholder: "What kind of product is this?" }, { key: "includes", label: "What’s included", placeholder: "List the key inclusions" }, { key: "duration", label: "Duration / validity", placeholder: "Lifetime, one month, or one-time" }, { key: "requirements", label: "Requirements", placeholder: "Any requirements the customer should know" }],
};
export const categoryTemplates = [
  { id: "generic", name: "General product" }, { id: "digital", name: "Digital download / software" },
  { id: "premium", name: "App license" }, { id: "subscriptions", name: "Subscription" },
  { id: "social", name: "Social product" }, { id: "proxies", name: "Proxy / connectivity" },
];
export const categoryIcons = ["sim", "social", "server", "crown", "netflix", "gift", "package", "code", "book", "gamepad", "music", "globe", "sparkles", "briefcase", "graduation", "palette"];
export const categoryColors = ["blue", "violet", "cyan", "gold", "green", "pink"];
export const reservedCategorySlugs = ["product", "products", "all", "category", "categories", "search", "checkout", "new", "admin", "social", "build"];
export function categoryHref(category: Pick<StoreCategory, "kind" | "slug">) { return category.kind === "sms" ? "/numbers" : category.kind === "development" ? "/build" : `/store/${encodeURIComponent(category.slug)}`; }
export function productHref(id: string) { return `/store/product/${encodeURIComponent(id)}`; }
export function fieldsForCategory(category?: Pick<StoreCategory, "fields" | "formType">) { return category?.fields?.length ? category.fields : categoryFields[category?.formType || "generic"] || categoryFields.generic; }
export function normalizeCategorySlug(slug: string) { const normalized = slug.trim().toLowerCase(); return normalized === "social" ? "socials" : normalized; }
export const initialCategories: StoreCategory[] = [
  { id: "numbers", slug: "numbers", name: "Virtual Numbers", subtitle: "Receive OTPs. Stay private.", detail: "Get verified with numbers from 190+ countries.", icon: "sim", color: "blue", kind: "sms" },
  { id: "social", slug: "socials", name: "Social Media Accounts", subtitle: "Your social world, upgraded.", detail: "Discover social tools, creative resources, and authorized digital services.", icon: "social", color: "violet", formType: "social" },
  { id: "proxies", slug: "proxies", name: "Residential Proxies", subtitle: "Real IPs. Real peace of mind.", detail: "Browse securely with residential connections.", icon: "server", color: "cyan", formType: "proxies" },
  { id: "premium", slug: "premium", name: "Premium Apps", subtitle: "Your favorite tools, upgraded.", detail: "Find the tools and apps that help you do more.", icon: "crown", color: "gold", formType: "premium" },
  { id: "subscriptions", slug: "subscriptions", name: "Accounts & Subscriptions", subtitle: "More of what you love.", detail: "Streaming, creativity, and productivity essentials.", icon: "netflix", color: "green", formType: "subscriptions" },
  { id: "digital", slug: "digital", name: "Digital Products", subtitle: "Good ideas start with great tools.", detail: "Explore downloads, software, templates, and more.", icon: "gift", color: "pink", formType: "digital" },
  { id: "build", slug: "build", name: "Websites & Bots", subtitle: "Built for you, by a developer.", detail: "Websites, web apps, Telegram and WhatsApp bots, made to your brief.", icon: "code", color: "cyan", kind: "development" },
].map((c, position) => ({ formType: "generic", kind: "products", ...c, imageUrl: null, fields: [], active: true, position }));
