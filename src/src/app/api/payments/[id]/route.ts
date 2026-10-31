import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ownedPayment, publicPayment, startPayment, confirmPaymentOtp, verifyPayment, simulatePayment } from "@/lib/payments";
import { apiError, AppError, limit, requireStoreOpen, sameOrigin } from "@/lib/server";
export const dynamic="force-dynamic";export const maxDuration=45;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{await limit(request,"payment-status",90);const user=await requireUser();const {id}=await params;z.string().uuid().parse(id);let payment=await ownedPayment(id,user.id);let verificationError:string|undefined;
if(!payment.isDemo&&!payment.creditedAt&&payment.providerId&&["pending","creating","confirming","reconciliation"].includes(payment.status)&&(!payment.lastCheckedAt||Date.now()-payment.lastCheckedAt.getTime()>8000)){try{payment=await verifyPayment(payment.id);}catch(e){verificationError=e instanceof AppError?e.message:"Verification is temporarily unavailable. Your payment remains saved.";payment=await ownedPayment(id,user.id);}}
return Response.json({payment:publicPayment(payment),verificationError});}catch(e){return apiError(e);}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);await limit(request,"payment-actions",15);const user=await requireUser();const {id}=await params;z.string().uuid().parse(id);const payment=await ownedPayment(id,user.id);const data=await request.json();let updated=payment;
if(data.action==="start"){await requireStoreOpen();updated=await startPayment(payment,user,data);}else if(data.action==="otp"){const {otp}=z.object({otp:z.string().regex(/^\d{4,10}$/)}).parse(data);updated=await confirmPaymentOtp(payment,otp);}else if(data.action==="simulate"){const {status}=z.object({status:z.enum(["completed","failed"])}).parse(data);updated=await simulatePayment(payment,status);}else throw new AppError("Unknown payment action.");
return Response.json({payment:publicPayment(updated)});}catch(e){return apiError(e);}}
