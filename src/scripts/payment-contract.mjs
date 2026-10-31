// No real provider calls. Run only against the disposable local PostgreSQL database.
// node --conditions=react-server --import dotenv/config --import tsx scripts/payment-contract.mjs
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
const url = new URL(process.env.DATABASE_URL || 'http://not-configured');
assert(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname === '/app_db', 'Contract tests refuse a non-local database.');
process.env.APP_MODE = 'live';
process.env.ASHTECH_API_KEY = 'ak_contract_test_only_not_a_real_key';
process.env.ASHTECH_USER_ID = 'contract-merchant';
process.env.ASHTECH_WEBHOOK_SECRET = 'whsec_contract_test_only';
process.env.APP_URL = 'https://contract-test.example';
process.env.STORE_FX_RATES = JSON.stringify({ XAF: 600, XOF: 600, GHS: 12 });
async function module(path) { const loaded = await import(path); return loaded.default || loaded; }
const currency = await module('../src/lib/currency.ts');
const verification = await module('../src/lib/payment-verification.ts');
const ashtech = await module('../src/lib/ashtech.ts');
const billing = await module('../src/lib/payments.ts');
const { db, pool } = await module('../src/db/index.ts');
const tables = await module('../src/db/schema.ts');
const originals = { fetch: globalThis.fetch };
const invoices = new Map(); const otpSessions = new Map(); const writes = []; const reads = [];
let scenario = 'push'; let instant = false;
const countries = [{ code:'CM',name:'Cameroun',currency:'XAF',operators:['MTN Money','Orange Money'],unavailable_operators:['Removed'] },{code:'TG',name:'Togo',currency:'XOF',operators:['Flooz (Moov)','Mixx By Yas']},{code:'GH',name:'Ghana',currency:'GHS',operators:['MTN Mobile Money']}];
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
function invoice(body, reference = body.reference){const id=randomUUID();const value={transaction_id:id,reference:`ASHPAY-${id}`,merchant_reference:reference,status:'pending',amount:body.amount,currency:body.currency,country_code:body.country_code||body.country,user_id:'contract-merchant',operator:body.operator};invoices.set(id,value);return value;}
globalThis.fetch = async (input, options={}) => {
 const url=new URL(String(input));const path=url.pathname;assert.equal(new Headers(options.headers).get('authorization'),'Bearer ak_contract_test_only_not_a_real_key');
 if(path.endsWith('/countries'))return response(countries);
 if(path.endsWith('/crypto/assets'))return response([{asset_code:'USDT.TRC20',network:'TRC20',name:'USDT',active:true},{asset_code:'USDT.DISABLED',network:'DISABLED',active:false}]);
 if(path.includes('/transaction/')){assert.equal(url.searchParams.get('user_id'),'contract-merchant');const id=decodeURIComponent(path.split('/').pop());reads.push(id);return invoices.has(id)?response(invoices.get(id)):response({error:'not_found'},404);}
 if(path.endsWith('/collect')){
  assert.equal(options.method,'POST');const body=JSON.parse(options.body);assert.equal(body.user_id,'contract-merchant');assert.equal(body.notify_url,'https://contract-test.example/api/webhooks/ashtechpay');writes.push({path,body});
  if(scenario==='timeout')throw new Error('Simulated network timeout');
  if(scenario==='provider-failure')return response({error:'invalid_phone'},400);
  if(scenario==='rate-limit')return response({error:'rate_limited'},429);
  if(path.includes('/crypto/')){assert(body.customer.email&&body.customer.firstName&&body.customer.lastName);const tx=invoice(body);return response({...tx,payment_method:'crypto',asset_code:body.asset_code,network:'TRC20',address:'CONTRACT_TEST_ADDRESS_NOT_FOR_PAYMENTS',memo:'CONTRACT_MEMO',memo_type:'tag',amount_usdt:body.amount,gross_amount_usdt:body.amount,fee_amount:0.25,credited_amount:Number(body.amount)-0.25,expires_at:new Date(Date.now()+900000).toISOString()},202);}
  if(scenario==='otp'){
   if(!body.otp){const ref=`OTP-${randomUUID()}`;otpSessions.set(ref,body);return response({error:'otp_required',reference:ref,ussd_code:'#CONTRACT#'},400);}
   const initial=otpSessions.get(body.reference);assert(initial,'OTP must resume the original returned session reference');for(const key of ['amount','currency','phone','operator','country_code'])assert.equal(body[key],initial[key]);
   if(body.otp!=='000000')return response({error:'invalid_otp'},400);
   return response(invoice(body,initial.reference),202);
  }
  const tx=invoice(body);
  if(scenario==='simulation')return response({...tx,status:'success',sandbox:true,simulation:true,wallet_credited_amount:0});
  if(scenario==='wave')return response({...tx,flow:'wave',wave_url:'https://wave.example/contract-approval'},202);
  return response({...tx,status:instant?'success':'pending'},instant?200:202);
 }
 throw new Error(`Unexpected network request blocked: ${url.origin}${path}`);
};
const userIds=[];const eventIds=[];
async function user(code='CM',currencyCode='XAF'){const [u]=await db.insert(tables.users).values({email:`contract-${randomUUID()}@example.test`,name:'Contract Test',countryCode:code,countryName:code==='OTHER'?'Other':'Cameroon',currency:currencyCode,isDemo:false,balance:0}).returning();userIds.push(u.id);return u;}
async function balance(user){return (await db.select().from(tables.users).where(eq(tables.users.id,user.id)))[0].balance;}
async function quoted(user,amount='1200'){const q=await billing.createPaymentQuote(user,{amount,method:'mobile_money',countryCode:'CM',operator:'MTN Money'});return billing.ownedPayment(q.id,user.id);}
async function started(user){return billing.startPayment(await quoted(user),user,{phone:'+237699999999'});}
try {
 assert.equal(currency.currencyDigits('XAF'),0);assert.equal(currency.majorToMinor('1000','XAF'),1000);assert.equal(currency.majorToMinor('10.50','USD'),1050);assert.throws(()=>currency.majorToMinor('10.5','XAF'));assert.throws(()=>currency.majorToMinor('-10','USD'));
 const q={currency:'XAF',usdRate:'600',asOf:'',source:'configured'};assert.equal(currency.fromUsd(599,q),3594);assert.equal(currency.toUsd(6000,q),1000);assert.equal(currency.convertMinor(1000,{...q,currency:'USD',usdRate:'1'},q),6000);
 const catalog=await ashtech.getPaymentCountries(true);assert.equal(catalog.countries.find(c=>c.code==='CM').name,'Cameroon');assert.deepEqual(catalog.countries.find(c=>c.code==='TG').operators,['Flooz (Moov)','Mixx By Yas']);assert.deepEqual(await ashtech.resolveSignupCountry('OTHER'),{countryCode:'OTHER',countryName:'Other',currency:'USD'});assert.equal((await ashtech.resolveSignupCountry('TG')).currency,'XOF');await assert.rejects(()=>ashtech.resolveSignupCountry('FR'));
 console.log('PASS exact currency precision, conversion rounding, live catalog normalization, and Other → USD');
 const native=await user();const initial=await quoted(native);const beforeWrites=writes.length;const [attemptA,attemptB]=await Promise.all([billing.startPayment(initial,native,{phone:'+237699999999'}),billing.startPayment(initial,native,{phone:'+237699999999'})]);assert.equal(writes.length-beforeWrites,1);const pay=await billing.ownedPayment(initial.id,native.id);assert.equal(pay.status,'pending');assert.equal(await balance(native),0);assert(pay.providerId);
 invoices.get(pay.providerId).status='success';await Promise.all([billing.verifyPayment(pay.id),billing.verifyPayment(pay.id)]);assert.equal(await balance(native),1200);await billing.verifyPayment(pay.id);assert.equal(await balance(native),1200);
 console.log('PASS pending creates no credit, one initiation under concurrency, exactly-once verified credit');
 instant=true;const immediate=await started(native);assert.equal(immediate.status,'pending');assert.equal(await balance(native),1200);instant=false;
 console.log('PASS initial success response cannot bypass server-side transaction verification');
 scenario='otp';let otp=await started(native);assert.equal(otp.status,'otp_required');assert(otp.otpReference);const noCredit=await balance(native);otp=await billing.confirmPaymentOtp(otp,'111111');assert.equal(otp.status,'otp_required');assert.equal(await balance(native),noCredit);otp=await billing.confirmPaymentOtp(otp,'000000');assert.equal(otp.status,'pending');assert(!JSON.stringify(otp.details).includes('"000000"'));assert(!Object.keys(otp.details).some(k=>/^otp$/i.test(k)));invoices.get(otp.providerId).status='completed';await billing.verifyPayment(otp.id);assert.equal(await balance(native),noCredit+1200);
 console.log('PASS returned OTP reference retained, invalid OTP retry, no OTP persistence, confirmed OTP settlement');
 scenario='wave';const wave=await started(native);assert.equal(wave.details.waveUrl,'https://wave.example/contract-approval');assert.equal(wave.status,'pending');assert.equal(ashtech.safeProviderUrl('javascript:alert(1)'),undefined);assert.equal(ashtech.safeProviderUrl('http://example.com'),undefined);
 console.log('PASS provider-issued Wave URL preserved without treating redirect as paid');
 scenario='timeout';const timeoutQuote=await quoted(native);const writesBefore=writes.length;const uncertain=await billing.startPayment(timeoutQuote,native,{phone:'+237699999999'});assert.equal(uncertain.status,'reconciliation');await billing.startPayment(timeoutQuote,native,{phone:'+237699999999'});assert.equal(writes.length-writesBefore,1);
 scenario='rate-limit';assert.equal((await started(native)).status,'reconciliation');scenario='provider-failure';assert.equal((await started(native)).status,'failed');
 console.log('PASS ambiguous timeout and rate-limit preservation, no duplicate payment creation, explicit rejection handling');
 scenario='simulation';const preSimulation=await balance(native);const sim=await started(native);assert.equal(sim.status,'simulation');assert.equal(await balance(native),preSimulation);
 scenario='push';const bad=await started(native);invoices.get(bad.providerId).status='success';invoices.get(bad.providerId).amount=1;await assert.rejects(()=>billing.verifyPayment(bad.id));assert.equal((await billing.ownedPayment(bad.id,native.id)).status,'reconciliation');assert.equal(await balance(native),preSimulation);
 const mismatch=await started(native);invoices.get(mismatch.providerId).status='completed';invoices.get(mismatch.providerId).currency='USD';await assert.rejects(()=>billing.verifyPayment(mismatch.id));assert.equal(await balance(native),preSimulation);
 console.log('PASS provider sandbox success blocked, wrong amount/currency quarantined without credit');
 const eventPay=await started(native);invoices.get(eventPay.providerId).status='completed';const eventId=`contract-${randomUUID()}`;eventIds.push(eventId);await db.insert(tables.paymentEvents).values({id:eventId,providerId:eventPay.providerId,event:'payment.completed',bodyHash:'contract',payload:{transaction_id:eventPay.providerId,merchant_reference:eventPay.merchantReference,status:'completed'}});const beforeEvent=await balance(native);await Promise.all([billing.processPaymentEvent(eventId),billing.processPaymentEvent(eventId)]);assert.equal(await balance(native),beforeEvent+1200);assert.equal((await db.select().from(tables.paymentEvents).where(eq(tables.paymentEvents.id,eventId)))[0].status,'processed');
 const timestamp=Math.floor(Date.now()/1000).toString();const raw=JSON.stringify({transaction_id:eventPay.providerId,status:'completed'});const secret='whsec_contract_only';const signature=`sha256=${createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex')}`;assert(verification.verifyAshtechSignature(raw,timestamp,signature,secret));assert(!verification.verifyAshtechSignature(raw+' ',timestamp,signature,secret));assert(!verification.verifyAshtechSignature(raw,timestamp,signature,'wrong'));assert(!verification.verifyAshtechSignature(raw,timestamp,signature,secret,Date.now()+301000));assert(!verification.verifyAshtechSignature(raw,timestamp,'sha256=short',secret));
 console.log('PASS durable webhook processing, concurrent delivery deduplication, HMAC tampering and replay rejection');
 const globalUser=await user('OTHER','USD');const cross=await billing.createPaymentQuote(globalUser,{amount:'10',method:'mobile_money',countryCode:'CM',operator:'MTN Money'});assert.equal(cross.amount,6000);assert.equal(cross.walletAmount,1000);assert.equal(cross.walletCurrency,'USD');assert.equal(cross.currency,'XAF');
 const cryptoQuote=await billing.createPaymentQuote(globalUser,{amount:'25',method:'crypto',countryCode:'US',assetCode:'USDT.TRC20'});let cryptoPay=await billing.ownedPayment(cryptoQuote.id,globalUser.id);await assert.rejects(()=>billing.startPayment(cryptoPay,globalUser,{firstName:'Ada'}));cryptoPay=await billing.startPayment(cryptoPay,globalUser,{firstName:'Ada',lastName:'Lovelace'});assert.equal(cryptoPay.details.memo,'CONTRACT_MEMO');assert.equal(cryptoPay.details.address,'CONTRACT_TEST_ADDRESS_NOT_FOR_PAYMENTS');assert.equal(cryptoPay.details.network,'TRC20');assert.equal(cryptoPay.status,'pending');invoices.get(cryptoPay.providerId).status='completed';await billing.verifyPayment(cryptoPay.id);assert.equal(await balance(globalUser),2500);
 const safe=billing.publicPayment(cryptoPay);assert(!('phone' in safe));assert(!('otpReference' in safe));assert(!('walletFx' in safe.details));
 console.log('PASS Other account stays USD, explicit local payment conversion, crypto network/memo and verified credit');
 console.log('ALL ASHTECH PAYMENT CONTRACT TESTS PASSED — no real HTTP payment was sent');
} finally {
 globalThis.fetch=originals.fetch;
 if(eventIds.length)await db.delete(tables.paymentEvents).where(inArray(tables.paymentEvents.id,eventIds));
 if(userIds.length){await db.delete(tables.auditLogs).where(inArray(tables.auditLogs.actorId,userIds));await db.delete(tables.payments).where(inArray(tables.payments.userId,userIds));await db.delete(tables.orders).where(inArray(tables.orders.userId,userIds));await db.delete(tables.users).where(inArray(tables.users.id,userIds));}
 await pool.end();
}
