import { z } from "zod";
import { getUser } from "@/lib/auth";
import { apiError, AppError, limit, sameOrigin } from "@/lib/server";
import { aiEnabled, runAssistant } from "@/lib/ai-assistant";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Lets the chat window know whether the assistant is configured (no secrets are exposed).
export async function GET() { return Response.json({ enabled: aiEnabled() }); }
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "ai-chat", 14); await limit(request, "ai-chat-hour", 90, 3600);
    if (Number(request.headers.get("content-length") || 0) > 4_800_000) throw new AppError("That message is too large. Try fewer or smaller images.", 413);
    if (!aiEnabled()) throw new AppError("The assistant isn’t set up yet. Please use Help & support for now.", 503);
    const data = z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(2000) })).min(1).max(20),
      images: z.array(z.object({ mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(1_500_000).regex(/^[A-Za-z0-9+/=]+$/) })).max(3).optional(),
    }).parse(await request.json());
    if (data.messages[data.messages.length - 1].role !== "user") throw new AppError("Send a message to continue the chat.", 400);
    const user = await getUser(false);
    return Response.json(await runAssistant({ messages: data.messages, images: data.images, user }));
  } catch (e) { return apiError(e); }
}
