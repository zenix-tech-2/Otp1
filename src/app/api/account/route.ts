import { db } from "@/db";
import { tickets, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notify";
import { apiError, AppError, limit, sameOrigin } from "@/lib/server";
export async function GET(){try{const user=await requireUser();return Response.json({tickets:await db.select().from(tickets).where(eq(tickets.userId,user.id)).orderBy(desc(tickets.createdAt))});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);await limit(request,"account-actions",15);const user=await requireUser();const input=await request.json();
 if(input.action==="topup")throw new AppError("Wallet funding now uses Ashtech Pay Direct API. Open your wallet to review and start a verified payment.",410);
 if(input.action==="support"){const data=z.object({subject:z.string().trim().min(3).max(120),message:z.string().trim().min(10).max(4000)}).parse(input);const [ticket]=await db.insert(tickets).values({userId:user.id,...data}).returning();after(()=>notifyAdmins({kind:"support",title:"New support ticket",body:`${user.name}: ${data.subject}`,url:"/admin?view=support"}));return Response.json({ticket,message:"Your message is with our team. You can track the reply in Support."});}
 if(input.action==="profile"){const {name}=z.object({name:z.string().trim().min(2).max(80)}).parse(input);await db.update(users).set({name}).where(eq(users.id,user.id));return Response.json({success:true});}
 throw new AppError("Unknown account action.");
}catch(e){return apiError(e);}}
