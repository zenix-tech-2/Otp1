import { requireUser } from "@/lib/auth";
import { getCryptoAssets, getPaymentCountries, paymentConfigured } from "@/lib/ashtech";
import { listUserPayments } from "@/lib/payments";
import { apiError, IS_DEMO } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){try{const user=await requireUser();const [catalog,assets,history]=await Promise.all([getPaymentCountries().catch(()=>({countries:[],source:"unavailable",available:false,message:"Payment countries are temporarily unavailable."})),getCryptoAssets().catch(()=>[]),listUserPayments(user.id)]);return Response.json({catalog,assets,payments:history,demo:IS_DEMO,connected:paymentConfigured(),currency:user.currency,countryCode:user.countryCode,countryName:user.countryName});}catch(e){return apiError(e);}}
