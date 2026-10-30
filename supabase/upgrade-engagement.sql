-- Store OTP engagement upgrade: live notifications + web push, coupons, gifting, social "account age".
-- Run ONCE on an existing database. Skip it if you installed from the updated fresh-install schema.sql or used `npx drizzle-kit push`.
-- Back up first.
BEGIN;
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
-- Adds an "Account age" field to every existing social category (new categories get it from the template).
UPDATE "store_categories"
SET "fields" = "fields" || '[{"key":"accountAge","label":"Account age","placeholder":"2 years"}]'::jsonb
WHERE "form_type" = 'social' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("fields") f WHERE f->>'key' = 'accountAge');
COMMIT;
