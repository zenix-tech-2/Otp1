import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, audit, limit, sameOrigin } from "@/lib/server";
import { acceptQuote, addMessage, customerApprove, customerCancel, getUserRequest, publicRequest } from "@/lib/dev-service";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await params; return Response.json({ request: publicRequest(await getUserRequest(user.id, id)) }); } catch (e) { return apiError(e); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); await limit(request, "dev-request-action", 30); const user = await requireUser(); const { id } = await params; await getUserRequest(user.id, id);
    const input = await request.json(); const action = String(input.action || ""); let row;
    if (action === "message") row = await addMessage(id, "customer", input.text, user.id);
    else if (action === "cancel") row = await customerCancel(id, user.id);
    else if (action === "approve") row = await customerApprove(id, user.id);
    else if (action === "accept") {
      await limit(request, "dev-accept", 5);
      const data = z.object({ expectedUsd: z.number().int().positive(), expectedAmount: z.number().int().nonnegative().optional(), expectedCurrency: z.string().length(3).optional() }).parse(input);
      row = await acceptQuote(user, id, data.expectedUsd, data.expectedAmount, data.expectedCurrency);
      await audit(user.id, "dev.quote.accepted", id, { currency: user.currency });
    } else return Response.json({ error: "Unknown action." }, { status: 400 });
    return Response.json({ request: publicRequest(row) });
  } catch (e) { return apiError(e); }
}
