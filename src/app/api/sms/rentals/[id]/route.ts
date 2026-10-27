import { db } from "@/db";
import { rentals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, AppError, limit, sameOrigin } from "@/lib/server";
import { providerRequest } from "@/lib/numberotp";
import { applyRentalUpdate } from "@/lib/billing";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
async function owned(id: string) {
  z.string().uuid().parse(id); const user = await requireUser();
  const [rental] = await db.select().from(rentals).where(and(eq(rentals.id, id), eq(rentals.userId, user.id)));
  if (!rental) throw new AppError("Rental not found.", 404);
  return rental;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; let rental = await owned(id);
    if (rental.status === "active") {
      if (rental.isDemo) {
        if (rental.expiresAt.getTime() <= Date.now()) rental = await applyRentalUpdate(id, { status: "expired" });
        else if (!rental.messages.length && Date.now() - rental.createdAt.getTime() > 15000) rental = await applyRentalUpdate(id, { status: "active", smsHistory: [{ code: "482910", text: `Sandbox message: your ${rental.serviceName} demo verification code is 482910. This is not a real SMS.`, receivedAt: new Date().toISOString() }] });
      } else if (rental.providerId && (!rental.lastPolledAt || Date.now() - rental.lastPolledAt.getTime() > 6000)) {
        await db.update(rentals).set({ lastPolledAt: new Date() }).where(eq(rentals.id, id));
        rental = await applyRentalUpdate(id, await providerRequest(`/rentals/${encodeURIComponent(rental.providerId)}`));
      }
    }
    return Response.json({ rental });
  } catch (e) { return apiError(e); }
}
// Sandbox only: add another sample message so the experience can be previewed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); await limit(request, "rental-action", 20); const { id } = await params; const rental = await owned(id);
    if (!rental.isDemo) throw new AppError("Messages for a live rental arrive from the provider automatically.", 409);
    if (rental.status !== "active") throw new AppError("This rental is no longer active.", 409);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const messages = [...rental.messages, { code, text: `Sandbox message: your ${rental.serviceName} demo code is ${code}. No real SMS was sent.`, receivedAt: new Date().toISOString() }];
    return Response.json({ rental: await applyRentalUpdate(id, { status: "active", smsHistory: messages }) });
  } catch (e) { return apiError(e); }
}
