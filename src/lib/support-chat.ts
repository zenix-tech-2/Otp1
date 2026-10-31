import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { supportMessages, tickets } from "@/db/schema";

export type ChatItem = { id: string; sender: "customer" | "team"; body: string; at: string; legacy?: boolean };
export const CHAT_MAX = 2000;

/** One continuous conversation per customer. Older help requests appear first, read-only, so nothing is lost. */
export async function loadThread(userId: string, markRead: boolean) {
  const [recent, old] = await Promise.all([
    db.select().from(supportMessages).where(eq(supportMessages.userId, userId)).orderBy(desc(supportMessages.createdAt)).limit(200),
    db.select().from(tickets).where(eq(tickets.userId, userId)).orderBy(asc(tickets.createdAt)).limit(30),
  ]);
  const live: ChatItem[] = recent.reverse().map(m => ({ id: m.id, sender: m.sender === "customer" ? "customer" : "team", body: m.body, at: m.createdAt.toISOString() }));
  const legacy: ChatItem[] = old.flatMap(t => {
    const at = t.createdAt.getTime();
    const ask: ChatItem = { id: `legacy-${t.id}-q`, sender: "customer", body: `${t.subject.replace(/^Chat:\s*/, "")}\n${t.message}`.slice(0, 1500), at: new Date(at).toISOString(), legacy: true };
    return t.reply ? [ask, { id: `legacy-${t.id}-a`, sender: "team" as const, body: t.reply, at: new Date(at + 1).toISOString(), legacy: true }] : [ask];
  });
  const unread = recent.filter(m => m.sender === "team" && !m.readAt).length;
  if (markRead && unread) await db.update(supportMessages).set({ readAt: new Date() }).where(and(eq(supportMessages.userId, userId), eq(supportMessages.sender, "team"), isNull(supportMessages.readAt)));
  return { messages: [...legacy, ...live].sort((a, b) => a.at.localeCompare(b.at)), unread };
}

export async function countUnread(userId: string) {
  const rows = await db.select({ id: supportMessages.id }).from(supportMessages).where(and(eq(supportMessages.userId, userId), eq(supportMessages.sender, "team"), isNull(supportMessages.readAt))).limit(50);
  return rows.length;
}

export async function addCustomerMessage(userId: string, body: string) {
  const [row] = await db.insert(supportMessages).values({ userId, sender: "customer", body }).returning();
  return { id: row.id, sender: "customer" as const, body: row.body, at: row.createdAt.toISOString() } satisfies ChatItem;
}
