-- Store OTP "Websites & Bots" upgrade: run ONCE on an existing database.
-- Skip it if you installed from the updated fresh-install schema.sql or used drizzle-kit push. Back up first.
BEGIN;
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
COMMIT;
