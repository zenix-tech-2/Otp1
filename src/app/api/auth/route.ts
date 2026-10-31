import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { clearSession, createSession, getUser, hashPassword, publicUser, verifyPassword } from "@/lib/auth";
import { apiError, AppError, audit, getSettings, IS_DEMO, limit, sameOrigin } from "@/lib/server";
import { resolveSignupCountry } from "@/lib/ashtech";
import { safeCurrencyQuote } from "@/lib/fx";
import { fromUsd } from "@/lib/currency";
export const dynamic = "force-dynamic";
export async function GET() { try { const user=await getUser(true);return Response.json({ user: publicUser(user), pricing: await safeCurrencyQuote(user?.currency||"USD"), demo: IS_DEMO, settings: await getSettings() }); } catch(e) { return apiError(e); } }
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "auth", 15, 300);
    const input = await request.json();
    if (input.action === "logout") { await clearSession(); return Response.json({ success: true }); }
    if (input.action === "password") {
      const user = await getUser(false);
      if (!user) throw new AppError("Please sign in to change your password.", 401);
      if (!user.passwordHash) throw new AppError("This preview account does not have a password.", 409);
      const data = z.object({ currentPassword: z.string().min(8).max(128), newPassword: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).refine(d => d.newPassword === d.confirmPassword, "Your new passwords do not match.").refine(d => d.newPassword !== d.currentPassword, "Choose a different password from your current one.").parse(input);
      if (!(await verifyPassword(data.currentPassword, user.passwordHash))) throw new AppError("Your current password is incorrect.", 401);
      const passwordHash = await hashPassword(data.newPassword);
      await db.transaction(async tx => { const [locked] = await tx.select().from(users).where(eq(users.id,user.id)).for("update");if(!locked||locked.passwordHash!==user.passwordHash)throw new AppError("Your credentials have changed. Please sign in again.",409);await tx.update(users).set({passwordHash}).where(eq(users.id,user.id));await tx.delete(sessions).where(eq(sessions.userId,user.id)); });
      await createSession(user.id); await audit(user.id,"account.password_changed");return Response.json({success:true});
    }
    const data = z.object({ action:z.enum(["login","register"]), email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()), password:z.string().min(8).max(128), name:z.string().trim().min(2).max(80).optional(), countryCode:z.string().trim().toUpperCase().regex(/^(OTHER|[A-Z]{2})$/).optional() }).superRefine((data,ctx)=>{if(data.action==="register"&&!data.countryCode)ctx.addIssue({code:"custom",path:["countryCode"],message:"Choose your country or Other (USD)."});}).parse(input);
    const config=await getSettings();let [user]=await db.select().from(users).where(eq(users.email,data.email));
    if(data.action==="register"){
      if(!config.allowRegistrations)throw new AppError("New registrations are temporarily paused.",403);
      if(user)throw new AppError("An account with this email already exists. Please sign in.",409);
      const country=await resolveSignupCountry(data.countryCode!);const quote=IS_DEMO?await safeCurrencyQuote(country.currency):null;
      [user]=await db.insert(users).values({name:data.name||data.email.split("@")[0],email:data.email,passwordHash:await hashPassword(data.password),...country,isDemo:IS_DEMO,balance:IS_DEMO&&quote?fromUsd(2500,quote):0}).returning();
      await audit(user.id,"account.created",undefined,{countryCode:country.countryCode,currency:country.currency});
    }else{
      if(!user||!user.passwordHash||!(await verifyPassword(data.password,user.passwordHash)))throw new AppError("Your email or password is incorrect.",401);
      if(user.suspended||(!IS_DEMO&&user.isDemo))throw new AppError("This account is not available. Please contact support.",403);
    }
    await createSession(user.id);return Response.json({user:publicUser(user),pricing:await safeCurrencyQuote(user.currency),demo:IS_DEMO});
  }catch(e){return apiError(e);}
}
