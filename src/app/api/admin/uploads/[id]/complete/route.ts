import {requireAdmin} from "@/lib/auth";
import {apiError,limit,sameOrigin} from "@/lib/server";
import {finishUpload,ownUpload} from "@/lib/uploads";
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const admin=await requireAdmin();await limit(request,"upload-complete",60);const {id}=await params;return Response.json(await finishUpload(await ownUpload(id,admin.id)));}catch(e){return apiError(e);}}
