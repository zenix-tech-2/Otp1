-- Digisms Pro "Boost" (SMM services) upgrade: run ONCE on an existing database.
-- Skip it if you installed from the updated fresh-install schema.sql or used `npx drizzle-kit push`.
-- Back up first.
BEGIN;
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
COMMIT;
