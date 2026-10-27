"use client";
import {validateUpload,type UploadedAsset,type UploadKind,type UploadProgress} from "./upload-policy";
async function json<T>(url:string,options:RequestInit):Promise<T>{const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.error||"Upload request failed.");return result;}
export async function uploadFile(file:File,kind:UploadKind,onProgress?:(progress:UploadProgress)=>void,signal?:AbortSignal):Promise<UploadedAsset>{
 validateUpload(file.name,file.type,file.size,kind);onProgress?.({percent:0,stage:"preparing"});
 const ticket=await json<{id:string;transport:string;signedUrl?:string;uploadUrl?:string;contentType:string}>("/api/admin/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,mimeType:file.type,size:file.size,kind}),signal});
 const result=await new Promise<UploadedAsset|null>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();const abort=()=>xhr.abort();if(signal?.aborted){reject(new Error("Upload cancelled."));return;}signal?.addEventListener("abort",abort,{once:true});
  xhr.open("PUT",ticket.transport==="supabase"?ticket.signedUrl!:ticket.uploadUrl!);xhr.setRequestHeader("Content-Type",ticket.contentType);if(ticket.transport==="supabase"){xhr.setRequestHeader("x-upsert","false");xhr.setRequestHeader("Cache-Control","max-age=3600");}xhr.timeout=30*60*1000;
  const cleanup=()=>signal?.removeEventListener("abort",abort);xhr.upload.onprogress=event=>onProgress?.({percent:event.lengthComputable?Math.min(99,Math.round(event.loaded/event.total*100)):0,stage:"uploading"});
  xhr.onload=()=>{cleanup();if(xhr.status>=200&&xhr.status<300){try{resolve(ticket.transport==="database"?JSON.parse(xhr.responseText):null);}catch{reject(new Error("The upload completed, but its response could not be read."));}}else{let message="Upload failed. Check the file size, storage bucket limits, and your connection.";try{const r=JSON.parse(xhr.responseText);message=r.error||r.message||message;}catch{}reject(new Error(message));}};
  xhr.onerror=()=>{cleanup();reject(new Error("The upload connection was interrupted. Your previous saved product is unchanged. Please retry."));};xhr.ontimeout=()=>{cleanup();reject(new Error("The upload timed out. Check your connection and retry."));};xhr.onabort=()=>{cleanup();reject(new Error("Upload cancelled."));};xhr.send(file);
 });
 if(result){onProgress?.({percent:100,stage:"verifying"});return result;}
 onProgress?.({percent:100,stage:"verifying"});return json<UploadedAsset>(`/api/admin/uploads/${ticket.id}/complete`,{method:"POST",signal});
}
