import "server-only";
import { db } from "@/db";
import { settings, products, announcements, auditLogs, rateLimits, storeCategories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { productSeeds } from "./catalog";
import { initialCategories } from "./categories";

export const IS_DEMO = process.env.APP_MODE === "demo" || (!process.env.VERCEL && process.env.APP_MODE !== "live");
export const defaultSettings = { appName: "Store OTP", smsMarkup: 25, smmMarkup: 35, supportEmail: "support@sellizi.store", maintenance: false, allowRegistrations: true, announcement: "Your digital essentials. All in one place.", currency: "USD" };
export type AppSettings = typeof defaultSettings;
let seedPromise: Promise<void> | undefined;
export function ensureSeed() {
  if (!seedPromise) seedPromise = (async () => {
    await db.insert(settings).values({ key: "app", value: defaultSettings }).onConflictDoNothing();
    await db.insert(storeCategories).values(initialCategories).onConflictDoNothing();
    if (IS_DEMO) {
      await db.insert(products).values(productSeeds.map(p => ({ ...p, metadata: p.metadata as Record<string, string>, fulfillment: p.category === "proxies" ? null : "This is a sandbox order. No real subscription or account has been purchased. In your live store, your private delivery instructions or download link will appear here." }))).onConflictDoNothing();
      const [existing] = await db.select().from(settings).where(eq(settings.key, "demo_seeded"));
      if (!existing) {
        await db.transaction(async tx => {
          const created = await tx.insert(settings).values({ key: "demo_seeded", value: { done: true } }).onConflictDoNothing().returning();
          if (created.length) await tx.insert(announcements).values([
            { title: "Welcome to your digital neighborhood", body: "Meet Store OTP. Find virtual numbers, premium apps, and digital essentials in one simple place.", kind: "news" },
            { title: "Your next upgrade is here", body: "Explore our growing collection of premium apps and creative tools. New favorites are waiting in the store.", kind: "update" },
            { title: "A safer way to get verified", body: "Keep your personal number private. Explore the virtual number flow in our clearly labeled sandbox before connecting your provider.", kind: "service" },
          ]);
        });
      }
    }
  })().catch(error => { seedPromise = undefined; throw error; });
  return seedPromise;
}
export async function getSettings(): Promise<AppSettings> {
  await ensureSeed();
  const [row] = await db.select().from(settings).where(eq(settings.key, "app"));
  return { ...defaultSettings, ...row?.value } as AppSettings;
}
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 422 });
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Request failed:", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "Something went wrong. Please try again in a moment." }, { status: 500 });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (origin && new URL(origin).host !== host) throw new AppError("This request is not allowed.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("Cross-site requests are not allowed.", 403);
}
export async function limit(request: Request, action: string, max = 30, seconds = 60) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = createHash("sha256").update(`${action}:${ip}:${bucket}`).digest("hex");
  const [row] = await db.insert(rateLimits).values({ key, count: 1, expiresAt: new Date((bucket + 1) * seconds * 1000) }).onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } }).returning();
  if (row.count > max) throw new AppError("Too many requests. Please wait a minute and try again.", 429);
}
export async function audit(actorId: string | null, action: string, target?: string, details: Record<string, unknown> = {}) {
  await db.insert(auditLogs).values({ actorId, action, target, details });
}
export async function requireStoreOpen() { if ((await getSettings()).maintenance) throw new AppError("We’re making a few improvements. New purchases will be back shortly.", 503); }
