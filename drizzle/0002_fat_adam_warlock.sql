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
--> statement-breakpoint
CREATE INDEX "category_position_idx" ON "store_categories" USING btree ("position");