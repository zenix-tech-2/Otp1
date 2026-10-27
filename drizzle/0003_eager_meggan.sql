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
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "excerpt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "cover_id" uuid;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "media" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploaded_actor_idx" ON "uploaded_files" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "uploaded_status_idx" ON "uploaded_files" USING btree ("status");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_slug_unique" UNIQUE("slug");