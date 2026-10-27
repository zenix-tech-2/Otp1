-- Run ONCE on an existing app after the categories migration.
-- Back up first. No products, posts, purchases, or balances are deleted.
-- Do not apply if the equivalent Drizzle migration already ran.
BEGIN;
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

COMMIT;

-- Apply after the application schema. Existing files are preserved.
-- Raise your project's global Storage file-size limit too, if your plan permits it.
-- 250 MB requires a Supabase plan/global limit that permits files of that size.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
('product-assets','product-assets',true,10485760,ARRAY['image/png','image/jpeg','image/webp','image/gif']),
('product-deliveries','product-deliveries',false,262144000,ARRAY['application/vnd.android.package-archive','application/octet-stream','application/zip','application/x-zip-compressed','application/pdf','application/epub+zip','text/plain','image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav']),
('news-media','news-media',false,157286400,ARRAY['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav','application/pdf','application/zip','text/plain'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
-- No public upload policies. Signed upload URLs are issued by the admin-only server.
-- news-media is PRIVATE: /api/media/{id} verifies publication or administrator access.
-- product-deliveries is PRIVATE: /api/orders/{id}/download verifies ownership and completion.
