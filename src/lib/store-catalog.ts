import "server-only";
import { db } from "@/db";
import { announcements, products, storeCategories } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ensureSeed, getSettings, IS_DEMO } from "./server";
export async function loadStoreCatalog() {
  await ensureSeed();
  const categories = await db.select().from(storeCategories).where(eq(storeCategories.active, true)).orderBy(asc(storeCategories.position), asc(storeCategories.name));
  const productCategoryIds = categories.filter(c => c.kind === "products").map(c => c.id);
  const [catalog, news, settings] = await Promise.all([
    productCategoryIds.length ? db.select().from(products).where(and(eq(products.active, true), inArray(products.category, productCategoryIds))).orderBy(products.createdAt) : [],
    db.select().from(announcements).where(eq(announcements.active, true)).orderBy(desc(announcements.createdAt)).limit(30), getSettings(),
  ]);
  return { categories, products: catalog.map(({ fulfillment: _private, ...product }) => product), announcements: news.map(post=>({...post,body:post.body.slice(0,400)})), settings, demo: IS_DEMO };
}
