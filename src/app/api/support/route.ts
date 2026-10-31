import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CHAT_MAX, addCustomerMessage, countUnread, loadThread } from "@/lib/support-chat";
import { apiError, AppError, audit, limit, sameOrigin } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(); const params = new URL(request.url).searchParams;
    if (params.get("summary") === "1") return Response.json({ unread: await countUnread(user.id) });
    return Response.json(await loadThread(user.id, params.get("read") === "1"));
  } catch (e) { return apiError(e); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "support-chat", 30, 600); const user = await requireUser();
    const data = z.object({ body: z.string().trim().min(1, "Write a message first.").max(CHAT_MAX, `Keep messages under ${CHAT_MAX} characters.`) }).parse(await request.json());
    const message = await addCustomerMessage(user.id, data.body);
    await audit(user.id, "support.message", message.id).catch(() => {});
    return Response.json({ message });
  } catch (e) { return apiError(e); }
}
