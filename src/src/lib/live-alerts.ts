import "server-only";
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, rentals, settings, tempMailboxes, type TempMailbox } from "@/db/schema";
import { notifyUser } from "./notify";
import { adapterFor, withAuth } from "./tempmail";
import { saveSecret } from "./tempmail-store";
import { applyRentalUpdate } from "./billing";
import { providerRequest } from "./numberotp";
import type { MessageSummary } from "./tempmail-core";

const key = (boxId: string) => `mailseen:${boxId}`;
/**
 * Sends a notification for every email that is new since the last look.
 * The first look at a mailbox only records what is already there, so old mail never triggers an alert.
 */
export async function alertNewMail(box: Pick<TempMailbox, "id" | "userId" | "address">, messages: MessageSummary[]) {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, key(box.id)));
    const known = new Set((row?.value as { ids?: string[] } | undefined)?.ids ?? []);
    const ids = messages.map(m => m.id).filter(Boolean).slice(0, 200);
    const fresh = row ? messages.filter(m => m.id && !known.has(m.id)) : [];
    if (!row || fresh.length || ids.length !== known.size) await db.insert(settings).values({ key: key(box.id), value: { ids } }).onConflictDoUpdate({ target: settings.key, set: { value: { ids } } });
    if (!fresh.length) return 0;
    const first = fresh[0];
    await notifyUser(box.userId, {
      kind: "mail",
      title: fresh.length > 1 ? `${fresh.length} new emails` : (first.fromName || first.from || "New email"),
      body: fresh.length > 1 ? `New mail in ${box.address}` : `${first.subject || "(no subject)"}${first.code ? ` · Code ${first.code}` : ""}`,
      url: "/mail",
    });
    return fresh.length;
  } catch (error) { console.error("Mail alert failed:", error instanceof Error ? error.message : "unknown"); return 0; }
}

/** Background pass (scheduled): checks the open mailboxes and active rentals of customers who enabled push, so alerts arrive while the app is closed. */
export async function pollLiveAlerts(budgetMs = 45_000) {
  const started = Date.now(); let mail = 0; let sms = 0;
  const subscribed = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions); const userIds = subscribed.map(s => s.userId);
  if (!userIds.length) return { mail, sms };
  const boxes = await db.select().from(tempMailboxes).where(and(inArray(tempMailboxes.userId, userIds), gt(tempMailboxes.expiresAt, new Date()))).limit(60);
  for (const box of boxes) {
    if (Date.now() - started > budgetMs) break;
    try { const { id: provider } = adapterFor(box.provider); const messages = await withAuth(provider, { address: box.address, secret: box.secret, ref: box.ref }, (a, b) => a.list(b), saveSecret(box.id)); mail += await alertNewMail(box, messages); } catch { /* mailbox busy or gone: try again next run */ }
  }
  const active = await db.select().from(rentals).where(and(inArray(rentals.userId, userIds), eq(rentals.status, "active"), eq(rentals.isDemo, false), isNotNull(rentals.providerId), gt(rentals.expiresAt, new Date()))).limit(40);
  for (const rental of active) {
    if (Date.now() - started > budgetMs) break;
    try { const before = rental.messages.length; const updated = await applyRentalUpdate(rental.id, await providerRequest(`/rentals/${encodeURIComponent(rental.providerId!)}`)); if (updated.messages.length > before) sms++; } catch { /* retried next run */ }
  }
  return { mail, sms };
}
