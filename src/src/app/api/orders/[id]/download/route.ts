import {db} from "@/db";
import {orders} from "@/db/schema";
import {and,eq} from "drizzle-orm";
import {requireUser} from "@/lib/auth";
import {apiError,AppError} from "@/lib/server";
import {storageClient} from "@/lib/storage";
import {attachmentResponse,readyUpload} from "@/lib/uploads";
import {parseDelivery} from "@/lib/delivery";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireUser();const {id}=await params;const [order]=await db.select().from(orders).where(and(eq(orders.id,id),eq(orders.userId,user.id)));if(!order||order.status!=="completed")throw new AppError("Download not available.",403);const reference=order.metadata.fulfillment;
 if(typeof reference!=="string")throw new AppError("This purchase does not contain a download.",404);
 const delivery=parseDelivery(reference);
 if(delivery?.t==="course"){
  // Video courses: the buyer may only open lessons that are part of the curriculum they purchased.
  const url=new URL(request.url);const lessonId=url.searchParams.get("lesson")||"";
  const lesson=delivery.chapters.flatMap(c=>c.modules.flatMap(m=>m.lessons)).find(l=>l.source==="upload"&&l.ref===`upload:${lessonId}`);
  if(!lesson)throw new AppError("This lesson is not part of your purchase.",404);
  return attachmentResponse(await readyUpload(lessonId,"delivery"),request,url.searchParams.get("inline")!=="1");
 }
 if(delivery)throw new AppError("This purchase does not contain a file download.",404);
 if(reference.startsWith("upload:"))return attachmentResponse(await readyUpload(reference.slice(7),"delivery"),request,true);
 if(!reference.startsWith("supabase:"))throw new AppError("This purchase does not contain a download.",404);
 const {data,error}=await storageClient().storage.from("product-deliveries").createSignedUrl(reference.slice(9),60,{download:true});if(error||!data)throw new AppError("Download temporarily unavailable.",502);return new Response(null,{status:302,headers:{Location:data.signedUrl,"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e);}}
