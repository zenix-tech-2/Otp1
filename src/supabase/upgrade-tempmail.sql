-- Temp mail: run once in the Supabase SQL editor (safe to re-run).
BEGIN;
CREATE TABLE IF NOT EXISTS "temp_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"secret" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "temp_mailbox_user_idx" ON "temp_mailboxes" ("user_id");
COMMIT;
