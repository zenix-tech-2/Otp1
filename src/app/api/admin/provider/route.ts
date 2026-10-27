import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError, AppError, audit, limit, sameOrigin } from "@/lib/server";
import { providerRequest } from "@/lib/numberotp";
import { providerOperations } from "@/lib/provider-operations";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const admin = await requireAdmin(); await limit(request, "provider-console", 30);
    const data = z.object({ operation: z.string(), resourceId: z.string().regex(/^[a-zA-Z0-9_-]*$/).max(120).optional(), query: z.record(z.string(), z.string()).optional(), body: z.record(z.string(), z.unknown()).optional(), confirmed: z.boolean().optional() }).parse(await request.json());
    const operation = providerOperations.find(o => o.id === data.operation); if (!operation) throw new AppError("Unknown provider operation.");
    if (operation.method !== "GET" && !data.confirmed) throw new AppError("Please confirm this provider operation before continuing.");
    if (operation.path.includes(":id") && !data.resourceId) throw new AppError("A resource ID is required.");
    let path = operation.path.replace(":id", data.resourceId || "");
    if (data.query) { const query = new URLSearchParams(); for (const [key,value] of Object.entries(data.query)) if (["service", "country", "page", "limit"].includes(key) && value) query.set(key, value); if (query.size) path += `?${query.toString()}`; }
    const result = await providerRequest(path, { method: operation.method, auth: operation.auth, body: operation.method === "GET" || operation.method === "DELETE" ? undefined : data.body || {}, wait: operation.id === "activation-wait" });
    await audit(admin.id, `provider.${operation.id}`, data.resourceId);
    return Response.json({ result });
  } catch(e) { return apiError(e); }
}
