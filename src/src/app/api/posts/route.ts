import {z} from "zod";
import {apiError,limit} from "@/lib/server";
import {listArticles} from "@/lib/news";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{await limit(request,"public-posts",90);const q=new URL(request.url).searchParams;const data=z.object({section:z.enum(["news","updates"]).default("news"),page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(100).default("")}).parse(Object.fromEntries(q));return Response.json(await listArticles(data.section,data.page,data.q));}catch(e){return apiError(e);}}
