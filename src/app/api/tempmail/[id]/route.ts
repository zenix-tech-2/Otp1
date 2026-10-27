import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tempMailboxes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { adapterFor } from "@/lib/tempmail";
import { ownedMailbox, toView } from "@/lib/tempmail-store";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
// Closes a mailbox. The upstream address simply stops being used here.
export async function DELETE(request: Request, { params }: Ctx) {
  try { sameOrigin(request); const user = await requireUser(); const { id } = await params; const box = await ownedMailbox(id, user.id).catch(e => { if (e instanceof AppError && e.status === 410) return null; throw e; }); if (box) await db.delete(tempMailboxes).where(eq(tempMailboxes.id, box.id)); return Response.json({ ok: true }); } catch (e) { return apiError(e); }
}
// Adds time to a mailbox on versions that support it.
export async function POST(request: Request, { params }: Ctx) {
  try {
    sameOrigin(request); await limit(request, "tempmail-extend", 20); const user = await requireUser(); const { id } = await params; const box = await ownedMailbox(id, user.id);
    const { adapter } = adapterFor(box.provider); if (!adapter.extend) throw new AppError("This mailbox version can’t be extended.");
    const expiresAt = await adapter.extend({ address: box.address, secret: box.secret, ref: box.ref });
    const [row] = await db.update(tempMailboxes).set({ expiresAt }).where(eq(tempMailboxes.id, box.id)).returning();
    return Response.json({ mailbox: toView(row) });
  } catch (e) { return apiError(e); }
}
