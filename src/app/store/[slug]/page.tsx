import { db } from "@/db";
import { products, storeCategories } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import { StorePage } from "@/components/store-pages";
import { ensureSeed } from "@/lib/server";
import { categoryHref, normalizeCategorySlug, productHref } from "@/lib/categories";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {slug}=await params;const search=await searchParams;await ensureSeed();const normalized=normalizeCategorySlug(slug);
 const [category]=await db.select().from(storeCategories).where(or(eq(storeCategories.slug,normalized),eq(storeCategories.id,normalized))).limit(1);
 const query=new URLSearchParams();for(const key of ["q","sort"]){const v=search[key];if(typeof v==="string")query.set(key,v);}const suffix=query.size?`?${query}`:"";
 if(category){if(!category.active)notFound();if(category.slug!==slug||category.kind==="sms"||category.kind==="development")permanentRedirect(categoryHref(category)+suffix);return <StorePage categoryId={category.id} categorySlug={category.slug}/>;}
 // Keep old shared product URLs working, without confusing new category URLs.
 const [product]=await db.select({id:products.id}).from(products).where(and(eq(products.id,slug),eq(products.active,true))).limit(1);
 if(product)permanentRedirect(productHref(product.id)+suffix);
 notFound();
}
