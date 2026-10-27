export type UploadKind = "image" | "delivery" | "news";
export type UploadMediaType = "image" | "video" | "audio" | "document";
export const MB = 1024 * 1024;
export const UPLOAD_LIMITS = { image: 10 * MB, delivery: 250 * MB, video: 150 * MB, audio: 50 * MB, document: 25 * MB, demo: 4_000_000 };
const formats: Record<string,{mime:string;type:UploadMediaType;aliases?:string[];deliveryOnly?:boolean}> = {
 png:{mime:"image/png",type:"image"},jpg:{mime:"image/jpeg",type:"image"},jpeg:{mime:"image/jpeg",type:"image"},webp:{mime:"image/webp",type:"image"},gif:{mime:"image/gif",type:"image"},
 mp4:{mime:"video/mp4",type:"video"},webm:{mime:"video/webm",type:"video"},mp3:{mime:"audio/mpeg",type:"audio",aliases:["audio/mp3"]},m4a:{mime:"audio/mp4",type:"audio",aliases:["audio/x-m4a"]},ogg:{mime:"audio/ogg",type:"audio",aliases:["application/ogg"]},wav:{mime:"audio/wav",type:"audio",aliases:["audio/x-wav"]},
 pdf:{mime:"application/pdf",type:"document"},txt:{mime:"text/plain",type:"document"},zip:{mime:"application/zip",type:"document",aliases:["application/x-zip-compressed"]},epub:{mime:"application/epub+zip",type:"document",deliveryOnly:true},
 apk:{mime:"application/vnd.android.package-archive",type:"document",aliases:["application/zip","application/x-zip-compressed"],deliveryOnly:true},aab:{mime:"application/octet-stream",type:"document",aliases:["application/zip"],deliveryOnly:true},
};
export const UPLOAD_ACCEPT = { image:".png,.jpg,.jpeg,.webp,.gif", delivery:".apk,.aab,.zip,.pdf,.epub,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.m4a,.ogg,.wav", news:".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mp3,.m4a,.ogg,.wav,.pdf,.txt,.zip" };
export function fileSize(bytes:number){if(bytes<1024)return `${bytes} B`;if(bytes<MB)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/MB).toFixed(bytes>=10*MB?0:1)} MB`;}
export function validateUpload(name:string,claimedType:string,size:number,kind:UploadKind){
 if(!["image","delivery","news"].includes(kind))throw new Error("Choose a valid upload destination.");
 if(!name||name.length>200||/[\u0000-\u001f\\/]/.test(name))throw new Error("Use a filename without paths or control characters.");
 const ext=name.split('.').pop()?.toLowerCase()||"";const format=formats[ext];
 if(!format || (format.deliveryOnly&&kind!=="delivery") || (kind==="image"&&format.type!=="image"))throw new Error(kind==="delivery"?"Unsupported file. Use APK, AAB, ZIP, PDF, EPUB, TXT, a supported image, video, or audio file.":"Unsupported media. Use an image, MP4/WebM video, audio, PDF, TXT, or ZIP.");
 const mime=claimedType.toLowerCase().split(';')[0].trim();if(mime&&mime!=="application/octet-stream"&&mime!==format.mime&&!format.aliases?.includes(mime))throw new Error("The file type does not match its extension.");
 const limit=kind==="delivery"?UPLOAD_LIMITS.delivery:format.type==="image"?UPLOAD_LIMITS.image:format.type==="video"?UPLOAD_LIMITS.video:format.type==="audio"?UPLOAD_LIMITS.audio:UPLOAD_LIMITS.document;
 if(!Number.isSafeInteger(size)||size<=0||size>limit)throw new Error(`Choose a non-empty file no larger than ${fileSize(limit)}.`);
 return {ext,mimeType:format.mime,mediaType:format.type,maxBytes:limit};
}
export function validateSignature(bytes:Uint8Array,ext:string){
 const starts=(signature:number[])=>signature.every((v,i)=>bytes[i]===v);const text=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 let valid=false;
 if(ext==="png")valid=starts([137,80,78,71,13,10,26,10]);
 else if(["jpg","jpeg"].includes(ext))valid=starts([255,216,255]);
 else if(ext==="webp")valid=text(0,4)==="RIFF"&&text(8,12)==="WEBP";
 else if(ext==="gif")valid=["GIF87a","GIF89a"].includes(text(0,6));
 else if(["zip","apk","aab","epub"].includes(ext))valid=starts([80,75,3,4])||starts([80,75,5,6])||starts([80,75,7,8]);
 else if(ext==="pdf")valid=text(0,5)==="%PDF-";
 else if(["mp4","m4a"].includes(ext))valid=text(4,8)==="ftyp";
 else if(ext==="webm")valid=starts([26,69,223,163]);
 else if(ext==="mp3")valid=text(0,3)==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224);
 else if(ext==="ogg")valid=text(0,4)==="OggS";
 else if(ext==="wav")valid=text(0,4)==="RIFF"&&text(8,12)==="WAVE";
 else if(ext==="txt")valid=!bytes.includes(0);
 if(!valid)throw new Error("The file contents do not match this format. Choose the original, valid file.");
}
export type UploadedAsset = { id:string;url:string;name:string;size:number;mimeType:string;mediaType:UploadMediaType;kind:UploadKind;storage:string };
export type UploadProgress = { percent:number;stage:"preparing"|"uploading"|"verifying" };
