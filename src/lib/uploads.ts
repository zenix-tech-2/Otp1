import "server-only";
import {db} from "@/db";
import {uploadedFiles} from "@/db/schema";
import {eq} from "drizzle-orm";
import {storageClient} from "./storage";
import {AppError,IS_DEMO} from "./server";
import type {UploadKind} from "./upload-policy";
import {z} from "zod";
export type UploadRow=typeof uploadedFiles.$inferSelect;
export async function readyUpload(id:string,kind?:UploadKind){z.string().uuid().parse(id);const [row]=await db.select().from(uploadedFiles).where(eq(uploadedFiles.id,id));if(!row||row.status!=="ready"||(kind&&row.kind!==kind))throw new AppError("The file is missing or has not passed upload validation.",422);return row;}
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
