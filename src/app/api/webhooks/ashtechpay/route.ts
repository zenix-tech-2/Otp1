import { createHash } from "node:crypto";
import { after } from "next/server";
import { db } from "@/db";
import { paymentEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAshtechSignature } from "@/lib/payment-verification";
import { processPaymentEvent } from "@/lib/payments";
import { object, unwrapAshtech } from "@/lib/ashtech";
import { apiError, AppError } from "@/lib/server";
export const maxDuration=60;
export async function POST(request:Request){try{
 const secret=process.env.ASHTECH_WEBHOOK_SECRET;if(!secret)throw new AppError("Payment webhooks are not configured.",503);
 if(Number(request.headers.get("content-length")||0)>65536)throw new AppError("Payload too large.",413);
 const raw=await request.text();if(Buffer.byteLength(raw)>65536)throw new AppError("Payload too large.",413);
 if(!verifyAshtechSignature(raw,request.headers.get("x-ashtech-timestamp")||"",request.headers.get("x-ashtech-signature")||"",secret))throw new AppError("Invalid or expired payment signature.",401);
 const eventId=request.headers.get("x-ashtech-event-id");if(!eventId||eventId.length>180)throw new AppError("Missing payment event ID.",400);
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new AppError("Invalid event JSON.",400);}const root=object(parsed);const data=object(unwrapAshtech(parsed));const providerId=String(data.transaction_id||root.transaction_id||"");if(!providerId||providerId.length>180)throw new AppError("Missing transaction ID.",400);
 const event=String(root.event||data.event||data.status||"payment.update");
 if(event.startsWith("conversion.")||event.startsWith("payout."))return Response.json({received:true,ignored:true});
 const bodyHash=createHash("sha256").update(raw).digest("hex");
 const [existing]=await db.select().from(paymentEvents).where(eq(paymentEvents.id,eventId));if(existing&&existing.bodyHash!==bodyHash)throw new AppError("Event ID conflicts with its original payload.",409);
 if(existing?.status==="processed")return Response.json({received:true,duplicate:true});
 await db.insert(paymentEvents).values({id:eventId,providerId,event,bodyHash,payload:{transaction_id:providerId,reference:data.reference??root.reference,merchant_reference:data.merchant_reference??root.merchant_reference,status:data.status??root.status,amount:data.amount,currency:data.currency}}).onConflictDoNothing();
 after(async()=>{await processPaymentEvent(eventId);});
 return Response.json({received:true,queued:true},{status:202});
}catch(e){return apiError(e);}}
