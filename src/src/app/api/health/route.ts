import { db } from "@/db";
import { activations, announcements, auditLogs, inventoryItems, orders, paymentEvents, payments, products, rateLimits, sessions, settings, tickets, users, storeCategories, uploadedFiles } from "@/db/schema";
import { APP_ID, APP_RELEASE } from "@/lib/app-info";
import { ensureSeed } from "@/lib/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-StoreOTP-Release": APP_RELEASE };
  try {
    // LIMIT 0 verifies each application's table AND its current columns without
    // reading customer, payment, credential, or inventory records into the probe.
    // A bare `select 1` could succeed while the actual storefront was broken.
    await Promise.all([
      db.select().from(users).limit(0),
      db.select().from(sessions).limit(0),
      db.select().from(products).limit(0),
      db.select().from(orders).limit(0),
      db.select().from(inventoryItems).limit(0),
      db.select().from(activations).limit(0),
      db.select().from(payments).limit(0),
      db.select().from(paymentEvents).limit(0),
      db.select().from(settings).limit(0),
      db.select().from(announcements).limit(0),
      db.select().from(auditLogs).limit(0),
      db.select().from(tickets).limit(0),
      db.select().from(rateLimits).limit(0),
      db.select().from(storeCategories).limit(0),
      db.select({id:uploadedFiles.id,status:uploadedFiles.status,kind:uploadedFiles.kind}).from(uploadedFiles).limit(0),
    ]);
    await ensureSeed();
    return Response.json({ ok: true, app: APP_ID, release: APP_RELEASE, database: "ready", storefront: "/" }, { headers });
  } catch {
    // Fail the deployment healthcheck instead of approving a half-started app.
    return Response.json({ ok: false, app: APP_ID, release: APP_RELEASE, error: "The store database is not ready. Check the connection and apply the supplied schema migration." }, { status: 503, headers });
  }
}
