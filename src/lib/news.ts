import "server-only";
import {db} from "@/db";
import {announcements} from "@/db/schema";
import {and,desc,eq,ilike,ne,or,sql} from "drizzle-orm";
import {cache} from "react";
import {z} from "zod";
import {AppError,ensureSeed} from "./server";
import {readyUpload,uploadResult} from "./uploads";
import type {ArticleMedia} from "./content-types";
const mediaInput=z.object({id:z.string().uuid(),alt:z.string().max(200).default(""),caption:z.string().max(500).default("")});
const postSchema=z.object({id:z.string().uuid().optional(),title:z.string().trim().min(3).max(160),excerpt:z.string().trim().max(240).default(""),body:z.string().trim().min(10).max(50000),kind:z.enum(["news","update","service","maintenance"]),active:z.boolean().default(true),coverId:z.string().uuid().nullable().default(null),media:z.array(mediaInput).max(12).default([])});
export async function saveNews(input:unknown){
 const data=postSchema.parse(input);if(new Set(data.media.map(m=>m.id)).size!==data.media.length)throw new AppError("An attachment can only be included once.",422);
 const media:ArticleMedia[]=await Promise.all(data.media.map(async m=>{const file=await readyUpload(m.id,"news");const a=uploadResult(file);return {id:a.id,type:a.mediaType,url:a.url,name:a.name,mimeType:a.mimeType,size:a.size,caption:m.caption,alt:m.alt};}));
 if(data.coverId&&!media.some(m=>m.id===data.coverId&&m.type==="image"))throw new AppError("Choose an uploaded image from this post as its cover.",422);
 const [existing]=data.id?await db.select().from(announcements).where(eq(announcements.id,data.id)):[];if(data.id&&!existing)throw new AppError("Post not found.",404);
 const id=existing?.id||crypto.randomUUID();const slug=existing?.slug||`${data.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'post'}-${id.slice(0,8)}`;
 const value={id,slug,title:data.title,excerpt:data.excerpt,body:data.body,kind:data.kind,active:data.active,coverId:data.coverId,media,updatedAt:new Date()};
 const [post]=existing?await db.update(announcements).set(value).where(eq(announcements.id,id)).returning():await db.insert(announcements).values(value).returning();return post;
}
export const getArticle=cache(async(slug:string)=>{await ensureSeed();if(slug.length>130)return null;const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(slug);const [post]=await db.select().from(announcements).where(and(eq(announcements.active,true),uuid?or(eq(announcements.id,slug),eq(announcements.slug,slug)):eq(announcements.slug,slug))).limit(1);return post||null;});
export async function listArticles(section:"news"|"updates",page=1,query=""){
 await ensureSeed();const where=and(eq(announcements.active,true),section==="news"?eq(announcements.kind,"news"):ne(announcements.kind,"news"),query?or(ilike(announcements.title,`%${query}%`),ilike(announcements.excerpt,`%${query}%`)):undefined);
 const [rows,[count]]=await Promise.all([db.select().from(announcements).where(where).orderBy(desc(announcements.createdAt)).limit(12).offset((page-1)*12),db.select({total:sql<number>`count(*)::int`}).from(announcements).where(where)]);
 return {posts:rows.map(p=>({...p,body:p.body.slice(0,240)})),total:count?.total||0,page,pageSize:12};
}
