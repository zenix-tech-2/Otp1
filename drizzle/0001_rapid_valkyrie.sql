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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "activations" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "base_amount" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_code" text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_name" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_event_status_idx" ON "payment_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payments" USING btree ("status");