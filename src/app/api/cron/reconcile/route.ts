import { db } from "@/db";
import { activations,rateLimits,sessions } from "@/db/schema";
import { and,eq,lt } from "drizzle-orm";
import { secureEqual } from "@/lib/auth";
import { applyActivationUpdate, healStuckNumbers } from "@/lib/billing";
import { providerRequest } from "@/lib/numberotp";
import { reconcilePayments } from "@/lib/payments";
import { reconcileSmmOrders } from "@/lib/smm";
import { apiError,AppError,audit,IS_DEMO } from "@/lib/server";
export const maxDuration=60;export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const secret=process.env.CRON_SECRET;if(!secret||secret.length<16)throw new AppError("Scheduled reconciliation is not configured.",503);if(!secureEqual(request.headers.get("authorization")||"",`Bearer ${secret}`))throw new AppError("Unauthorized.",401);
 const now=new Date();await Promise.all([db.delete(sessions).where(lt(sessions.expiresAt,now)),db.delete(rateLimits).where(lt(rateLimits.expiresAt,now))]);
 const paymentWork=reconcilePayments();const pending=await db.select().from(activations).where(and(eq(activations.status,"waiting"),eq(activations.isDemo,IS_DEMO),lt(activations.expiresAt,now))).orderBy(activations.lastPolledAt).limit(5);let reconciled=0;let failed=0;
 await Promise.all(pending.map(async activation=>{try{if(activation.isDemo)await applyActivationUpdate(activation.id,{status:"expired"});else if(activation.providerId)await applyActivationUpdate(activation.id,await providerRequest(`/activations/${encodeURIComponent(activation.providerId)}`));else return;reconciled++;}catch{failed++;}}));
 const healed=await healStuckNumbers().catch(()=>-1);const payments=await paymentWork;const boost=await reconcileSmmOrders().catch(()=>-1);await audit(null,"system.reconciliation",undefined,{reconciled,failed,checked:pending.length,payments,boost,healed});return Response.json({ok:true,reconciled,failed,checked:pending.length,payments,boost,healed});
}catch(e){return apiError(e);}}
