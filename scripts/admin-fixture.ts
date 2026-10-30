// Disposable test administrator. Never enables public demo administration.
// Run test scripts with: node --import dotenv/config --import tsx ...
import {createHash,randomBytes,randomUUID,scryptSync} from "node:crypto";
import {db,pool} from "../src/db/index";
import {auditLogs,sessions,users} from "../src/db/schema";
import {eq} from "drizzle-orm";
import type {BrowserContext} from "@playwright/test";
export async function createAdminFixture(base:string){
 const database=new URL(process.env.DATABASE_URL||"http://not-configured");if(!["localhost","127.0.0.1"].includes(database.hostname)||database.pathname!=="/app_db"||process.env.APP_MODE==="live")throw new Error("Admin fixtures are restricted to the disposable local sandbox database.");
 const response=await fetch(`${base}/api/auth`);const mode=await response.json();if(!mode.demo)throw new Error("Refusing to create a test administrator for a live deployment.");
 const password=randomBytes(24).toString("base64url");const salt=randomBytes(16).toString("hex");const email=`test-admin-${randomUUID()}@sandbox.storeotp.local`;
 const [user]=await db.insert(users).values({email,name:"Test Administrator",passwordHash:`${salt}:${scryptSync(password,salt,64).toString("hex")}`,role:"admin",isDemo:true,balance:0}).returning();
 const token=randomBytes(32).toString("hex");await db.insert(sessions).values({tokenHash:createHash("sha256").update(token).digest("hex"),userId:user.id,expiresAt:new Date(Date.now()+3600000)});
 return {email,password,userId:user.id,async install(context:BrowserContext){await context.addCookies([{name:"sms_store_session",value:token,url:base,httpOnly:true,secure:base.startsWith("https:"),sameSite:"Lax"}]);},async cleanup(){await db.delete(sessions).where(eq(sessions.userId,user.id));await db.delete(auditLogs).where(eq(auditLogs.actorId,user.id));await db.delete(users).where(eq(users.id,user.id));await pool.end();}};
}
