// Shared (client + server) definitions for the "Websites & Bots" service.
// Every project type has its own brief form. The server validates answers against these same definitions.
export type FieldType = "text" | "textarea" | "select" | "multiselect" | "yesno" | "url" | "number" | "date" | "email";
export type FormField = { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; placeholder?: string; help?: string; max?: number; min?: number; showIf?: { key: string; notEquals?: string; equals?: string } };
export type FormSection = { id: string; title: string; description?: string; note?: string; fields: FormField[] };
export type DevType = { id: string; name: string; tagline: string; icon: string; description: string; includes: string[]; sections: FormSection[] };
export type BriefValue = string | string[];
export type Brief = Record<string, BriefValue>;
const o = (s: string) => s.split("|").map(v => v.trim());

const budgets = o("Under $100|$100 – $300|$300 – $700|$700 – $1,500|$1,500 – $3,000|$3,000 – $7,500|$7,500 or more|Not sure, suggest a budget");
const timelines = o("As soon as possible (rush)|Within 2 weeks|2 – 4 weeks|1 – 2 months|More than 2 months|Flexible, no rush");
const designStatus = o("I have a finished design (Figma, XD or PDF)|I only have a logo and brand colors|I need a design from scratch|A clean template is fine|Match an existing website or app");
const hostingChoices = o("Developer hosts it for me (managed)|I already have hosting or a server|Free-tier cloud deployment|Not sure, please advise");
const noSecrets = "Never type passwords, API keys, bot tokens or card details into this form. If your project needs access, the developer will ask for it through a secure channel once work begins.";

function basics(what: string): FormSection {
  return { id: "basics", title: "About your project", description: `Tell us the essentials of your ${what}.`, fields: [
    { key: "projectName", label: "Project name", type: "text", required: true, max: 100, placeholder: "e.g. Bright Cafe, ShopBuddy Bot" },
    { key: "summary", label: "What do you want built?", type: "textarea", required: true, min: 20, max: 2000, placeholder: "Describe the idea in a few sentences. What should it do, and what should people be able to achieve with it?" },
    { key: "goal", label: "Main goal", type: "select", required: true, options: o("Launch a new business or idea|Improve something I already have|Automate a manual process|Sell products or services|Build an audience or community|An internal tool for my team|Something else") },
    { key: "audience", label: "Who will use it?", type: "textarea", required: true, max: 1000, placeholder: "e.g. Young professionals in Lagos, students, my existing customers…" },
    { key: "contactMethod", label: "Best way to reach you", type: "select", required: true, options: o("Messages inside Digisms|Email|WhatsApp|Telegram|Phone call") },
    { key: "contactDetail", label: "Your email, number or username", type: "text", max: 120, placeholder: "How should we contact you?", showIf: { key: "contactMethod", notEquals: "Messages inside Digisms" } },
  ] };
}
function wrapUp(): FormSection {
  return { id: "wrapup", title: "Budget, timeline & support", description: "This helps us give you an accurate quote.", fields: [
    { key: "budget", label: "Budget range", type: "select", required: true, options: budgets },
    { key: "timeline", label: "When do you need it?", type: "select", required: true, options: timelines },
    { key: "deadline", label: "Hard deadline or launch date (if any)", type: "date" },
    { key: "support", label: "After delivery", type: "select", required: true, options: o("No ongoing support needed|Bug fixes for 30 days|Monthly maintenance and updates|Not sure yet") },
    { key: "ownership", label: "Ownership of the code", type: "select", required: true, options: o("I want the full source code|Hosted and managed by the developer only|Not sure yet") },
    { key: "nda", label: "Do you need an NDA signed before sharing details?", type: "yesno" },
    { key: "references", label: "Examples you like", type: "textarea", max: 1500, placeholder: "Links to websites, apps or bots you like, one per line, and what you like about them." },
    { key: "notes", label: "Anything else we should know?", type: "textarea", max: 2000 },
  ] };
}

const website: DevType = { id: "website", name: "Website", icon: "globe", tagline: "Business sites, portfolios, landing pages and blogs.", description: "A fast, mobile-friendly website that represents your brand and turns visitors into customers.", includes: ["Responsive design", "Contact forms", "Basic SEO setup", "Deployment"], sections: [
  basics("website"),
  { id: "site", title: "Website type & pages", fields: [
    { key: "siteType", label: "What kind of website?", type: "select", required: true, options: o("Business or corporate|Portfolio or personal brand|Single landing page|Blog, magazine or news|Restaurant or hospitality|Booking or appointments|Directory or listings|Non-profit or NGO|Event or conference|Something else") },
    { key: "pageCount", label: "Roughly how many pages?", type: "select", required: true, options: o("1 page|2 – 5 pages|6 – 10 pages|11 – 20 pages|More than 20 pages") },
    { key: "pages", label: "Pages you need", type: "multiselect", options: o("Home|About|Services|Portfolio or gallery|Pricing|Blog or news|Contact|FAQ|Team|Testimonials|Careers|Privacy and terms|Shop or products|Booking") },
    { key: "features", label: "Features", type: "multiselect", options: o("Contact form|WhatsApp or live chat button|Blog or articles|Image or video gallery|Newsletter signup|Booking or appointments|Online payments|Multiple languages|Site search|User accounts and login|Admin area to edit content|Maps and location|Social media feeds|Cookie consent banner|Analytics|Animations and effects") },
    { key: "featuresOther", label: "Any other feature?", type: "textarea", max: 1000 },
  ] },
  { id: "design", title: "Design & content", fields: [
    { key: "designStatus", label: "Design", type: "select", required: true, options: designStatus },
    { key: "style", label: "Style you have in mind", type: "multiselect", options: o("Modern|Minimal|Bold|Elegant or luxury|Playful|Corporate and professional|Dark mode|Colorful") },
    { key: "assets", label: "What you already have", type: "multiselect", options: o("Logo|Brand colors|Fonts|Photos|Videos|Written content|Style guide|Nothing yet") },
    { key: "contentBy", label: "Website content", type: "select", required: true, options: o("I will provide all content|I need help writing content|A mix of both|Placeholder content for now") },
    { key: "languages", label: "Languages", type: "text", max: 120, placeholder: "e.g. English, French" },
    { key: "accessibility", label: "Accessibility", type: "select", options: o("Standard best practices|WCAG AA compliance required|Not sure") },
  ] },
  { id: "tech", title: "Technical preferences", note: "Not sure? Choose “Developer’s choice” and we will recommend what fits your budget.", fields: [
    { key: "cms", label: "Editing your content", type: "select", required: true, options: o("No editing needed (static site)|I want an admin area to edit content|WordPress|Headless CMS (Sanity, Strapi…)|Developer’s choice") },
    { key: "stack", label: "Technology", type: "select", options: o("Developer’s choice (recommended)|Next.js or React|WordPress or PHP|Laravel|Plain HTML, CSS and JavaScript|Other") },
    { key: "domain", label: "Domain name", type: "select", required: true, options: o("I own a domain|I need help buying a domain|Not sure") },
    { key: "hosting", label: "Hosting", type: "select", required: true, options: hostingChoices },
    { key: "seo", label: "SEO", type: "select", options: o("Basic SEO setup|Advanced SEO (speed, schema, keywords)|None") },
    { key: "integrations", label: "Tools to connect", type: "textarea", max: 1000, placeholder: "e.g. Google Analytics, Mailchimp, Stripe, a CRM…" },
    { key: "existingSite", label: "Current website (if redesigning)", type: "url", placeholder: "https://" },
  ] },
  wrapUp(),
] };

const webapp: DevType = { id: "webapp", name: "Web application", icon: "code", tagline: "Dashboards, SaaS platforms, portals and custom tools.", description: "A custom web app with accounts, data and workflows built around how your business really works.", includes: ["Secure login", "Admin dashboard", "Database design", "Deployment"], sections: [
  basics("web application"),
  { id: "overview", title: "Application overview", fields: [
    { key: "appType", label: "What kind of application?", type: "select", required: true, options: o("SaaS platform|Admin dashboard or back-office|Marketplace|Social or community platform|Learning platform (LMS)|CRM, ERP or inventory|Booking or reservations|Wallet, fintech or payments|Customer portal|Internal company tool|Something else") },
    { key: "problem", label: "What problem does it solve?", type: "textarea", required: true, max: 1500 },
    { key: "coreFeatures", label: "Main features", type: "textarea", required: true, max: 3000, placeholder: "List the key features, one per line." },
    { key: "roles", label: "Types of users", type: "multiselect", options: o("Visitors|Registered users|Admins|Moderators|Vendors or sellers|Staff or employees|Customers or clients") },
    { key: "roleNotes", label: "What can each type of user do?", type: "textarea", max: 1500 },
    { key: "scale", label: "Expected number of users", type: "select", required: true, options: o("Under 100|100 – 1,000|1,000 – 10,000|10,000 – 100,000|More than 100,000|Not sure") },
  ] },
  { id: "security", title: "Accounts & security", fields: [
    { key: "auth", label: "How will people sign in?", type: "multiselect", options: o("Email and password|Google|Apple|Facebook|Phone number (OTP)|Magic link|Two-factor authentication|Single sign-on (SSO)") },
    { key: "security", label: "Security needs", type: "multiselect", options: o("Role-based permissions|Audit logs|Rate limiting|Data encryption|GDPR compliance|Regular backups|IP restrictions|Not sure") },
    { key: "multiTenant", label: "Will separate companies or teams each get their own workspace?", type: "yesno" },
  ] },
  { id: "features", title: "Features & integrations", fields: [
    { key: "payments", label: "Payments", type: "multiselect", options: o("None|Stripe|PayPal|Paystack|Flutterwave|Mobile money|Crypto|Bank transfer|Subscriptions and recurring billing") },
    { key: "notifications", label: "Notifications", type: "multiselect", options: o("Email|SMS|Push|In-app|WhatsApp|Telegram") },
    { key: "extras", label: "Extras", type: "multiselect", options: o("Admin dashboard|Reports and analytics|Search and filters|File uploads|Real-time updates or chat|Maps and location|Import and export (CSV, PDF)|Public API|AI features|Multiple languages|Dark mode|Installable app (PWA)") },
    { key: "thirdParty", label: "Services or APIs to connect", type: "textarea", max: 1500 },
    { key: "migration", label: "Do you need to import existing data?", type: "yesno" },
  ] },
  { id: "tech", title: "Design & technical", note: "Not sure about the technical choices? Pick “Developer’s choice”.", fields: [
    { key: "designStatus", label: "Design", type: "select", required: true, options: designStatus },
    { key: "stack", label: "Technology", type: "select", options: o("Developer’s choice (recommended)|Next.js or React with Node.js|Laravel|Django or Python|Ruby on Rails|.NET|Other") },
    { key: "database", label: "Database", type: "select", options: o("Developer’s choice|PostgreSQL|MySQL|MongoDB|Firebase or Supabase") },
    { key: "hosting", label: "Hosting", type: "select", required: true, options: o("Developer hosts it for me (managed)|Vercel or similar|AWS, Google Cloud or Azure|My own server|Not sure, please advise") },
    { key: "mobile", label: "Mobile", type: "select", options: o("Responsive website only|Responsive plus installable app (PWA)|I will also want a native mobile app later") },
    { key: "docs", label: "Documentation you need", type: "multiselect", options: o("User guide|API documentation|Technical documentation|Training session") },
    { key: "existingSystem", label: "Existing system (link, if any)", type: "url", placeholder: "https://" },
  ] },
  wrapUp(),
] };

const ecommerce: DevType = { id: "ecommerce", name: "Online store", icon: "shop", tagline: "Sell products online with carts, payments and shipping.", description: "A complete online store, custom-built or on Shopify or WooCommerce, ready to take orders.", includes: ["Product catalog", "Checkout & payments", "Order management", "Deployment"], sections: [
  basics("online store"),
  { id: "store", title: "Store basics", fields: [
    { key: "platform", label: "Platform", type: "select", required: true, options: o("Custom-built|Shopify|WooCommerce (WordPress)|Developer’s recommendation") },
    { key: "productCount", label: "Number of products", type: "select", required: true, options: o("1 – 20|21 – 100|101 – 500|More than 500") },
    { key: "productTypes", label: "What will you sell?", type: "multiselect", required: true, options: o("Physical goods|Digital downloads|Services or bookings|Subscriptions|Print on demand|Dropshipping") },
    { key: "sellers", label: "Store model", type: "select", required: true, options: o("Single store (just me)|Multi-vendor marketplace") },
    { key: "countries", label: "Countries you will sell to", type: "text", max: 200 },
    { key: "currencies", label: "Currencies", type: "text", max: 120, placeholder: "e.g. USD, NGN, EUR" },
  ] },
  { id: "ops", title: "Payments, shipping & features", fields: [
    { key: "gateways", label: "Payment methods", type: "multiselect", options: o("Stripe|PayPal|Paystack|Flutterwave|Mobile money|Crypto|Cash on delivery|Bank transfer") },
    { key: "shipping", label: "Shipping", type: "multiselect", options: o("Flat rate|By weight or location|Free shipping|Local pickup|Courier integration|Digital delivery only|Not needed") },
    { key: "features", label: "Store features", type: "multiselect", options: o("Customer accounts|Guest checkout|Coupons and discounts|Product reviews|Wishlist|Inventory management|Abandoned cart emails|Multiple currencies|Multiple languages|Order tracking|Invoices and receipts|Product variants (size, color)|Loyalty or referral program|Admin dashboard|Tax calculation|Ordering through WhatsApp") },
    { key: "tax", label: "Taxes", type: "select", options: o("No tax|Simple VAT or sales tax|Complex, by region|Not sure") },
    { key: "integrations", label: "Tools to connect", type: "textarea", max: 1000 },
  ] },
  { id: "launch", title: "Design & launch", fields: [
    { key: "designStatus", label: "Design", type: "select", required: true, options: designStatus },
    { key: "assets", label: "What you already have", type: "multiselect", options: o("Logo|Brand colors|Product photos|Product descriptions|Product spreadsheet|Nothing yet") },
    { key: "productData", label: "Adding products", type: "select", required: true, options: o("I will add products myself|Developer uploads my products|I have a spreadsheet to import") },
    { key: "marketing", label: "Marketing tools", type: "multiselect", options: o("SEO|Google Analytics|Meta Pixel|Email marketing|Social media integration") },
    { key: "hosting", label: "Hosting", type: "select", options: hostingChoices },
    { key: "existingStore", label: "Current store (if any)", type: "url", placeholder: "https://" },
  ] },
  wrapUp(),
] };

const telegram: DevType = { id: "telegram-bot", name: "Telegram bot", icon: "send", tagline: "Support, sales, payments and community bots for Telegram.", description: "A reliable Telegram bot that serves your customers, runs your community or automates your work, around the clock.", includes: ["Bot setup", "Admin controls", "Hosting guidance", "Handover & docs"], sections: [
  basics("Telegram bot"),
  { id: "purpose", title: "What should the bot do?", fields: [
    { key: "botType", label: "Type of bot", type: "select", required: true, options: o("Customer support or FAQ|Shop or order-taking|Payments and subscriptions|Group or community moderation|Channel manager or auto-poster|Notifications and alerts|AI chatbot|Booking or appointments|Quiz or game|Utility tool (converter, downloader…)|Telegram Mini App|Lead capture or surveys|Something else") },
    { key: "userFlow", label: "How does a user use the bot?", type: "textarea", required: true, min: 20, max: 3000, placeholder: "Walk us through it step by step, from the first /start to the end result." },
    { key: "commands", label: "Commands and menu options", type: "textarea", max: 2000, placeholder: "One per line, e.g. /start – welcome message" },
    { key: "interface", label: "How will people interact with it?", type: "multiselect", options: o("Slash commands|Inline buttons|Reply keyboard|Inline mode (@bot search)|Mini App (web view)|Deep links|Posting to channels or groups") },
    { key: "languages", label: "Languages", type: "text", max: 120, placeholder: "e.g. English, French" },
    { key: "scale", label: "Expected users", type: "select", required: true, options: o("Under 100|100 – 1,000|1,000 – 10,000|10,000 – 100,000|More than 100,000|Not sure") },
  ] },
  { id: "features", title: "Features", fields: [
    { key: "features", label: "Features you want", type: "multiselect", options: o("Welcome and onboarding|Admin panel inside Telegram|Web admin dashboard|Broadcast messages|Scheduled messages or posts|User database and profiles|Referral system|Premium or subscription access|Telegram payments (Stars or provider)|Crypto payments|Force-join channel check|Anti-spam and captcha|Multiple languages|Statistics and analytics|File and media handling|Polls and quizzes|Inline search results|Website or API integration|AI features|Data export (CSV)") },
    { key: "admins", label: "Who manages the bot?", type: "select", options: o("Only me|Several admins with different roles|Not sure") },
    { key: "externalApis", label: "Services or APIs to connect", type: "textarea", max: 1500 },
  ] },
  { id: "tech", title: "Technical setup", note: noSecrets, fields: [
    { key: "botStatus", label: "Your bot account", type: "select", required: true, options: o("I already have a bot from BotFather|The developer creates it under my account|The developer creates it and transfers ownership|Not sure") },
    { key: "botName", label: "Preferred bot name or username", type: "text", max: 80, placeholder: "e.g. @BrightShopBot" },
    { key: "language", label: "Programming language", type: "select", options: o("Developer’s choice (recommended)|Python (aiogram or python-telegram-bot)|Node.js (grammY or Telegraf)|PHP|Go|Other") },
    { key: "database", label: "Database", type: "select", options: o("Developer’s choice|SQLite|PostgreSQL|MySQL|MongoDB|Redis|None needed") },
    { key: "hosting", label: "Hosting", type: "select", required: true, options: o("Developer hosts it for me (managed)|I have a VPS or server|Cloud platform (Railway, Render…)|Not sure, please advise") },
    { key: "updatesMode", label: "Telegram connection method", type: "select", options: o("Developer’s choice|Webhook|Long polling") },
  ] },
  wrapUp(),
] };

const whatsapp: DevType = { id: "whatsapp-bot", name: "WhatsApp bot", icon: "chat", tagline: "Automate customer chats and notifications on WhatsApp.", description: "A WhatsApp assistant that answers customers, takes orders and sends updates, built the safe way.", includes: ["Official API setup help", "Conversation flows", "Template guidance", "Handover & docs"], sections: [
  basics("WhatsApp bot"),
  { id: "purpose", title: "What should the bot do?", fields: [
    { key: "botType", label: "Type of bot", type: "select", required: true, options: o("Customer support and FAQ|Order taking and catalog shopping|Appointment booking and reminders|Order and delivery notifications|Lead capture and CRM|Marketing broadcasts (opt-in only)|OTP or verification messages|AI assistant|Surveys and feedback|Payments and invoices|Something else") },
    { key: "userFlow", label: "How does a customer use it?", type: "textarea", required: true, min: 20, max: 3000, placeholder: "Describe the conversation from the first message to the end result." },
    { key: "menu", label: "Menu or main options", type: "textarea", max: 2000, placeholder: "e.g. 1. Place an order  2. Track my order  3. Talk to an agent" },
    { key: "languages", label: "Languages", type: "text", max: 120 },
    { key: "volume", label: "Expected monthly conversations", type: "select", required: true, options: o("Under 100|100 – 1,000|1,000 – 10,000|More than 10,000|Not sure") },
  ] },
  { id: "setup", title: "WhatsApp setup", note: "The official WhatsApp Business Platform is the safe, recommended route. Unofficial libraries can get your number banned. Meta charges its own conversation fees, paid directly to Meta or your provider.", fields: [
    { key: "platform", label: "Connection method", type: "select", required: true, options: o("Official WhatsApp Business Platform (Cloud API), recommended|Through a provider (Twilio, 360dialog, WATI…)|WhatsApp Business app with simple automation|Unofficial library (higher risk of a ban)|Not sure, please advise") },
    { key: "meta", label: "Meta Business account", type: "select", required: true, options: o("Yes, verified|Yes, not verified|No, I need help creating one|Not sure") },
    { key: "number", label: "Phone number for the bot", type: "select", required: true, options: o("I have a dedicated number ready|I need to get a number|Use my existing WhatsApp Business number|Not sure") },
    { key: "templates", label: "Message templates", type: "select", options: o("I need help creating and approving templates|I already have approved templates|Not needed (customers message first)|Not sure") },
    { key: "handoff", label: "Should customers be able to chat with a human agent?", type: "yesno" },
  ] },
  { id: "features", title: "Features & technical", note: noSecrets, fields: [
    { key: "features", label: "Features", type: "multiselect", options: o("Buttons and list menus|Product catalog and cart|Payment links|Appointment calendar|Images, PDFs and voice notes|Location sharing|Broadcast campaigns|Auto-replies and business hours|Shared inbox for several agents|CRM or Google Sheets connection|Website, Shopify or WooCommerce link|AI answers from your documents|Multiple languages|Analytics dashboard|Admin dashboard|Opt-in and opt-out management") },
    { key: "integrations", label: "Systems to connect", type: "textarea", max: 1500 },
    { key: "dashboard", label: "Admin dashboard", type: "select", options: o("No dashboard|Simple admin page|Full dashboard with login") },
    { key: "language", label: "Programming language", type: "select", options: o("Developer’s choice (recommended)|Node.js|Python|PHP|Other") },
    { key: "hosting", label: "Hosting", type: "select", required: true, options: o("Developer hosts it for me (managed)|I have a VPS or server|Cloud platform|Not sure, please advise") },
  ] },
  wrapUp(),
] };

const discord: DevType = { id: "discord-bot", name: "Discord bot", icon: "chat", tagline: "Moderation, tickets, economy and community bots.", description: "A Discord bot that keeps your server organised, safe and active.", includes: ["Slash commands", "Admin controls", "Hosting guidance", "Handover & docs"], sections: [
  basics("Discord bot"),
  { id: "purpose", title: "What should the bot do?", fields: [
    { key: "botType", label: "Type of bot", type: "select", required: true, options: o("Moderation and anti-spam|Welcome and roles|Support tickets|Economy or games|Music|Giveaways and events|Server stats and logging|AI assistant|Utility tools|Something else") },
    { key: "userFlow", label: "How should members use it?", type: "textarea", required: true, min: 20, max: 3000 },
    { key: "commands", label: "Commands you want", type: "textarea", max: 2000, placeholder: "One per line, e.g. /ticket open" },
    { key: "interface", label: "Interaction style", type: "multiselect", options: o("Slash commands|Buttons and dropdown menus|Modals (pop-up forms)|Prefix commands|Context menus") },
    { key: "serverSize", label: "Server size", type: "select", required: true, options: o("Under 100 members|100 – 1,000|1,000 – 10,000|More than 10,000|Several servers") },
  ] },
  { id: "tech", title: "Features & technical", note: noSecrets, fields: [
    { key: "features", label: "Features", type: "multiselect", options: o("Web dashboard|Custom embeds|Leveling and XP|Reaction roles|Logging|Auto-moderation|Payments or premium roles|Database storage|Multiple languages|Statistics|Public bot that others can invite") },
    { key: "botStatus", label: "Your Discord application", type: "select", required: true, options: o("I already created the application|The developer creates it for me|Not sure") },
    { key: "language", label: "Programming language", type: "select", options: o("Developer’s choice (recommended)|JavaScript (discord.js)|Python (discord.py)|Other") },
    { key: "database", label: "Database", type: "select", options: o("Developer’s choice|SQLite|PostgreSQL|MongoDB|None needed") },
    { key: "hosting", label: "Hosting", type: "select", required: true, options: o("Developer hosts it for me (managed)|I have a VPS or server|Cloud platform|Not sure, please advise") },
  ] },
  wrapUp(),
] };

const mobile: DevType = { id: "mobile-app", name: "Mobile app", icon: "phone", tagline: "Android and iOS apps for your idea or business.", description: "A polished mobile app, built once for Android and iOS or natively for each, and published to the stores.", includes: ["App design", "Android and/or iOS build", "Store publishing help", "Handover & docs"], sections: [
  basics("mobile app"),
  { id: "app", title: "App overview", fields: [
    { key: "appCategory", label: "Type of app", type: "select", required: true, options: o("Shopping or delivery|Social or community|Education or courses|Health or fitness|Finance or wallet|Booking or services|Business or productivity|Media or entertainment|Utility tool|Something else") },
    { key: "platforms", label: "Platforms", type: "multiselect", required: true, options: o("Android|iOS|Tablet") },
    { key: "framework", label: "Technology", type: "select", options: o("Developer’s choice (recommended)|Flutter|React Native|Native (Kotlin or Swift)|Installable web app (PWA)") },
    { key: "screens", label: "Roughly how many screens?", type: "select", required: true, options: o("1 – 5|6 – 15|16 – 30|More than 30|Not sure") },
    { key: "coreFeatures", label: "Main features", type: "textarea", required: true, max: 3000, placeholder: "List the key features, one per line." },
  ] },
  { id: "features", title: "Features & backend", fields: [
    { key: "features", label: "Features", type: "multiselect", options: o("Sign-in and profiles|Push notifications|Payments or in-app purchases|Maps and location|Camera and uploads|Chat or messaging|Offline mode|Social sharing|Analytics|Admin dashboard|Multiple languages|Dark mode") },
    { key: "backend", label: "Backend", type: "select", required: true, options: o("I already have an API|Needs a backend built|Firebase or Supabase is fine|Not sure") },
    { key: "designStatus", label: "Design", type: "select", required: true, options: designStatus },
    { key: "storeAccounts", label: "Store accounts", type: "select", required: true, options: o("I have both Google Play and Apple developer accounts|Google Play only|Apple only|I need help setting them up") },
    { key: "publishing", label: "Do you want help publishing to the stores?", type: "yesno" },
    { key: "existingApi", label: "Existing API or website (if any)", type: "url", placeholder: "https://" },
  ] },
  wrapUp(),
] };

const api: DevType = { id: "api-backend", name: "API, backend or automation", icon: "server", tagline: "APIs, integrations, scrapers and automation scripts.", description: "Reliable backend work: APIs, payment and SMS integrations, scheduled jobs and data automation.", includes: ["Documented endpoints", "Testing", "Deployment guidance", "Handover & docs"], sections: [
  basics("backend project"),
  { id: "scope", title: "What do you need?", fields: [
    { key: "purpose", label: "Type of work", type: "select", required: true, options: o("REST API|GraphQL API|Third-party integration (payments, SMS, email…)|Automation, scraper or script|Webhooks and event processing|Data pipeline or reporting|Payment gateway integration|Something else") },
    { key: "details", label: "Describe the requirements", type: "textarea", required: true, min: 20, max: 3000, placeholder: "Inputs, outputs, rules, and any systems it needs to talk to." },
    { key: "existingSystem", label: "Existing system it connects to", type: "textarea", max: 1500 },
  ] },
  { id: "tech", title: "Technical details", note: noSecrets, fields: [
    { key: "language", label: "Programming language", type: "select", options: o("Developer’s choice (recommended)|Node.js or TypeScript|Python|PHP|Go|Java or C#|Other") },
    { key: "database", label: "Database", type: "select", options: o("Developer’s choice|PostgreSQL|MySQL|MongoDB|Redis|None needed") },
    { key: "auth", label: "Authentication", type: "multiselect", options: o("API keys|JWT|OAuth 2.0|None") },
    { key: "docs", label: "Documentation", type: "multiselect", options: o("OpenAPI or Swagger|Postman collection|README and setup guide") },
    { key: "traffic", label: "Expected traffic", type: "select", options: o("Low (a few requests a minute)|Medium|High (needs scaling)|Not sure") },
    { key: "tests", label: "Do you want automated tests included?", type: "yesno" },
    { key: "hosting", label: "Hosting", type: "select", options: hostingChoices },
  ] },
  wrapUp(),
] };

const fix: DevType = { id: "fix-upgrade", name: "Fix, redesign or upgrade", icon: "wrench", tagline: "Repair, speed up or modernise something you already have.", description: "Bug fixes, redesigns, performance work and new features for an existing website, app or bot.", includes: ["Review of your project", "Clear plan and quote", "Careful changes", "Handover notes"], sections: [
  basics("existing project"),
  { id: "existing", title: "Your existing project", note: noSecrets, fields: [
    { key: "existingUrl", label: "Website, app or bot link", type: "url", placeholder: "https://" },
    { key: "work", label: "What do you need?", type: "select", required: true, options: o("Fix bugs or errors|Redesign or new look|Improve speed and performance|Add new features|Move to new hosting or technology|Security fixes or malware cleanup|SEO improvements|Code review or audit|Something else") },
    { key: "problem", label: "Describe the problem or change", type: "textarea", required: true, min: 20, max: 3000, placeholder: "What is happening, and what should happen instead? Include steps to reproduce any bug." },
    { key: "techKnown", label: "Built with (if you know)", type: "text", max: 150, placeholder: "e.g. WordPress, React, PHP, Shopify" },
    { key: "access", label: "Access to the project", type: "select", required: true, options: o("I can share access securely later|I can provide a code repository|I only have the live website|Not sure") },
    { key: "backup", label: "Do you have a recent backup?", type: "select", options: o("Yes|No|Not sure") },
    { key: "urgency", label: "How urgent is it?", type: "select", required: true, options: o("Critical, it is down or losing money|Soon, within a week|Normal|Not urgent") },
  ] },
  wrapUp(),
] };

const custom: DevType = { id: "custom", name: "Something else", icon: "sparkles", tagline: "Have a different idea? Tell us about it.", description: "Not on the list? Describe what you have in mind and we will tell you honestly how we can help.", includes: ["Free review", "Clear plan and quote"], sections: [
  basics("project"),
  { id: "custom", title: "Your idea", note: noSecrets, fields: [
    { key: "kind", label: "What kind of project is it?", type: "text", required: true, max: 120, placeholder: "e.g. Browser extension, desktop tool, game" },
    { key: "details", label: "Describe it in detail", type: "textarea", required: true, min: 30, max: 4000 },
    { key: "deliverables", label: "What do you expect to receive?", type: "textarea", max: 1500 },
    { key: "constraints", label: "Technical requirements or limits", type: "textarea", max: 1500 },
    { key: "resources", label: "What do you already have?", type: "multiselect", options: o("Designs|Written requirements|Existing code|Brand assets|Nothing yet") },
  ] },
  wrapUp(),
] };

export const devTypes: DevType[] = [website, webapp, ecommerce, telegram, whatsapp, discord, mobile, api, fix, custom];
export function getDevType(id: string) { return devTypes.find(t => t.id === id); }

// ---- Visibility, validation and display (used by both the form and the API) ----
export function isVisible(field: FormField, answers: Brief) {
  if (!field.showIf) return true;
  const current = String(answers[field.showIf.key] ?? "");
  if (field.showIf.equals !== undefined) return current === field.showIf.equals;
  if (field.showIf.notEquals !== undefined) return current !== "" && current !== field.showIf.notEquals;
  return true;
}
export function validateField(field: FormField, raw: unknown): { value: BriefValue | null; error?: string } {
  const empty = raw == null || (typeof raw === "string" && !raw.trim()) || (Array.isArray(raw) && !raw.length);
  if (empty) return field.required ? { value: null, error: "This field is required." } : { value: null };
  if (field.type === "multiselect") {
    if (!Array.isArray(raw) || raw.some(v => typeof v !== "string" || !field.options?.includes(v))) return { value: null, error: "Choose from the listed options." };
    return { value: Array.from(new Set(raw as string[])) };
  }
  if (typeof raw !== "string") return { value: null, error: "Enter a valid answer." };
  const text = raw.trim();
  if (field.type === "select" && !field.options?.includes(text)) return { value: null, error: "Choose one of the options." };
  if (field.type === "yesno" && text !== "Yes" && text !== "No") return { value: null, error: "Choose Yes or No." };
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return { value: null, error: "Enter a valid email address." };
  if (field.type === "url") { try { const u = new URL(text); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); } catch { return { value: null, error: "Enter a full link starting with https://" }; } }
  if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)))) return { value: null, error: "Choose a valid date." };
  if (field.type === "number") { const n = Number(text); if (!Number.isFinite(n) || (field.min != null && n < field.min) || (field.max != null && n > field.max)) return { value: null, error: "Enter a valid number." }; }
  const max = field.max ?? (field.type === "textarea" ? 2000 : field.type === "url" ? 300 : 200);
  if (text.length > max) return { value: null, error: `Keep this under ${max} characters.` };
  if (field.min && text.length < field.min) return { value: null, error: `Please write at least ${field.min} characters.` };
  return { value: text };
}
export function validateBrief(typeId: string, answers: Record<string, unknown>): { ok: true; brief: Brief } | { ok: false; errors: Record<string, string> } {
  const type = getDevType(typeId); if (!type) return { ok: false, errors: { _: "Choose a project type." } };
  const brief: Brief = {}; const errors: Record<string, string> = {};
  for (const section of type.sections) for (const field of section.fields) {
    if (!isVisible(field, brief)) continue;
    const result = validateField(field, answers[field.key]);
    if (result.error) errors[field.key] = result.error; else if (result.value != null) brief[field.key] = result.value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, brief };
}
export function briefRows(typeId: string, brief: Brief) {
  const type = getDevType(typeId); if (!type) return [];
  return type.sections.map(section => ({ title: section.title, rows: section.fields.filter(f => brief[f.key] != null && brief[f.key] !== "" && !(Array.isArray(brief[f.key]) && !(brief[f.key] as string[]).length)).map(f => ({ label: f.label, value: Array.isArray(brief[f.key]) ? (brief[f.key] as string[]).join(", ") : String(brief[f.key]) })) })).filter(s => s.rows.length);
}
export function stepErrors(section: FormSection, answers: Brief) {
  const errors: Record<string, string> = {};
  for (const field of section.fields) { if (!isVisible(field, answers)) continue; const r = validateField(field, answers[field.key]); if (r.error) errors[field.key] = r.error; }
  return errors;
}

// ---- Request lifecycle ----
export const devStatuses: Record<string, { label: string; tone: string; hint: string }> = {
  submitted: { label: "Submitted", tone: "blue", hint: "Your brief is in. We will review it shortly." },
  reviewing: { label: "In review", tone: "violet", hint: "We are studying your brief and preparing a quote." },
  quoted: { label: "Quote ready", tone: "gold", hint: "Review your quote and accept it to start the work." },
  in_progress: { label: "In progress", tone: "cyan", hint: "Your project is being built." },
  delivered: { label: "Delivered", tone: "green", hint: "Your project is ready. Please review it and confirm." },
  completed: { label: "Completed", tone: "green", hint: "All done. Thank you for building with us." },
  declined: { label: "Declined", tone: "gray", hint: "We are unable to take this project." },
  cancelled: { label: "Cancelled", tone: "gray", hint: "This request was cancelled." },
};
export const devSteps = ["submitted", "reviewing", "quoted", "in_progress", "delivered", "completed"];
export const devClosed = ["completed", "declined", "cancelled"];
export type DevMessage = { from: "customer" | "admin"; text: string; at: string };
export type DevLink = { label: string; url: string };
