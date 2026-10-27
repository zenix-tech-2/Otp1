import {db} from "@/db";
import {announcements,uploadedFiles} from "@/db/schema";
import {and,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {getUser} from "@/lib/auth";
import {attachmentResponse} from "@/lib/uploads";
import {apiError,AppError} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;z.string().uuid().parse(id);const [file]=await db.select().from(uploadedFiles).where(eq(uploadedFiles.id,id));if(!file||file.status!=="ready"||file.kind==="delivery")throw new AppError("Media not available.",404);
 if(file.kind==="news"){const user=await getUser(false);if(user?.role!=="admin"){const [post]=await db.select({id:announcements.id}).from(announcements).where(and(eq(announcements.active,true),sql`${announcements.media} @> ${JSON.stringify([{id}])}::jsonb`)).limit(1);if(!post)throw new AppError("Media not available.",404);}}
 return attachmentResponse(file,request,file.mediaType==="document");}catch(e){return apiError(e);}}
