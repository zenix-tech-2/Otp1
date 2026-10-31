import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "./server";
export function storageClient() {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError("Connect Supabase Storage to upload private delivery files. You can use delivery instructions in the meantime.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
