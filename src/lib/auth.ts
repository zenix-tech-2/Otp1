import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { AppError, ensureSeed, IS_DEMO } from "./server";
const scrypt = promisify(scryptCallback);
const COOKIE = "sms_store_session";
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const original = Buffer.from(hash, "hex");
  return original.length === derived.length && timingSafeEqual(original, derived);
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export async function createSession(userId: string) {
  const jar = await cookies();
  const old = jar.get(COOKIE)?.value;
  if (old) await db.delete(sessions).where(eq(sessions.tokenHash, createHash("sha256").update(old).digest("hex")));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId, expiresAt });
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}
export async function clearSession() {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, createHash("sha256").update(token).digest("hex")));
  jar.delete(COOKIE);
}
export async function getUser(createDemo = false): Promise<User | null> {
  await ensureSeed();
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, createHash("sha256").update(token).digest("hex")), gt(sessions.expiresAt, new Date())));
    if (row && !row.user.suspended && (IS_DEMO || !row.user.isDemo)) return row.user;
  }
  if (createDemo && IS_DEMO) {
    const [user] = await db.insert(users).values({ email: `preview-${randomBytes(10).toString("hex")}@sandbox.smsstore.local`, name: "Alex Morgan", role: "demo", balance: 2500, isDemo: true }).returning();
    await createSession(user.id);
    return user;
  }
  return null;
}
export async function requireUser() {
  const user = await getUser(true);
  if (!user) throw new AppError("Please sign in to continue.", 401);
  return user;
}
export async function requireAdmin() {
  const user = await getUser(false);
  if (!user) throw new AppError("Administrator sign-in is required.", 401);
  if (user.role !== "admin") throw new AppError("Administrator access is required.", 403);
  return user;
}
export function publicUser(user: User | null) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.role === "demo" ? "alex@example.com" : user.email, balance: user.balance, role: user.role, isDemo: user.isDemo, countryCode: user.countryCode, countryName: user.countryName, currency: user.currency };
}
