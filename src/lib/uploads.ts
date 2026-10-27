import "server-only";
import {db} from "@/db";
import {uploadedFiles} from "@/db/schema";
import {and,eq} from "drizzle-orm";
import {storageClient} from "./storage";
import {AppError,IS_DEMO} from "./server";
import {UPLOAD_LIMITS,validateSignature,validateUpload,type UploadedAsset,type UploadKind,type UploadMediaType} from "./upload-policy";
import {z} from "zod";
export type UploadRow=typeof uploadedFiles.$inferSelect;
const prepareSchema=z.object({name:z.string().min(1).max(200),size:z.number().int().positive(),mimeType:z.string().max(150).default(""),kind:z.enum(["image","delivery","news"])});
export function uploadResult(row:UploadRow):UploadedAsset{return {id:row.id,url:row.kind==="delivery"?`upload:${row.id}`:`/api/media/${row.id}`,name:row.name,size:row.size,mimeType:row.mimeType,mediaType:row.mediaType as UploadMediaType,kind:row.kind as UploadKind,storage:row.backend};}
export function hasStorage(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);}
export async function prepareUpload(actorId:string,input:unknown){
 const data=prepareSchema.parse(input);let format:ReturnType<typeof validateUpload>;try{format=validateUpload(data.name,data.mimeType,data.size,data.kind);}catch(e){throw new AppError((e as Error).message,422);}
 const cloud=hasStorage();if(!cloud&&!IS_DEMO)throw new AppError("Connect Supabase Storage before uploading files.",503);
 if(!cloud&&data.size>UPLOAD_LIMITS.demo)throw new AppError("Sandbox uploads are limited to 4 MB. Connect Supabase Storage to enable direct product uploads up to 250 MB and videos up to 150 MB.",413);
 const id=crypto.randomUUID();const bucket=data.kind==="delivery"?"product-deliveries":data.kind==="news"?"news-media":"product-assets";const path=`${actorId}/${id}.${format.ext}`;
 let signedUrl:string|undefined;
 if(cloud){const {data:ticket,error}=await storageClient().storage.from(bucket).createSignedUploadUrl(path,{upsert:false});if(error||!ticket)throw new AppError("Storage is not ready for this upload. Apply the media/upload SQL and check bucket limits.",503);signedUrl=ticket.signedUrl;}
 await db.insert(uploadedFiles).values({id,actorId,kind:data.kind,mediaType:format.mediaType,name:data.name,mimeType:format.mimeType,size:data.size,backend:cloud?"supabase":"database",bucket,path,expiresAt:new Date(Date.now()+2*3600000)});
 return {id,transport:cloud?"supabase":"database",signedUrl,uploadUrl:cloud?undefined:`/api/admin/uploads/${id}/content`,contentType:format.mimeType,maxBytes:cloud?format.maxBytes:UPLOAD_LIMITS.demo};
}
export async function ownUpload(id:string,actorId:string){z.string().uuid().parse(id);const [row]=await db.select().from(uploadedFiles).where(and(eq(uploadedFiles.id,id),eq(uploadedFiles.actorId,actorId)));if(!row)throw new AppError("Upload not found.",404);return row;}
export async function saveSmallUpload(row:UploadRow,buffer:Buffer){
 if(row.status==="ready")return uploadResult(row);if(row.expiresAt.getTime()<Date.now())throw new AppError("This upload session expired. Choose the file again.",409);
 if(buffer.length!==row.size)throw new AppError("The uploaded file size does not match the selected file.",422);
 try{validateSignature(buffer.subarray(0,4096),row.path.split('.').pop()!);}catch(e){throw new AppError((e as Error).message,422);}
 if(row.backend==="database"){
  if(!IS_DEMO||buffer.length>UPLOAD_LIMITS.demo)throw new AppError("Local file uploads are available only for small sandbox files.",403);
  const [updated]=await db.update(uploadedFiles).set({inlineBase64:buffer.toString('base64'),status:"ready"}).where(and(eq(uploadedFiles.id,row.id),eq(uploadedFiles.status,"pending"))).returning();return uploadResult(updated||row);
 }
 const {error}=await storageClient().storage.from(row.bucket).upload(row.path,buffer,{contentType:row.mimeType,upsert:false});if(error)throw new AppError("The file could not be stored. Please try again.",502);return finishUpload(row);
}
async function readPrefix(url:string){
 const response=await fetch(url,{headers:{Range:"bytes=0-4095"},signal:AbortSignal.timeout(15000),cache:"no-store"});
 if(!response.ok||!response.body)throw new AppError("Unable to validate the stored file. Retry verification.",502);
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(size<4096){const {done,value}=await reader.read();if(done)break;if(value){const take=value.subarray(0,4096-size);chunks.push(take);size+=take.length;}}}finally{await reader.cancel().catch(()=>{});}return Buffer.concat(chunks.map(c=>Buffer.from(c)));
}
export async function finishUpload(row:UploadRow){
 if(row.status==="ready")return uploadResult(row);if(row.status!=="pending")throw new AppError("This upload is no longer valid. Please choose the file again.",409);
 if(row.expiresAt.getTime()<Date.now())throw new AppError("The upload session expired. Please choose the file again.",409);
 if(row.backend!=="supabase")throw new AppError("Send the file contents before finishing this upload.",409);
 const storage=storageClient();const {data:info,error}=await storage.storage.from(row.bucket).info(row.path);if(error||!info)throw new AppError("The file has not finished uploading. Wait, then retry verification.",409);
 const metadata=info.metadata as Record<string,unknown>|undefined;const size=Number(info.size??metadata?.size);const mime=String(info.contentType??metadata?.mimetype??"").split(';')[0];
 let invalid="";
 if(size!==row.size)invalid="The stored size does not match the selected file.";else if(mime&&mime!==row.mimeType)invalid="The stored content type does not match this file.";
 const {data:signed,error:signError}=await storage.storage.from(row.bucket).createSignedUrl(row.path,60);if(signError||!signed)throw new AppError("Unable to inspect the upload. Retry verification.",502);
 if(!invalid){try{validateSignature(await readPrefix(signed.signedUrl),row.path.split('.').pop()!);}catch(e){if(e instanceof AppError)throw e;invalid=(e as Error).message;}}
 if(invalid){await storage.storage.from(row.bucket).remove([row.path]);await db.update(uploadedFiles).set({status:"rejected"}).where(eq(uploadedFiles.id,row.id));throw new AppError(invalid,422);}
 const [updated]=await db.update(uploadedFiles).set({status:"ready"}).where(eq(uploadedFiles.id,row.id)).returning();return uploadResult(updated);
}
export async function readyUpload(id:string,kind?:UploadKind){z.string().uuid().parse(id);const [row]=await db.select().from(uploadedFiles).where(eq(uploadedFiles.id,id));if(!row||row.status!=="ready"||(kind&&row.kind!==kind))throw new AppError("The file is missing or has not passed upload validation.",422);return row;}
export async function validateDeliveryReference(reference:string|null|undefined){if(reference?.startsWith("upload:"))await readyUpload(reference.slice(7),"delivery");}
export async function attachmentResponse(row:UploadRow,request?:Request,attachment=true){
 if(row.status!=="ready")throw new AppError("File not available.",404);
 if(row.backend==="supabase"){
  const {data,error}=await storageClient().storage.from(row.bucket).createSignedUrl(row.path,300,attachment?{download:row.name}:undefined);if(error||!data)throw new AppError("File temporarily unavailable.",502);
  return new Response(null,{status:302,headers:{Location:data.signedUrl,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
 if(!IS_DEMO||!row.inlineBase64)throw new AppError("This file is not available in this environment.",404);
 const buffer=Buffer.from(row.inlineBase64,'base64');const headers:Record<string,string>={"Content-Type":row.mimeType,"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Accept-Ranges":"bytes","Content-Disposition":`${attachment?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`};
 const range=request?.headers.get("range");if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416,headers:{...headers,"Content-Range":`bytes */${buffer.length}`}});let start=m[1]?Number(m[1]):Math.max(0,buffer.length-Number(m[2]));let end=m[1]?(m[2]?Number(m[2]):buffer.length-1):buffer.length-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=buffer.length)return new Response(null,{status:416,headers:{...headers,"Content-Range":`bytes */${buffer.length}`}});end=Math.min(end,buffer.length-1);headers['Content-Range']=`bytes ${start}-${end}/${buffer.length}`;headers['Content-Length']=String(end-start+1);return new Response(new Uint8Array(buffer.subarray(start,end+1)),{status:206,headers});}
 headers['Content-Length']=String(buffer.length);return new Response(new Uint8Array(buffer),{headers});
}
