import "server-only";
import {notifyUser} from "./notify";
import { db } from "@/db";
import { orders, payments, paymentEvents, users, auditLogs, type Payment, type User } from "@/db/schema";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, IS_DEMO } from "./server";
import { ashtechRequest, AshtechError, getCryptoAssets, getPaymentCountries, isSimulation, merchantId, notifyUrl, object, paymentConfigured, safeProviderUrl, unwrapAshtech } from "./ashtech";
import { convertMinor, currencyDigits, formatMoney, majorToMinor, minorToMajor, toUsd } from "./currency";
import { getCurrencyQuote } from "./fx";
import type { PaymentQuote, PublicPayment } from "./payment-types";
import { verifyTransactionFields } from "./payment-verification";

const MAX_BALANCE = 2000000000;
const terminal = ["completed", "failed", "cancelled", "expired", "simulation"];
export function publicPayment(payment: Payment): PublicPayment {
  const details = payment.details; const allowed = ["waveUrl", "ussdCode", "instruction", "address", "network", "memo", "memoType", "cryptoAmount", "expiresAt", "feeAmount", "feeCurrency", "warning"];
  const safe: Record<string, string> = {}; for (const key of allowed) if (typeof details[key] === "string") safe[key] = details[key];
  return { id: payment.id, orderId: payment.orderId, merchantReference: payment.merchantReference, providerId: payment.providerId, method: payment.method, countryCode: payment.countryCode, currency: payment.currency, amount: payment.amount, walletCurrency: payment.walletCurrency, walletAmount: payment.walletAmount, operator: payment.operator, phoneMasked: payment.phone ? `${payment.phone.slice(0,3)} •••• ${payment.phone.slice(-4)}` : null, assetCode: payment.assetCode, status: payment.status, isDemo: payment.isDemo, createdAt: payment.createdAt.toISOString(), creditedAt: payment.creditedAt?.toISOString() || null, details: safe };
}
export async function ownedPayment(id: string, userId: string) { const [payment] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, userId))); if (!payment) throw new AppError("Payment not found.", 404); return payment; }
export const quoteSchema = z.object({ amount: z.string().min(1).max(20), method: z.enum(["mobile_money", "crypto"]), countryCode: z.string().regex(/^[A-Z]{2}$/), operator: z.string().min(1).max(100).optional(), assetCode: z.string().min(1).max(60).optional() });
export async function createPaymentQuote(user: User, input: unknown): Promise<PaymentQuote> {
  const data = quoteSchema.parse(input);
  if (!IS_DEMO && !paymentConfigured()) throw new AppError("Ashtech Pay is not fully connected yet. Please contact store support.", 503);
  let walletAmount: number; try { walletAmount = majorToMinor(data.amount, user.currency); } catch(e) { throw new AppError((e as Error).message, 422); }
  if (!walletAmount) throw new AppError("Enter an amount greater than zero.");
  const walletFx = await getCurrencyQuote(user.currency); const baseAmount = toUsd(walletAmount, walletFx);
  if (baseAmount < 100 || baseAmount > 100000) throw new AppError("Top-ups must be between the equivalent of US$1 and US$1,000.");
  let currency = "USDT"; let operator: string | undefined; let assetCode: string | undefined;
  if (data.method === "mobile_money") {
    const catalog = await getPaymentCountries(true); const country = catalog.countries.find(c => c.code === data.countryCode);
    if (!country || !data.operator || !country.operators.includes(data.operator)) throw new AppError("This country or operator is no longer available. Refresh the payment methods.", 409);
    if (user.countryCode !== "OTHER" && (user.countryCode !== country.code || user.currency !== country.currency)) throw new AppError("Mobile Money must use your account’s registered country and currency.", 409);
    currency = country.currency; operator = data.operator;
  } else {
    const assets = await getCryptoAssets(); const asset = assets.find(a => a.code === data.assetCode);
    if (!asset) throw new AppError("Please choose a currently available USDT network.", 422);
    if (user.countryCode !== "OTHER" && data.countryCode !== user.countryCode) throw new AppError("The payer country must match your registered country.", 422);
    const label = new Intl.DisplayNames(["en"], { type: "region" }).of(data.countryCode); if (!label || label === data.countryCode) throw new AppError("Enter your actual two-letter country code.", 422);
    assetCode = asset.code;
  }
  const payFx = await getCurrencyQuote(currency); const amount = convertMinor(walletAmount, walletFx, payFx); const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  const id = crypto.randomUUID(); const merchantReference = `smsw_${id.replaceAll("-", "")}`;
  await db.transaction(async tx => {
    const [wallet] = await tx.select().from(users).where(eq(users.id, user.id)).for("update"); if (!wallet || wallet.suspended || wallet.currency !== user.currency) throw new AppError("Your account is unavailable.", 403);
    if (wallet.balance + walletAmount > MAX_BALANCE) throw new AppError("This top-up would exceed your wallet limit.");
    const [order] = await tx.insert(orders).values({ userId: user.id, kind: "topup", title: IS_DEMO ? "Sandbox Ashtech Pay top-up" : "Ashtech Pay wallet top-up", amount: walletAmount, currency: user.currency, baseAmount, status: "draft", idempotencyKey: `ashtech:${id}`, metadata: { provider: "ashtechpay", paymentId: id, reference: merchantReference, demo: IS_DEMO, paymentCurrency: currency, paymentAmount: amount } }).returning();
    await tx.insert(payments).values({ id, userId: user.id, orderId: order.id, merchantReference, method: data.method, countryCode: data.countryCode, currency, amount, walletCurrency: user.currency, walletAmount, operator, assetCode, status: "quoted", isDemo: IS_DEMO, details: { quoteExpiresAt: expiresAt, walletFx, payFx, feePolicy: "merchant_absorbs_provider_fees" } });
  });
  return { id, method: data.method, walletAmount, walletCurrency: user.currency, amount, currency, countryCode: data.countryCode, operator, assetCode, expiresAt, demo: IS_DEMO, rateNote: currency === user.currency ? "No currency conversion." : `${formatMoney(amount,currency)} pays for ${formatMoney(walletAmount,user.currency)} in your wallet. The quoted conversion is locked for 10 minutes.`, feePolicy: "The store covers Ashtech Pay processing fees. Your wallet receives the amount shown. Your mobile operator or crypto wallet may charge its own network fees." };
}
function instructions(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  const strings: Record<string,string> = { ussd_code: "ussdCode", address: "address", network: "network", memo: "memo", tag: "memo", memo_type: "memoType", expires_at: "expiresAt" };
  for (const [source,target] of Object.entries(strings)) if (typeof data[source] === "string" && String(data[source]).length < 2000) result[target] = data[source];
  const wave = safeProviderUrl(data.wave_url); if (wave) result.waveUrl = wave;
  if (data.gross_amount_usdt != null || data.amount_usdt != null) result.cryptoAmount = String(data.gross_amount_usdt ?? data.amount_usdt);
  if (data.fee_amount != null) { result.feeAmount = String(data.fee_amount); result.feeCurrency = data.payment_method === "crypto" ? "USDT" : String(data.currency || ""); }
  return result;
}
async function saveInitiation(payment: Payment, raw: unknown) {
  const data = object(unwrapAshtech(raw));
  return db.transaction(async tx => {
    await tx.select().from(orders).where(eq(orders.id,payment.orderId)).for("update");
    const [current] = await tx.select().from(payments).where(eq(payments.id,payment.id)).for("update");
    if (!current || current.creditedAt || terminal.includes(current.status)) return current || payment;
    if (isSimulation(data) || isSimulation(object(raw))) {
      const [blocked] = await tx.update(payments).set({ status: "simulation", updatedAt:new Date(), details: { ...current.details, warning:"Ashtech Pay returned a simulated test result. No real wallet credit has been issued." } }).where(eq(payments.id,payment.id)).returning();
      await tx.update(orders).set({status:"failed"}).where(eq(orders.id,payment.orderId)); return blocked;
    }
    const id = data.transaction_id != null ? String(data.transaction_id) : current.providerId;
    if (current.providerId && id && current.providerId !== id) throw new AppError("The provider returned a conflicting transaction ID. Please reconcile this payment.", 409);
    const otp = data.error === "otp_required"; const reference = typeof data.reference === "string" ? data.reference : current.providerReference;
    const usable = otp ? Boolean(reference) : Boolean(id);
    let status = usable ? otp ? "otp_required" : "pending" : "reconciliation";
    const details = { ...current.details, ...instructions(data), instruction: otp ? (data.ussd_code ? "Dial the displayed USSD code on your phone, then enter the payment OTP you receive." : "Enter the payment OTP sent to your phone.") : data.flow === "wave" ? "Open the provider’s Wave link to approve your payment, then return here." : "Approve the payment request on your phone. Never enter your Mobile Money PIN here.", ...(!usable ? { warning:"We saved your payment, but the provider response needs verification. Please don’t start another payment." } : {}) };
    if (typeof id === "string" && id.length > 180) status = "reconciliation";
    const [updated] = await tx.update(payments).set({ providerId: id && id.length <= 180 ? id : current.providerId, providerReference: reference, otpReference: otp ? reference : current.otpReference, status, details, updatedAt:new Date() }).where(eq(payments.id,payment.id)).returning();
    await tx.update(orders).set({status: status === "reconciliation" ? "reconciliation" : "pending"}).where(eq(orders.id,payment.orderId));
    return updated;
  });
}
async function savePaymentError(payment: Payment, error: unknown, otp = false) {
  return db.transaction(async tx => {
    await tx.select().from(orders).where(eq(orders.id,payment.orderId)).for("update");
    const [current] = await tx.select().from(payments).where(eq(payments.id,payment.id)).for("update"); if (!current || current.creditedAt || terminal.includes(current.status)) return current || payment;
    const providerError = error instanceof AshtechError ? error : null;
    const retryOtp = otp && providerError?.code === "invalid_otp";
    const inProgress = providerError?.code === "otp_confirmation_in_progress";
    const status = retryOtp ? "otp_required" : providerError?.code === "otp_expired" ? "expired" : inProgress ? "pending" : providerError?.uncertain || !providerError ? "reconciliation" : "failed";
    const warning = error instanceof AppError ? error.message : "This payment needs verification before proceeding. Please contact support.";
    const [updated] = await tx.update(payments).set({status,updatedAt:new Date(),details:{...current.details,warning}}).where(eq(payments.id,payment.id)).returning();
    await tx.update(orders).set({status:retryOtp || inProgress ? "pending" : status === "reconciliation" ? status : "failed"}).where(eq(orders.id,payment.orderId));return updated;
  });
}
export async function startPayment(payment:Payment,user:User,input:unknown) {
  const data = z.object({ phone:z.string().trim().max(40).optional(), firstName:z.string().trim().min(1).max(80).optional(), lastName:z.string().trim().min(1).max(80).optional(), demoFlow:z.enum(["push","otp","wave"]).optional() }).parse(input);
  if (payment.isDemo !== IS_DEMO) throw new AppError("This payment belongs to a different environment.",403);
  if (!IS_DEMO && data.demoFlow) throw new AppError("Sandbox options are not permitted in live payments.",422);
  if (payment.status !== "quoted") return payment;
  if (new Date(String(payment.details.quoteExpiresAt)).getTime()<Date.now()) throw new AppError("This quote has expired. Please review a fresh quote.",409);
  let phone = "";
  if (payment.method === "mobile_money") {
    if (!data.phone || !/^\+?[\d\s().-]+$/.test(data.phone)) throw new AppError("Enter your Mobile Money number in international format.",422);
    phone=data.phone.replace(/[^\d]/g,""); if (!/^\d{8,15}$/.test(phone)) throw new AppError("Your phone number must contain 8–15 digits, including the country code.",422);
    const catalog=await getPaymentCountries(true); const country=catalog.countries.find(c=>c.code===payment.countryCode); if (!country || country.currency!==payment.currency || !country.operators.includes(payment.operator||"")) throw new AppError("This payment operator is no longer available. Request a new quote.",409);
  } else if (!data.firstName || !data.lastName) throw new AppError("Your actual first and last name are required for crypto payments.",422);
  if (!IS_DEMO) { merchantId();notifyUrl();if(!paymentConfigured())throw new AppError("Payments are not fully configured.",503); }
  const reserved=await db.transaction(async tx=>{
    await tx.select().from(orders).where(eq(orders.id,payment.orderId)).for("update");
    const [row]=await tx.select().from(payments).where(eq(payments.id,payment.id)).for("update");if(row.status!=="quoted")return {payment:row,start:false};
    const [updated]=await tx.update(payments).set({status:"creating",phone:phone||null,updatedAt:new Date(),details:{...row.details,demoFlow:IS_DEMO?data.demoFlow||"push":undefined}}).where(eq(payments.id,row.id)).returning();await tx.update(orders).set({status:"pending"}).where(eq(orders.id,row.orderId));return {payment:updated,start:true};
  });
  if(!reserved.start)return reserved.payment;
  const current=reserved.payment;
  if(IS_DEMO){const [updated]=await db.update(payments).set({status:data.demoFlow==="otp"?"otp_required":"pending",providerId:`demo_${current.id}`,otpReference:data.demoFlow==="otp"?`demo_otp_${current.id}`:null,details:{...current.details,instruction:current.method==="crypto"?"Sandbox only. No real address is generated and no funds can be sent.":data.demoFlow==="otp"?"Sandbox payment OTP: enter 000000. Never enter a real PIN.":data.demoFlow==="wave"?"Sandbox Wave approval. No real payment app is opened.":"Sandbox phone approval. No charge or real notification was sent.",...(current.method==="crypto"?{network:"TRC20",cryptoAmount:minorToMajor(current.amount,"USDT"),expiresAt:new Date(Date.now()+15*60000).toISOString()}:{}),...(data.demoFlow==="otp"?{ussdCode:"#SANDBOX#"}:{})},updatedAt:new Date()}).where(eq(payments.id,current.id)).returning();return updated;}
  try {
    const raw=current.method==="mobile_money"?await ashtechRequest("/collect",{method:"POST",body:{user_id:merchantId(),amount:Number(minorToMajor(current.amount,current.currency)),currency:current.currency,country_code:current.countryCode,operator:current.operator,phone:current.phone,reference:current.merchantReference,notify_url:notifyUrl()}}):await ashtechRequest("/crypto/collect",{method:"POST",body:{user_id:merchantId(),amount:minorToMajor(current.amount,"USDT"),currency:"USDT",asset_code:current.assetCode,country:current.countryCode,reference:current.merchantReference,customer:{email:user.email,firstName:data.firstName,lastName:data.lastName},notify_url:notifyUrl()}});
    const saved=await saveInitiation(current,raw); if(saved.providerId && saved.status==="pending")return await verifyPayment(saved.id).catch(()=>saved);return saved;
  }catch(e){return savePaymentError(current,e);}
}
export async function confirmPaymentOtp(payment:Payment,otp:string){
  if(payment.isDemo!==IS_DEMO)throw new AppError("This payment belongs to another environment.",403);
  if(payment.status!=="otp_required")return payment;
  if(!/^\d{4,10}$/.test(otp))throw new AppError("Enter the payment OTP you received (4–10 digits).",422);
  const locked=await db.transaction(async tx=>{await tx.select().from(orders).where(eq(orders.id,payment.orderId)).for("update");const [row]=await tx.select().from(payments).where(eq(payments.id,payment.id)).for("update");if(row.status!=="otp_required")return {payment:row,confirm:false};const [updated]=await tx.update(payments).set({status:"confirming",updatedAt:new Date()}).where(eq(payments.id,row.id)).returning();return {payment:updated,confirm:true};});
  if(!locked.confirm)return locked.payment;
  if(IS_DEMO){if(otp!=="000000")return savePaymentError(payment,new AshtechError("The sandbox OTP is 000000.",400,"invalid_otp"),true);const [updated]=await db.update(payments).set({status:"pending",details:{...payment.details,warning:"",instruction:"Sandbox OTP accepted. You can now simulate confirmation."},updatedAt:new Date()}).where(eq(payments.id,payment.id)).returning();return updated;}
  if(!payment.otpReference)throw new AppError("The provider OTP session is missing. Please contact support.",409);
  try{const raw=await ashtechRequest("/collect",{method:"POST",body:{user_id:merchantId(),amount:Number(minorToMajor(payment.amount,payment.currency)),currency:payment.currency,country_code:payment.countryCode,operator:payment.operator,phone:payment.phone,reference:payment.otpReference,otp,notify_url:notifyUrl()}});const saved=await saveInitiation(payment,raw);return saved.providerId&&saved.status==="pending"?await verifyPayment(saved.id).catch(()=>saved):saved;}catch(e){return savePaymentError(payment,e,true);}
}
async function settleInner(payment:Payment,status:string,data:Record<string,unknown>,demo=false){
  return db.transaction(async tx=>{
    const [order]=await tx.select().from(orders).where(eq(orders.id,payment.orderId)).for("update");const [current]=await tx.select().from(payments).where(eq(payments.id,payment.id)).for("update");
    if(current.creditedAt||current.status==="completed")return current;
    if (payment.providerId && current.providerId !== payment.providerId) throw new AppError("The payment transaction link changed during verification.",409);
    const nextStatus = status === "completed" ? "completed" : terminal.includes(current.status) ? current.status : status;
    if(nextStatus==="completed"){
      const [wallet]=await tx.select().from(users).where(eq(users.id,current.userId)).for("update");
      if(!wallet||wallet.currency!==current.walletCurrency||wallet.isDemo!==current.isDemo||current.isDemo!==demo)throw new AppError("Payment and wallet identity do not match.",409);
      if(order.status==="completed")throw new AppError("This order was changed outside payment verification. Please reconcile it.",409);
      if(wallet.balance+current.walletAmount>MAX_BALANCE)throw new AppError("The wallet limit requires manual reconciliation.",409);
      await tx.update(users).set({balance:sql`${users.balance} + ${current.walletAmount}`}).where(eq(users.id,current.userId));
      await tx.update(orders).set({status:"completed",metadata:{...order.metadata,providerTransaction:current.providerId,verifiedAt:new Date().toISOString(),verification:demo?"local_sandbox":"ashtech_server"}}).where(eq(orders.id,order.id));
      await tx.insert(auditLogs).values({actorId:current.userId,action:demo?"payment.sandbox_credited":"payment.verified_credited",target:current.id,details:{amount:current.walletAmount,currency:current.walletCurrency,providerId:current.providerId},eventHash:`ashtech-credit:${current.id}`}).onConflictDoNothing();
    }else if(["failed","cancelled","expired"].includes(nextStatus))await tx.update(orders).set({status:"failed"}).where(eq(orders.id,order.id));
    const [updated]=await tx.update(payments).set({status:nextStatus,details:{...current.details,...instructions(data),...(nextStatus==="completed"?{warning:""}:{})},verifiedAt:demo?null:new Date(),creditedAt:nextStatus==="completed"?new Date():null,lastCheckedAt:new Date(),updatedAt:new Date()}).where(eq(payments.id,current.id)).returning();return updated;
  });
}
async function settle(payment:Payment,status:string,data:Record<string,unknown>,demo=false){
  const result=await settleInner(payment,status,data,demo);
  if(result.creditedAt&&!payment.creditedAt)await notifyUser(result.userId,{kind:"wallet",title:"Wallet topped up",body:`${formatMoney(result.walletAmount,result.walletCurrency)} was added to your wallet.`,url:"/wallet"});
  return result;
}
export async function verifyPayment(id:string,providerId?:string){
  const [payment]=await db.select().from(payments).where(eq(payments.id,id));if(!payment)throw new AppError("Payment not found.",404);
  if(payment.creditedAt||payment.isDemo)return payment;
  if(IS_DEMO)throw new AppError("Live payment verification is disabled in sandbox mode.",403);
  const transactionId=providerId||payment.providerId;if(!transactionId)throw new AppError("The provider transaction is not linked yet. Please contact support.",409);
  if(payment.providerId&&payment.providerId!==transactionId)throw new AppError("The transaction is already linked to another payment.",409);
  await db.update(payments).set({lastCheckedAt:new Date()}).where(eq(payments.id,id));
  const raw=await ashtechRequest(`/transaction/${encodeURIComponent(transactionId)}?user_id=${encodeURIComponent(merchantId())}`);const body=object(unwrapAshtech(raw));const data={...body,...(isSimulation(object(raw))?{simulation:true}:{})};
  let status:string;try{status=verifyTransactionFields({...payment,providerId:transactionId,merchantId:merchantId()},data);}catch(error){
    await db.update(payments).set({status:"reconciliation",details:{...payment.details,warning:"The verified provider details do not match this order. No credit was added; support must reconcile the payment."},lastCheckedAt:new Date(),updatedAt:new Date()}).where(and(eq(payments.id,payment.id),sql`${payments.creditedAt} IS NULL`));
    throw new AppError((error as Error).message,409);
  }
  if(!payment.providerId) {
    const claimed = await db.update(payments).set({providerId:transactionId}).where(and(eq(payments.id,id),sql`${payments.providerId} IS NULL`)).returning();
    if (!claimed.length) { const [linked] = await db.select().from(payments).where(eq(payments.id,id)); if (linked?.providerId !== transactionId) throw new AppError("A different transaction was already linked to this payment.",409); }
  }
  return settle({...payment,providerId:transactionId},status,data);
}
export async function simulatePayment(payment:Payment,status:"completed"|"failed"){
  if(!IS_DEMO||!payment.isDemo)throw new AppError("Payment simulation is disabled.",403);
  if(payment.status!=="pending"&&payment.status!=="completed")throw new AppError("Start this sandbox payment and finish any OTP step first.",409);
  return settle(payment,status,{},true);
}
export async function processPaymentEvent(id:string){
  const [event]=await db.select().from(paymentEvents).where(eq(paymentEvents.id,id));if(!event||event.status==="processed")return;
  try{
    await db.update(paymentEvents).set({attempts:sql`${paymentEvents.attempts}+1`}).where(eq(paymentEvents.id,id));
    const refs=[event.payload.reference,event.payload.merchant_reference].filter((v):v is string=>typeof v==="string"&&v.length>0);
    const clauses=[eq(payments.providerId,event.providerId),...refs.flatMap(r=>[eq(payments.merchantReference,r),eq(payments.providerReference,r),eq(payments.otpReference,r)])];
    const candidates=await db.select().from(payments).where(or(...clauses));if(candidates.length!==1)throw new AppError("Payment is not uniquely linked yet.",409);
    const payment=candidates[0];if(payment.isDemo)throw new AppError("A real webhook cannot settle a sandbox payment.",409);
    const verified = await verifyPayment(payment.id,event.providerId);
    if ((event.event === "payment.completed" || ["completed", "success"].includes(String(event.payload.status))) && verified.status !== "completed") throw new AppError("The provider has not confirmed the final payment status yet.", 409);
    await db.update(paymentEvents).set({status:"processed",error:null,processedAt:new Date()}).where(eq(paymentEvents.id,id));
  }catch(e){await db.update(paymentEvents).set({status:"retry",error:e instanceof AppError?e.message.slice(0,250):"Verification is temporarily unavailable."}).where(eq(paymentEvents.id,id));}
}
export async function reconcilePayments(){
  const events=await db.select().from(paymentEvents).where(inArray(paymentEvents.status,["received","retry"])).orderBy(paymentEvents.attempts,paymentEvents.createdAt).limit(5);await Promise.all(events.map(e=>processPaymentEvent(e.id)));
  const pending=await db.select().from(payments).where(and(eq(payments.isDemo,IS_DEMO),inArray(payments.status,["pending","reconciliation","confirming","creating"]))).orderBy(payments.lastCheckedAt).limit(5);
  if(!IS_DEMO)await Promise.all(pending.filter(p=>p.providerId).map(p=>verifyPayment(p.id).catch(()=>null)));
  return {events:events.length,checked:pending.length};
}
export async function listUserPayments(userId:string){return (await db.select().from(payments).where(eq(payments.userId,userId)).orderBy(desc(payments.createdAt)).limit(30)).map(publicPayment);}
