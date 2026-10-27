import { loadStoreCatalog } from "@/lib/store-catalog";
import { apiError } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await loadStoreCatalog());}catch(e){return apiError(e);}}
