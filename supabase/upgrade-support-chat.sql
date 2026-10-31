-- Live chat between customers and the store team. Safe to run more than once.
BEGIN;
CREATE TABLE IF NOT EXISTS "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "support_msg_user_idx" ON "support_messages" USING btree ("user_id","created_at");
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
COMMIT;
