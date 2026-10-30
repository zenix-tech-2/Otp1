import "server-only";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, pushSubscriptions, users } from "@/db/schema";
import { pushConfigured, sendPush } from "./webpush";
export type NotifyInput = { kind?: "order" | "gift" | "wallet" | "boost" | "number" | "mail" | "news" | "support" | "system"; title: string; body?: string; url?: string };
function safeUrl(url?: string) { return url && url.startsWith("/") && !url.startsWith("//") ? url.slice(0, 300) : null; }
/** Stores an in-app notification and, when configured, pushes it to every device the user enabled. Never throws: a notification must not break a purchase. */
export async function notifyUser(userId: string, input: NotifyInput) {
  try {
    const url = safeUrl(input.url);
    const [row] = await db.insert(notifications).values({ userId, kind: input.kind || "system", title: input.title.slice(0, 140), body: (input.body || "").slice(0, 400), url }).returning();
    if (pushConfigured()) {
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(10);
      const dead: string[] = [];
      await Promise.all(subs.map(async s => { if (await sendPush(s, { title: input.title, body: input.body, url: url || "/notifications", tag: `n-${row.id}` }) === "gone") dead.push(s.id); }));
      if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    }
    return row;
  } catch (error) { console.error("Notification failed:", error instanceof Error ? error.message : "unknown"); return null; }
}
/** Alerts every administrator (new support ticket, order waiting for fulfilment). Never throws. */
export async function notifyAdmins(input: NotifyInput) {
  try { const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(20); await Promise.all(admins.map(a => notifyUser(a.id, input))); }
  catch (error) { console.error("Admin alert failed:", error instanceof Error ? error.message : "unknown"); }
}
/** Broadcasts to every customer (news, updates, offers): an inbox item for each one plus a push to every enabled device. Never throws. */
export async function notifyAll(input: NotifyInput & { tag?: string }) {
  try {
    const url = safeUrl(input.url) || "/notifications"; const kind = input.kind || "news";
    const everyone = await db.select({ id: users.id }).from(users).where(eq(users.suspended, false)).limit(50000);
    for (let i = 0; i < everyone.length; i += 500) await db.insert(notifications).values(everyone.slice(i, i + 500).map(u => ({ userId: u.id, kind, title: input.title.slice(0, 140), body: (input.body || "").slice(0, 400), url })));
    if (!pushConfigured()) return everyone.length;
    const subs = await db.select().from(pushSubscriptions); const dead: string[] = []; let next = 0;
    const worker = async () => { while (next < subs.length) { const s = subs[next++]; if (await sendPush(s, { title: input.title, body: input.body, url, tag: input.tag || `${kind}-${Date.now()}` }) === "gone") dead.push(s.id); } };
    await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
    if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    return everyone.length;
  } catch (error) { console.error("Broadcast failed:", error instanceof Error ? error.message : "unknown"); return 0; }
}
export async function listNotifications(userId: string, limit = 40) {
  const [items, [counts]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit),
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return { items, unread: counts?.unread || 0 };
}
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const where = ids?.length ? and(eq(notifications.userId, userId), isNull(notifications.readAt), inArray(notifications.id, ids)) : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
export async function pruneNotifications() { await db.delete(notifications).where(lt(notifications.createdAt, new Date(Date.now() - 90 * 86400_000))); }
