import {requireAdmin} from "@/lib/auth";
import {apiError,AppError,limit,sameOrigin} from "@/lib/server";
import {prepareUpload,ownUpload,saveSmallUpload} from "@/lib/uploads";
export const maxDuration=60;
export async function POST(request:Request){try{sameOrigin(request);const admin=await requireAdmin();await limit(request,"admin-upload",40);if(request.headers.get("content-type")?.includes("application/json")){return Response.json(await prepareUpload(admin.id,await request.json()));}
 if(Number(request.headers.get("content-length")||0)>4_300_000)throw new AppError("Use the direct upload flow for files over 4 MB.",413);
 const form=await request.formData();const file=form.get("file");if(!(file instanceof File))throw new AppError("Choose a file.",422);if(file.size>4_000_000)throw new AppError("Use direct upload for larger files.",413);const kind=form.get("kind")||"image";const ticket=await prepareUpload(admin.id,{name:file.name,size:file.size,mimeType:file.type,kind});const row=await ownUpload(ticket.id,admin.id);return Response.json(await saveSmallUpload(row,Buffer.from(await file.arrayBuffer())));
}catch(e){return apiError(e);}}
