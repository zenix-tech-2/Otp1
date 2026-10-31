import { db } from "@/db";
import { activations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { apiError, AppError, limit, sameOrigin } from "@/lib/server";
import { providerRequest } from "@/lib/numberotp";
import { applyActivationUpdate } from "@/lib/billing";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
async function owned(id: string) {
  const user = await requireUser();
  const [activation] = await db.select().from(activations).where(and(eq(activations.id, id), eq(activations.userId, user.id)));
  if (!activation) throw new AppError("Number not found.", 404);
  return activation;
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; let act = await owned(id);
    if (act.status === "waiting") {
      if (act.isDemo) {
        if (act.expiresAt.getTime() < Date.now()) act = await applyActivationUpdate(id, { status: "expired" });
        else if (Date.now() - act.createdAt.getTime() > 18000) act = await applyActivationUpdate(id, { status: "received", otp: "482910", full_sms: `Sandbox message: your ${act.serviceName} demo verification code is 482910. This is not a real SMS.` });
      } else if (act.providerId && (!act.lastPolledAt || Date.now() - act.lastPolledAt.getTime() > 4500)) {
        await db.update(activations).set({ lastPolledAt: new Date() }).where(eq(activations.id, id));
        const wait = new URL(request.url).searchParams.get("wait") === "1";
        act = await applyActivationUpdate(id, await providerRequest(`/activations/${encodeURIComponent(act.providerId)}${wait ? "/wait" : ""}`, { wait }));
      }
    }
    return Response.json({ activation: act });
  } catch(e) { return apiError(e); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); await limit(request, "activation-action", 20); const { id } = await params; const act = await owned(id); const { action } = await request.json();
    if (!act.isDemo) throw new AppError("NumberOTP's public API does not document cancellation or resend. Your number expires automatically; provider-confirmed non-delivery is refunded.", 409);
    if (act.status !== "waiting") throw new AppError("This number is no longer waiting for a message.", 409);
    if (action === "cancel") return Response.json({ activation: await applyActivationUpdate(id, { status: "cancelled" }) });
    if (action === "simulate") return Response.json({ activation: await applyActivationUpdate(id, { status: "received", otp: "482910", full_sms: `Sandbox message: your ${act.serviceName} demo code is 482910. No real SMS was sent.` }) });
    throw new AppError("Unknown activation action.");
  } catch(e) { return apiError(e); }
}
