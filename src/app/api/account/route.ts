import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { apiError, AppError, limit, sameOrigin } from "@/lib/server";
export async function POST(request:Request){try{
 sameOrigin(request);await limit(request,"account-actions",15);const user=await requireUser();const input=await request.json();
 if(input.action==="topup")throw new AppError("Wallet funding now uses Ashtech Pay Direct API. Open your wallet to review and start a verified payment.",410);
 if(input.action==="profile"){const {name}=z.object({name:z.string().trim().min(2).max(80)}).parse(input);await db.update(users).set({name}).where(eq(users.id,user.id));return Response.json({success:true});}
 throw new AppError("Unknown account action.");
}catch(e){return apiError(e);}}
