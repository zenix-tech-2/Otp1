import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { tempMailboxes, type TempMailbox } from "@/db/schema";
import { AppError } from "./server";
import { providerLabel, type MailboxView, type MailProviderId } from "./tempmail-core";
import { canExtend } from "./tempmail";
export const toView = (b: TempMailbox): MailboxView => ({ id: b.id, provider: b.provider as MailProviderId, label: providerLabel(b.provider), address: b.address, expiresAt: b.expiresAt.toISOString(), createdAt: b.createdAt.toISOString(), canExtend: canExtend(b.provider as MailProviderId) });
export async function purgeExpired(userId: string) { await db.delete(tempMailboxes).where(and(eq(tempMailboxes.userId, userId), lt(tempMailboxes.expiresAt, new Date()))); }
/** Loads one of the signed-in customer's live mailboxes, or throws 404. */
export async function ownedMailbox(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Mailbox not found.", 404);
  const [box] = await db.select().from(tempMailboxes).where(and(eq(tempMailboxes.id, id), eq(tempMailboxes.userId, userId)));
  if (!box) throw new AppError("Mailbox not found.", 404);
  if (box.expiresAt.getTime() < Date.now()) { await db.delete(tempMailboxes).where(eq(tempMailboxes.id, id)); throw new AppError("This mailbox has expired. Open a new one to keep going.", 410); }
  return box;
}
/** When the upstream says a mailbox is gone, forget it here too so it stops showing up. */
export async function forgetIfGone(e: unknown, id: string) { if (e instanceof AppError && e.status === 410) await db.delete(tempMailboxes).where(eq(tempMailboxes.id, id)); }
export const saveSecret = (id: string) => async (secret: string) => { await db.update(tempMailboxes).set({ secret }).where(eq(tempMailboxes.id, id)); };
