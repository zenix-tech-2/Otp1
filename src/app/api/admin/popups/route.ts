import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { AppError, apiError, audit, limit, sameOrigin } from "@/lib/server";
import { loadPopups, savePopups } from "@/lib/popups";
import { POPUP_IMAGE_MAX_CHARS, POPUP_IMAGE_PATTERN, POPUP_LIMIT, safePopupLink, type Popup } from "@/lib/popup-core";
export const dynamic = "force-dynamic";
export async function GET() { try { await requireAdmin(); return Response.json({ popups: await loadPopups() }); } catch (e) { return apiError(e); } }
const date = z.string().datetime({ offset: true }).or(z.literal("")).nullish().transform(v => v || null);
const input = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2, "Give the pop-up a title.").max(100),
  body: z.string().trim().max(1200).default(""),
  image: z.string().max(POPUP_IMAGE_MAX_CHARS, "That image is too large. Try a smaller one.").default("").refine(v => v === "" || POPUP_IMAGE_PATTERN.test(v) || /^\/images\/[\w.-]+$/.test(v), "Upload a PNG, JPG or WebP image."),
  buttonLabel: z.string().trim().max(30).default("Close"),
  linkUrl: z.string().trim().max(300).default("").refine(v => v === "" || safePopupLink(v) !== null, "Use a path inside the app (like /gift) or a full https:// link."),
  linkLabel: z.string().trim().max(30).default(""),
  active: z.boolean().default(true), frequency: z.enum(["session", "once"]).default("session"), startsAt: date, endsAt: date,
}).refine(v => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), { message: "The end date must be after the start date.", path: ["endsAt"] });
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "admin-popups", 30); const admin = await requireAdmin();
    const body = await request.json(); const action = z.object({ action: z.enum(["save", "delete", "toggle"]) }).parse(body).action;
    const items = await loadPopups(); const now = new Date().toISOString();
    if (action === "delete") { const { id } = z.object({ id: z.string().uuid() }).parse(body); await savePopups(items.filter(p => p.id !== id)); await audit(admin.id, "popup.deleted", id); return Response.json({ ok: true }); }
    if (action === "toggle") { const { id, active } = z.object({ id: z.string().uuid(), active: z.boolean() }).parse(body); if (!items.some(p => p.id === id)) throw new AppError("Pop-up not found.", 404); await savePopups(items.map(p => p.id === id ? { ...p, active, updatedAt: now } : p)); await audit(admin.id, active ? "popup.enabled" : "popup.disabled", id); return Response.json({ ok: true }); }
    const { id, ...data } = input.parse(body); const buttonLabel = data.buttonLabel || "Close";
    if (id) {
      const existing = items.find(p => p.id === id); if (!existing) throw new AppError("Pop-up not found.", 404);
      await savePopups(items.map(p => p.id === id ? { ...existing, ...data, buttonLabel, updatedAt: now } : p)); await audit(admin.id, "popup.updated", data.title); return Response.json({ ok: true, id });
    }
    if (items.length >= POPUP_LIMIT) throw new AppError(`You can keep up to ${POPUP_LIMIT} pop-ups. Delete an old one first.`);
    const created: Popup = { id: crypto.randomUUID(), ...data, buttonLabel, createdAt: now, updatedAt: now };
    await savePopups([created, ...items]); await audit(admin.id, "popup.created", data.title); return Response.json({ ok: true, id: created.id });
  } catch (e) { return apiError(e); }
}
