import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tempMailboxes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { adapterFor, providerCredits, providerOptions } from "@/lib/tempmail";
import { MAX_MAILBOXES } from "@/lib/tempmail-core";
import { purgeExpired, toView } from "@/lib/tempmail-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireUser(); await purgeExpired(user.id);
    const rows = await db.select().from(tempMailboxes).where(eq(tempMailboxes.userId, user.id)).orderBy(desc(tempMailboxes.createdAt));
    return Response.json({ providers: providerOptions(), credits: providerCredits(), mailboxes: rows.map(toView), max: MAX_MAILBOXES });
  } catch (e) { return apiError(e); }
}
const input = z.object({ provider: z.string().min(2).max(4), name: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,29}$/, "Use 3–30 letters, numbers, dots, dashes or underscores.").optional().or(z.literal("").transform(() => undefined)) });
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "tempmail-create", 10); const user = await requireUser(); await purgeExpired(user.id);
    const data = input.parse(await request.json()); const { adapter, id } = adapterFor(data.provider);
    const existing = await db.select({ id: tempMailboxes.id }).from(tempMailboxes).where(eq(tempMailboxes.userId, user.id));
    if (existing.length >= MAX_MAILBOXES) throw new AppError(`You can keep up to ${MAX_MAILBOXES} mailboxes open. Delete one to make room.`);
    const created = await adapter.create({ name: data.name });
    const [row] = await db.insert(tempMailboxes).values({ userId: user.id, provider: id, address: created.address, secret: created.secret, ref: created.ref, expiresAt: created.expiresAt }).returning();
    return Response.json({ mailbox: toView(row) });
  } catch (e) { return apiError(e); }
}
