import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { Popup } from "./popup-core";
// Pop-ups live in the existing key/value `settings` table (key "popups"), so no database migration is needed.
export async function loadPopups(): Promise<Popup[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "popups"));
  const items = (row?.value as { items?: Popup[] } | undefined)?.items;
  return Array.isArray(items) ? items : [];
}
export async function savePopups(items: Popup[]) {
  await db.insert(settings).values({ key: "popups", value: { items } }).onConflictDoUpdate({ target: settings.key, set: { value: { items } } });
}
