import { requireUser } from "@/lib/auth";
import { AppError, apiError, limit, sameOrigin } from "@/lib/server";
import { adapterFor, fullWithCode, withAuth } from "@/lib/tempmail";
import { forgetIfGone, ownedMailbox, saveSecret } from "@/lib/tempmail-store";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; mid: string }> };
const messageId = (v: string) => { if (!v || v.length > 300) throw new AppError("Message not found.", 404); return v; };
export async function GET(request: Request, { params }: Ctx) {
  let boxId = "";
  try {
    await limit(request, "tempmail-read", 120); const user = await requireUser(); const { id, mid } = await params; const box = await ownedMailbox(id, user.id); boxId = box.id; const { id: provider } = adapterFor(box.provider);
    const message = await withAuth(provider, { address: box.address, secret: box.secret, ref: box.ref }, (a, b) => a.read(b, messageId(mid)), saveSecret(box.id));
    return Response.json({ message: fullWithCode(message) });
  } catch (e) { if (boxId) await forgetIfGone(e, boxId); return apiError(e); }
}
export async function DELETE(request: Request, { params }: Ctx) {
  let boxId = "";
  try {
    sameOrigin(request); await limit(request, "tempmail-read", 120); const user = await requireUser(); const { id, mid } = await params; const box = await ownedMailbox(id, user.id); boxId = box.id; const { id: provider, adapter } = adapterFor(box.provider);
    const ref = { address: box.address, secret: box.secret, ref: box.ref }; const message = messageId(mid);
    await withAuth(provider, ref, (a, b) => a.remove(b, message), saveSecret(box.id));
    if (adapter.hide) await saveSecret(box.id)(adapter.hide(ref, message));
    return Response.json({ ok: true });
  } catch (e) { if (boxId) await forgetIfGone(e, boxId); return apiError(e); }
}
