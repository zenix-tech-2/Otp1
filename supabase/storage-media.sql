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
