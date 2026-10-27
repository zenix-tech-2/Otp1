-- Gifted numbers: run once in the Supabase SQL editor (safe to re-run).
ALTER TABLE "activations" ADD COLUMN IF NOT EXISTS "gift_from_name" text;
ALTER TABLE "activations" ADD COLUMN IF NOT EXISTS "gift_message" text;
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "gift_from_name" text;
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "gift_message" text;
