import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { alertNewMail } from "@/lib/live-alerts";
import { apiError, limit } from "@/lib/server";
import { adapterFor, withAuth } from "@/lib/tempmail";
import { forgetIfGone, ownedMailbox, saveSecret } from "@/lib/tempmail-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let boxId = "";
  try {
    await limit(request, "tempmail-read", 120); const user = await requireUser(); const { id } = await params; const box = await ownedMailbox(id, user.id); boxId = box.id; const { id: provider } = adapterFor(box.provider);
    const messages = await withAuth(provider, { address: box.address, secret: box.secret, ref: box.ref }, (a, b) => a.list(b), saveSecret(box.id));
    after(() => alertNewMail(box, messages));
    return Response.json({ messages: messages.sort((a, b) => b.date.localeCompare(a.date)) });
  } catch (e) { if (boxId) await forgetIfGone(e, boxId); return apiError(e); }
}
