import { requireUser } from "@/lib/auth";
import { createPaymentQuote } from "@/lib/payments";
import { apiError, limit, requireStoreOpen, sameOrigin } from "@/lib/server";
export async function POST(request:Request){try{sameOrigin(request);await limit(request,"payment-quotes",15);const user=await requireUser();await requireStoreOpen();return Response.json({quote:await createPaymentQuote(user,await request.json())});}catch(e){return apiError(e);}}
