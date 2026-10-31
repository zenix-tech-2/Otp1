-- Store OTP: fresh Supabase project setup. Run once in the SQL Editor.
-- Never expose DATABASE_URL or the service-role key in a client bundle.
-- App access is through server-side Drizzle and its own signed-in session checks.

CREATE TABLE "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_id" text,
	"service" text NOT NULL,
	"service_name" text NOT NULL,
	"country" text NOT NULL,
	"country_name" text NOT NULL,
	"phone" text,
	"price" integer NOT NULL,
	"provider_cost" integer NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"code" text,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activations_provider_id_unique" UNIQUE("provider_id")
);

CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_event_hash_unique" UNIQUE("event_hash")
);

CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"payload" text NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_order_id_unique" UNIQUE("order_id")
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key")
);

CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"brand" text NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"compare_price" integer,
	"stock" integer DEFAULT 0 NOT NULL,
	"badge" text,
	"image_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fulfillment" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);

CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

ALTER TABLE "activations" ADD CONSTRAINT "activations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "activations" ADD CONSTRAINT "activations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "activation_user_idx" ON "activations" USING btree ("user_id");
CREATE INDEX "inventory_product_idx" ON "inventory_items" USING btree ("product_id");
CREATE INDEX "order_user_idx" ON "orders" USING btree ("user_id");
CREATE INDEX "order_created_idx" ON "orders" USING btree ("created_at");
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");

-- Deny direct anonymous/authenticated Supabase REST access by default.
-- The server's privileged PostgreSQL connection owns these tables.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Product images are public; fulfillment files are private. Uploads go through server routes only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-assets', 'product-assets', true, 4000000, ARRAY['image/png','image/jpeg','image/webp']),
       ('product-deliveries', 'product-deliveries', false, 4000000, ARRAY['application/pdf','application/zip','application/x-zip-compressed','text/plain','image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public image reads are allowed; no public upload/update/delete policies exist.
CREATE POLICY "Public product image reads" ON storage.objects FOR SELECT
USING (bucket_id = 'product-assets');
-- Private deliveries have no public policy; only server-issued, 60-second signed URLs work.


-- Ashtech Pay and account-currency additions
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"event" text NOT NULL,
	"body_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);

CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"merchant_reference" text NOT NULL,
	"provider_id" text,
	"provider_reference" text,
	"otp_reference" text,
	"method" text NOT NULL,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"wallet_currency" text NOT NULL,
	"wallet_amount" integer NOT NULL,
	"operator" text,
	"phone" text,
	"asset_code" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payments_merchant_reference_unique" UNIQUE("merchant_reference"),
	CONSTRAINT "payments_provider_id_unique" UNIQUE("provider_id")
);

ALTER TABLE "activations" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "base_amount" integer;
ALTER TABLE "users" ADD COLUMN "country_code" text DEFAULT 'OTHER' NOT NULL;
ALTER TABLE "users" ADD COLUMN "country_name" text DEFAULT 'Other' NOT NULL;
ALTER TABLE "users" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "payment_event_status_idx" ON "payment_events" USING btree ("status");
CREATE INDEX "payment_user_idx" ON "payments" USING btree ("user_id");
CREATE INDEX "payment_status_idx" ON "payments" USING btree ("status");
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;


-- Expandable store categories
CREATE TABLE "store_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"subtitle" text NOT NULL,
	"detail" text NOT NULL,
	"icon" text DEFAULT 'package' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"image_url" text,
	"form_type" text DEFAULT 'generic' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"kind" text DEFAULT 'products' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_categories_slug_unique" UNIQUE("slug")
);

CREATE INDEX "category_position_idx" ON "store_categories" USING btree ("position");
ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;


-- Media posts and verified file uploads
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"backend" text NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inline_base64" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_files_path_unique" UNIQUE("path")
);

ALTER TABLE "announcements" ADD COLUMN "slug" text;
ALTER TABLE "announcements" ADD COLUMN "excerpt" text DEFAULT '' NOT NULL;
ALTER TABLE "announcements" ADD COLUMN "cover_id" uuid;
ALTER TABLE "announcements" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "announcements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "uploaded_actor_idx" ON "uploaded_files" USING btree ("actor_id");
CREATE INDEX "uploaded_status_idx" ON "uploaded_files" USING btree ("status");
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_slug_unique" UNIQUE("slug");
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- Long-term number rentals (NumberOTP /rentals).
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_id" text,
	"service" text NOT NULL,
	"service_name" text NOT NULL,
	"country" text NOT NULL,
	"country_name" text NOT NULL,
	"phone" text,
	"duration_hours" integer NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_cost" integer NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rentals_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "rentals_provider_id_unique" UNIQUE("provider_id")
);
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "rental_user_idx" ON "rentals" USING btree ("user_id");
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

-- Websites & Bots service: portfolio projects and customer project requests.
CREATE TABLE "dev_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_url" text,
	"client_name" text,
	"year" integer,
	"cover_url" text,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dev_projects_slug_unique" UNIQUE("slug")
);
CREATE INDEX "dev_project_active_idx" ON "dev_projects" USING btree ("active","position");
CREATE TABLE "dev_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"brief" jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"quote_usd" integer,
	"quote_days" integer,
	"quote_note" text,
	"quoted_at" timestamp with time zone,
	"order_id" uuid,
	"paid_at" timestamp with time zone,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivery_note" text,
	"admin_note" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dev_requests_reference_unique" UNIQUE("reference"),
	CONSTRAINT "dev_requests_order_id_unique" UNIQUE("order_id")
);
ALTER TABLE "dev_requests" ADD CONSTRAINT "dev_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "dev_requests" ADD CONSTRAINT "dev_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "dev_request_user_idx" ON "dev_requests" USING btree ("user_id");
CREATE INDEX "dev_request_status_idx" ON "dev_requests" USING btree ("status");
ALTER TABLE public.dev_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_requests ENABLE ROW LEVEL SECURITY;

-- Boost (SMM) orders fulfilled by an upstream provider; provider is a neutral alias (v1 / v2).
CREATE TABLE "smm_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_service_id" text NOT NULL,
	"provider_order_id" text,
	"platform" text NOT NULL,
	"service_name" text NOT NULL,
	"link" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider_cost" integer NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"start_count" integer,
	"remains" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smm_orders_order_id_unique" UNIQUE("order_id")
);
ALTER TABLE "smm_orders" ADD CONSTRAINT "smm_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "smm_orders" ADD CONSTRAINT "smm_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "smm_order_user_idx" ON "smm_orders" USING btree ("user_id");
CREATE INDEX "smm_order_status_idx" ON "smm_orders" USING btree ("status");
CREATE UNIQUE INDEX "smm_order_provider_ref_idx" ON "smm_orders" USING btree ("provider","provider_order_id");
ALTER TABLE public.smm_orders ENABLE ROW LEVEL SECURITY;

-- Live notifications, web push, coupons and gifting.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"kind" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notification_user_idx" ON "notifications" ("user_id", "created_at");
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "push_user_idx" ON "push_subscriptions" ("user_id");
CREATE TABLE IF NOT EXISTS "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL UNIQUE,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'percent' NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"max_uses" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"category_id" text,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id"),
	"order_id" uuid NOT NULL UNIQUE REFERENCES "orders"("id"),
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "redemption_coupon_user_idx" ON "coupon_redemptions" ("coupon_id", "user_id");
CREATE TABLE IF NOT EXISTS "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL REFERENCES "users"("id"),
	"recipient_id" uuid NOT NULL REFERENCES "users"("id"),
	"sender_order_id" uuid NOT NULL UNIQUE REFERENCES "orders"("id"),
	"recipient_order_id" uuid NOT NULL UNIQUE REFERENCES "orders"("id"),
	"product_id" text,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "gift_sender_idx" ON "gifts" ("sender_id");
CREATE INDEX IF NOT EXISTS "gift_recipient_idx" ON "gifts" ("recipient_id");
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

-- Apply after the application schema. Existing files are preserved.
-- Raise your project's global Storage file-size limit too, if your plan permits it.
-- 250 MB requires a Supabase plan/global limit that permits files of that size.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
('product-assets','product-assets',true,10485760,ARRAY['image/png','image/jpeg','image/webp','image/gif']),
('product-deliveries','product-deliveries',false,262144000,ARRAY['application/vnd.android.package-archive','application/octet-stream','application/zip','application/x-zip-compressed','application/pdf','application/epub+zip','text/plain','image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav']),
('news-media','news-media',false,157286400,ARRAY['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav','application/pdf','application/zip','text/plain'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- No public upload policies. Signed upload URLs are issued by the server.
-- news-media is PRIVATE: /api/media/{id} verifies publication.
-- product-deliveries is PRIVATE: /api/orders/{id}/download verifies ownership and completion.

-- Temp mail
CREATE TABLE IF NOT EXISTS "temp_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"secret" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "temp_mailbox_user_idx" ON "temp_mailboxes" ("user_id");

-- Gifted numbers
ALTER TABLE "activations" ADD COLUMN IF NOT EXISTS "gift_from_name" text;
ALTER TABLE "activations" ADD COLUMN IF NOT EXISTS "gift_message" text;
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "gift_from_name" text;
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "gift_message" text;
