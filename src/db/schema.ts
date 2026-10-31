import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(), email: text("email").notNull().unique(), name: text("name").notNull(), passwordHash: text("password_hash"), role: text("role").notNull().default("user"),
  // Monetary balances are integer minor units of this account's immutable currency.
  balance: integer("balance").notNull().default(0), countryCode: text("country_code").notNull().default("OTHER"), countryName: text("country_name").notNull().default("Other"), currency: text("currency").notNull().default("USD"),
  suspended: boolean("suspended").notNull().default(false), isDemo: boolean("is_demo").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const sessions = pgTable("sessions", { tokenHash: text("token_hash").primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull() }, t => [index("session_user_idx").on(t.userId)]);
export const storeCategories = pgTable("store_categories", {
  id: text("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  subtitle: text("subtitle").notNull(), detail: text("detail").notNull(), icon: text("icon").notNull().default("package"),
  color: text("color").notNull().default("blue"), imageUrl: text("image_url"), formType: text("form_type").notNull().default("generic"),
  fields: jsonb("fields").$type<{ key: string; label: string; placeholder: string }[]>().notNull().default([]),
  position: integer("position").notNull().default(0), active: boolean("active").notNull().default(true),
  kind: text("kind").notNull().default("products"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("category_position_idx").on(t.position)]);
export const products = pgTable("products", {
  id: text("id").primaryKey(), name: text("name").notNull(), category: text("category").notNull(), brand: text("brand").notNull(), description: text("description").notNull(),
  // Catalog and provider base prices remain USD cents; checkout converts to account currency.
  price: integer("price").notNull(), comparePrice: integer("compare_price"), stock: integer("stock").notNull().default(0), badge: text("badge"), imageUrl: text("image_url"), metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}), fulfillment: text("fulfillment"), active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), productId: text("product_id").references(() => products.id), kind: text("kind").notNull(), title: text("title").notNull(),
  amount: integer("amount").notNull(), currency: text("currency").notNull().default("USD"), baseAmount: integer("base_amount"),
  status: text("status").notNull().default("pending"), idempotencyKey: text("idempotency_key").notNull().unique(), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("order_user_idx").on(t.userId), index("order_created_idx").on(t.createdAt)]);
export const inventoryItems = pgTable("inventory_items", { id: uuid("id").defaultRandom().primaryKey(), productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }), payload: text("payload").notNull(), orderId: uuid("order_id").unique().references(() => orders.id), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, t => [index("inventory_product_idx").on(t.productId)]);
export const activations = pgTable("activations", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), orderId: uuid("order_id").notNull().references(() => orders.id), providerId: text("provider_id").unique(), service: text("service").notNull(), serviceName: text("service_name").notNull(), country: text("country").notNull(), countryName: text("country_name").notNull(), phone: text("phone"), price: integer("price").notNull(), currency: text("currency").notNull().default("USD"), providerCost: integer("provider_cost").notNull(), status: text("status").notNull().default("provisioning"), code: text("code"), message: text("message"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), isDemo: boolean("is_demo").notNull().default(false), lastPolledAt: timestamp("last_polled_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Set when someone else paid for this number: the buyer's masked name and their note. The buyer's order carries the payment and any refund.
  giftFromName: text("gift_from_name"), giftMessage: text("gift_message"),
}, t => [index("activation_user_idx").on(t.userId)]);
export type RentalMessage = { code: string; text: string; receivedAt: string };
export const rentals = pgTable("rentals", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), orderId: uuid("order_id").notNull().unique().references(() => orders.id), providerId: text("provider_id").unique(), service: text("service").notNull(), serviceName: text("service_name").notNull(), country: text("country").notNull(), countryName: text("country_name").notNull(), phone: text("phone"), durationHours: integer("duration_hours").notNull(), price: integer("price").notNull(), currency: text("currency").notNull().default("USD"), providerCost: integer("provider_cost").notNull(), status: text("status").notNull().default("provisioning"), messages: jsonb("messages").$type<RentalMessage[]>().notNull().default([]), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), isDemo: boolean("is_demo").notNull().default(false), lastPolledAt: timestamp("last_polled_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  giftFromName: text("gift_from_name"), giftMessage: text("gift_message"),
}, t => [index("rental_user_idx").on(t.userId)]);
// Social-media growth ("Boost") orders fulfilled by an upstream SMM provider.
// `provider` is only ever the neutral alias ("v1" / "v2"); real provider names are never stored or sent to browsers.
export const smmOrders = pgTable("smm_orders", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), orderId: uuid("order_id").notNull().unique().references(() => orders.id),
  provider: text("provider").notNull(), providerServiceId: text("provider_service_id").notNull(), providerOrderId: text("provider_order_id"),
  platform: text("platform").notNull(), serviceName: text("service_name").notNull(), link: text("link").notNull(), quantity: integer("quantity").notNull(),
  // price is in the customer's wallet currency (minor units); providerCost is USD cents.
  price: integer("price").notNull(), currency: text("currency").notNull().default("USD"), providerCost: integer("provider_cost").notNull(),
  status: text("status").notNull().default("provisioning"), startCount: integer("start_count"), remains: integer("remains"),
  isDemo: boolean("is_demo").notNull().default(false), lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("smm_order_user_idx").on(t.userId), index("smm_order_status_idx").on(t.status), uniqueIndex("smm_order_provider_ref_idx").on(t.provider, t.providerOrderId)]);
export const devProjects = pgTable("dev_projects", {
  id: uuid("id").defaultRandom().primaryKey(), slug: text("slug").notNull().unique(), title: text("title").notNull(), type: text("type").notNull(), summary: text("summary").notNull(), description: text("description").notNull().default(""), techStack: jsonb("tech_stack").$type<string[]>().notNull().default([]), features: jsonb("features").$type<string[]>().notNull().default([]), liveUrl: text("live_url"), clientName: text("client_name"), year: integer("year"), coverUrl: text("cover_url"), gallery: jsonb("gallery").$type<string[]>().notNull().default([]), featured: boolean("featured").notNull().default(false), active: boolean("active").notNull().default(true), position: integer("position").notNull().default(0), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("dev_project_active_idx").on(t.active, t.position)]);
export const devRequests = pgTable("dev_requests", {
  id: uuid("id").defaultRandom().primaryKey(), reference: text("reference").notNull().unique(), userId: uuid("user_id").notNull().references(() => users.id), type: text("type").notNull(), title: text("title").notNull(), brief: jsonb("brief").$type<Record<string, string | string[]>>().notNull(), status: text("status").notNull().default("submitted"), quoteUsd: integer("quote_usd"), quoteDays: integer("quote_days"), quoteNote: text("quote_note"), quotedAt: timestamp("quoted_at", { withTimezone: true }), orderId: uuid("order_id").unique().references(() => orders.id), paidAt: timestamp("paid_at", { withTimezone: true }), deliverables: jsonb("deliverables").$type<{ label: string; url: string }[]>().notNull().default([]), deliveryNote: text("delivery_note"), messages: jsonb("messages").$type<{ from: "customer" | "team"; text: string; at: string }[]>().notNull().default([]), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("dev_request_user_idx").on(t.userId), index("dev_request_status_idx").on(t.status)]);
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), orderId: uuid("order_id").notNull().unique().references(() => orders.id),
  merchantReference: text("merchant_reference").notNull().unique(), providerId: text("provider_id").unique(), providerReference: text("provider_reference"), otpReference: text("otp_reference"),
  method: text("method").notNull(), countryCode: text("country_code").notNull(), currency: text("currency").notNull(), amount: integer("amount").notNull(), walletCurrency: text("wallet_currency").notNull(), walletAmount: integer("wallet_amount").notNull(),
  operator: text("operator"), phone: text("phone"), assetCode: text("asset_code"), status: text("status").notNull().default("creating"),
  // Only payment instructions and accounting snapshots; never OTPs, API keys, or wallet PINs.
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  isDemo: boolean("is_demo").notNull().default(false), verifiedAt: timestamp("verified_at", { withTimezone: true }), creditedAt: timestamp("credited_at", { withTimezone: true }), lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("payment_user_idx").on(t.userId), index("payment_status_idx").on(t.status)]);
export const paymentEvents = pgTable("payment_events", {
  id: text("id").primaryKey(), providerId: text("provider_id").notNull(), event: text("event").notNull(), bodyHash: text("body_hash").notNull(),
  // Minimal signed event fields, retained for reconciliation without payment PII.
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), status: text("status").notNull().default("received"), attempts: integer("attempts").notNull().default(0), error: text("error"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), processedAt: timestamp("processed_at", { withTimezone: true }),
}, t => [index("payment_event_status_idx").on(t.status)]);
export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").$type<Record<string, unknown>>().notNull() });
export const uploadedFiles = pgTable("uploaded_files", {
  id: uuid("id").defaultRandom().primaryKey(), actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), mediaType: text("media_type").notNull(), name: text("name").notNull(), mimeType: text("mime_type").notNull(), size: integer("size").notNull(),
  backend: text("backend").notNull(), bucket: text("bucket").notNull(), path: text("path").notNull().unique(), status: text("status").notNull().default("pending"),
  inlineBase64: text("inline_base64"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("uploaded_actor_idx").on(t.actorId), index("uploaded_status_idx").on(t.status)]);
export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(), slug: text("slug").unique(), title: text("title").notNull(), excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull(), kind: text("kind").notNull().default("update"), active: boolean("active").notNull().default(true), coverId: uuid("cover_id"),
  media: jsonb("media").$type<import("@/lib/content-types").ArticleMedia[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const auditLogs = pgTable("audit_logs", { id: uuid("id").defaultRandom().primaryKey(), actorId: uuid("actor_id").references(() => users.id), action: text("action").notNull(), target: text("target"), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), eventHash: text("event_hash").unique(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() });
export const tickets = pgTable("support_tickets", { id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id), subject: text("subject").notNull(), message: text("message").notNull(), status: text("status").notNull().default("open"), reply: text("reply"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() });
export const supportMessages = pgTable("support_messages", { id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), sender: text("sender").notNull(), body: text("body").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), readAt: timestamp("read_at", { withTimezone: true }) }, t => [index("support_msg_user_idx").on(t.userId, t.createdAt)]);
export type SupportMessage = typeof supportMessages.$inferSelect;
export const rateLimits = pgTable("rate_limits", { key: text("key").primaryKey(), count: integer("count").notNull().default(1), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull() });
export type Product = typeof products.$inferSelect;
export type PublicProduct = Omit<Product, "fulfillment">;
export type User = typeof users.$inferSelect;
export type Activation = typeof activations.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type SmmOrder = typeof smmOrders.$inferSelect;
export type DevProject = typeof devProjects.$inferSelect;
export type DevRequest = typeof devRequests.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payment = typeof payments.$inferSelect;

// ---- Live notifications, web push, coupons and gifting ----
// Personal inbox items. Broadcast news still lives in `announcements`.
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), kind: text("kind").notNull().default("info"),
  title: text("title").notNull(), body: text("body").notNull().default(""), url: text("url"), readAt: timestamp("read_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("notification_user_idx").on(t.userId, t.createdAt)]);
// One row per browser/device that agreed to receive web push.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(), auth: text("auth").notNull(), userAgent: text("user_agent"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("push_user_idx").on(t.userId)]);
// Discount codes. Money fields are USD cents (the catalog currency); a fixed discount is converted like any other price.
export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(), code: text("code").notNull().unique(), description: text("description").notNull().default(""), type: text("type").notNull().default("percent"), value: integer("value").notNull(),
  minSubtotal: integer("min_subtotal").notNull().default(0), maxDiscount: integer("max_discount"), maxUses: integer("max_uses"), perUserLimit: integer("per_user_limit").notNull().default(1), usedCount: integer("used_count").notNull().default(0),
  categoryId: text("category_id"), startsAt: timestamp("starts_at", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }), active: boolean("active").notNull().default(true), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(), couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }), userId: uuid("user_id").notNull().references(() => users.id), orderId: uuid("order_id").notNull().unique().references(() => orders.id), amount: integer("amount").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("redemption_coupon_user_idx").on(t.couponId, t.userId)]);
// A gift links the buyer's paid order to a zero-amount order that the recipient owns and receives the delivery on.
export const gifts = pgTable("gifts", {
  id: uuid("id").defaultRandom().primaryKey(), senderId: uuid("sender_id").notNull().references(() => users.id), recipientId: uuid("recipient_id").notNull().references(() => users.id), senderOrderId: uuid("sender_order_id").notNull().unique().references(() => orders.id), recipientOrderId: uuid("recipient_order_id").notNull().unique().references(() => orders.id),
  productId: text("product_id"), message: text("message").notNull().default(""), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("gift_sender_idx").on(t.senderId), index("gift_recipient_idx").on(t.recipientId)]);
// Disposable inboxes opened by a customer. `secret` holds the upstream credential (token/password) and is never sent to the browser.
export const tempMailboxes = pgTable("temp_mailboxes", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), provider: text("provider").notNull(), address: text("address").notNull(),
  secret: text("secret").notNull().default(""), ref: text("ref").notNull().default(""), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("temp_mailbox_user_idx").on(t.userId)]);
export type TempMailbox = typeof tempMailboxes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
