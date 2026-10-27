import "server-only";
import {db} from "@/db";
import {storeCategories} from "@/db/schema";
import {eq} from "drizzle-orm";
import {z} from "zod";
import {AppError} from "./server";
import {readyUpload} from "./uploads";
import {categoryColors,categoryIcons,categoryTemplates,reservedCategorySlugs} from "./categories";
const field=z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/).refine(k=>!["__proto__","constructor","prototype","delivery","deliveryMode"].includes(k),"This field key is reserved."),label:z.string().trim().min(1).max(80),placeholder:z.string().max(160)});
const schema=z.object({id:z.string().min(1).max(100).optional(),slug:z.string().trim().toLowerCase().min(2).max(70).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),name:z.string().trim().min(2).max(80),subtitle:z.string().trim().min(2).max(140),detail:z.string().trim().min(2).max(800),icon:z.string().refine(s=>categoryIcons.includes(s),"Choose a supported icon."),color:z.string().refine(s=>categoryColors.includes(s),"Choose a supported color."),imageUrl:z.string().max(1500000).refine(s=>!s||/^https:\/\//.test(s)||/^\/api\/media\/[a-f0-9-]{36}$/.test(s)||/^data:image\/(png|jpeg|webp);base64,/.test(s),"Use an HTTPS image or supported upload.").nullable().optional(),formType:z.string().refine(s=>categoryTemplates.some(t=>t.id===s),"Choose a product form template."),fields:z.array(field).max(16).refine(fields=>new Set(fields.map(f=>f.key)).size===fields.length,"Field keys must be unique."),position:z.number().int().min(0).max(9999),active:z.boolean()});
export async function saveCategory(input:unknown){const data=schema.parse(input);if(data.imageUrl?.startsWith("/api/media/"))await readyUpload(data.imageUrl.split("/").pop()!,"image");return db.transaction(async tx=>{
 const [existing]=data.id?await tx.select().from(storeCategories).where(eq(storeCategories.id,data.id)).for("update"):[];
 if(data.id&&!existing)throw new AppError("Category not found.",404);
 if(existing&&existing.slug!==data.slug)throw new AppError("Published category URLs are stable. Keep the existing slug.",409);
 if(!existing&&reservedCategorySlugs.includes(data.slug))throw new AppError("This URL is reserved. Choose another category slug.",422);
 const [duplicate]=await tx.select({id:storeCategories.id}).from(storeCategories).where(eq(storeCategories.slug,data.slug));if(duplicate&&duplicate.id!==existing?.id)throw new AppError("A category already uses this URL. Choose another slug.",409);
 const id=existing?.id||crypto.randomUUID();const value={...data,id,imageUrl:data.imageUrl||null,kind:existing?.kind||"products"};
 const [saved]=existing?await tx.update(storeCategories).set(value).where(eq(storeCategories.id,id)).returning():await tx.insert(storeCategories).values(value).returning();return saved;
});}
