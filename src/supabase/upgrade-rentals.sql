-- Store OTP long-term rentals upgrade: run ONCE on an existing database that already
-- has the Ashtech Pay schema. Skip it if you installed from the updated fresh-install schema.sql
-- or used drizzle-kit push. Back up first.
BEGIN;
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
COMMIT;
