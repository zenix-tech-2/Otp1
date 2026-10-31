import "server-only";
import {db} from "@/db";
import {announcements} from "@/db/schema";
import {and,desc,eq,ilike,ne,or,sql} from "drizzle-orm";
import {cache} from "react";
import {ensureSeed} from "./server";
export const getArticle=cache(async(slug:string)=>{await ensureSeed();if(slug.length>130)return null;const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(slug);const [post]=await db.select().from(announcements).where(and(eq(announcements.active,true),uuid?or(eq(announcements.id,slug),eq(announcements.slug,slug)):eq(announcements.slug,slug))).limit(1);return post||null;});
export async function listArticles(section:"news"|"updates",page=1,query=""){
 await ensureSeed();const where=and(eq(announcements.active,true),section==="news"?eq(announcements.kind,"news"):ne(announcements.kind,"news"),query?or(ilike(announcements.title,`%${query}%`),ilike(announcements.excerpt,`%${query}%`)):undefined);
 const [rows,[count]]=await Promise.all([db.select().from(announcements).where(where).orderBy(desc(announcements.createdAt)).limit(12).offset((page-1)*12),db.select({total:sql<number>`count(*)::int`}).from(announcements).where(where)]);
 return {posts:rows.map(p=>({...p,body:p.body.slice(0,240)})),total:count?.total||0,page,pageSize:12};
}
