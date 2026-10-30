import { db } from "@/db";
import { activations, announcements, auditLogs, inventoryItems, orders, payments, products, sessions, settings, tickets, users, storeCategories, devProjects, devRequests } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError, AppError, audit, getSettings, IS_DEMO, limit, sameOrigin } from "@/lib/server";
import { refundOrder } from "@/lib/billing";
import { publicPayment, verifyPayment } from "@/lib/payments";
import { paymentConfigured } from "@/lib/ashtech";
import { getCurrencyQuote } from "@/lib/fx";
import { toUsd } from "@/lib/currency";
import { saveCategory } from "@/lib/category-admin";
import {saveNews} from "@/lib/news";
import { addMessage, adminDeliver, adminNote, adminQuote, adminStatus, deleteDevProject, saveDevProject } from "@/lib/dev-service";
import {validateDeliveryReference,readyUpload} from "@/lib/uploads";
import { validateCourseDelivery, validateCountry, validateLinkDelivery, validateSlots } from "@/lib/delivery-server";
import { MAX_FULFILLMENT } from "@/lib/delivery";
import { after } from "next/server";
import { notifyAll, notifyUser } from "@/lib/notify";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const admin = await requireAdmin();
    const [catalog, customers, purchases, numbers, news, logs, support, config, paymentRows, categories, projects, requests] = await Promise.all([
      db.select().from(products).orderBy(desc(products.createdAt)),
      db.select({ id: users.id, name: users.name, email: users.email, role: users.role, balance: users.balance, currency: users.currency, countryCode: users.countryCode, countryName: users.countryName, suspended: users.suspended, isDemo: users.isDemo, createdAt: users.createdAt }).from(users).where(eq(users.isDemo, IS_DEMO)).orderBy(desc(users.createdAt)).limit(500),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500),
      db.select().from(activations).orderBy(desc(activations.createdAt)).limit(200),
      db.select().from(announcements).orderBy(desc(announcements.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
      db.select().from(tickets).orderBy(desc(tickets.createdAt)).limit(200), getSettings(), db.select().from(payments).where(eq(payments.isDemo, IS_DEMO)).orderBy(desc(payments.createdAt)).limit(500), db.select().from(storeCategories).orderBy(storeCategories.position,storeCategories.name),
      db.select().from(devProjects).orderBy(desc(devProjects.createdAt)).limit(300), db.select().from(devRequests).orderBy(desc(devRequests.createdAt)).limit(500),
    ]);
    return Response.json({ admin: { name: admin.name, role: admin.role }, products: catalog, categories, users: customers, orders: purchases, activations: numbers, announcements: news, devProjects: projects, devRequests: requests, audit: logs, tickets: support, settings: config, demo: IS_DEMO, connected: !IS_DEMO && !!process.env.NUMBEROTP_API_KEY, payments: paymentRows.map(publicPayment), paymentConnected: !IS_DEMO && paymentConfigured(), storageConnected: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY });
  } catch(e) { return apiError(e); }
}
const productSchema = z.object({ id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(), name: z.string().trim().min(2).max(120), category: z.string().min(1).max(100), brand: z.string().trim().min(1).max(50), description: z.string().trim().min(10).max(4000), price: z.number().int().min(1).max(10000000), comparePrice: z.number().int().nonnegative().nullable().optional(), stock: z.number().int().min(0).max(1000000), badge: z.string().max(30).nullable().optional(), imageUrl: z.string().max(1500000).refine(s => !s || /^https:\/\//.test(s) || /^\/api\/media\/[a-f0-9-]{36}$/.test(s) || /^data:image\/(png|jpeg|webp);base64,/.test(s), "Use an HTTPS image or a supported upload.").nullable().optional(), metadata: z.record(z.string().max(60), z.string().max(1000)), fulfillment: z.string().max(MAX_FULFILLMENT).nullable().optional(), active: z.boolean(), inventory: z.array(z.string().trim().min(1).max(5000)).max(1000).optional() });
export async function POST(request: Request) {
  try {
    sameOrigin(request); await limit(request, "admin", 60); const admin = await requireAdmin(); const input = await request.json(); const action = String(input.action || ""); let target = ""; let result: unknown = { success: true };
    if (action === "save-category") {
      const category = await saveCategory(input.category); target = category.id; result = { category };
    } else if (action === "save-product") {
      const { inventory, ...data } = productSchema.parse(input.product); const id = data.id || crypto.randomUUID(); target = id;
      if (data.comparePrice && data.comparePrice < data.price) throw new AppError("The compare-at price must be at least the selling price.");
      await validateDeliveryReference(data.fulfillment);
      if(data.imageUrl?.startsWith("/api/media/"))await readyUpload(data.imageUrl.split("/").pop()!,"image");
      const [category] = await db.select().from(storeCategories).where(eq(storeCategories.id, data.category));
      if (!category || category.kind !== "products" || (data.active && !category.active)) throw new AppError("Choose a published product category, or save the product as archived.", 422);
      // Each category form has its own rules: countries, structured stock slots, links and courses.
      let slotInventory = inventory;
      const mode = data.metadata.deliveryMode;
      if (category.formType === "proxies" || category.formType === "social") validateCountry(data.metadata);
      if (data.metadata.slotType === "proxy" || data.metadata.slotType === "account") {
        if (mode !== "inventory") throw new AppError("Stock slots need unique-delivery mode.", 422);
        slotInventory = validateSlots(data.metadata.slotType, inventory);
      }
      if (mode === "link") data.fulfillment = validateLinkDelivery(data.fulfillment);
      if (mode === "course") data.fulfillment = await validateCourseDelivery(data.fulfillment);
      const value = { ...data, id, fulfillment: data.fulfillment || null, imageUrl: data.imageUrl || null, badge: data.badge || null, comparePrice: data.comparePrice || null };
      const product = await db.transaction(async tx => {
        const [saved] = await tx.insert(products).values(value).onConflictDoUpdate({ target: products.id, set: value }).returning();
        if (data.metadata.deliveryMode === "inventory") {
          if (slotInventory?.length) await tx.insert(inventoryItems).values(slotInventory.map(payload => ({ productId: id, payload })));
          const available = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.productId, id), isNull(inventoryItems.orderId)));
          const [updated] = await tx.update(products).set({ stock: available.length, fulfillment: null }).where(eq(products.id, id)).returning();
          return updated;
        }
        return saved;
      });
      result = { product };
    } else if (action === "archive-product") {
      target = z.string().max(100).parse(input.id); await db.update(products).set({ active: false }).where(eq(products.id, target));
    } else if (action === "save-settings") {
      const data = z.object({ appName: z.string().trim().min(2).max(50), smsMarkup: z.number().min(0).max(1000), smmMarkup: z.number().min(0).max(1000).default(35), supportEmail: z.string().email(), maintenance: z.boolean(), allowRegistrations: z.boolean(), announcement: z.string().max(200), currency: z.literal("USD") }).parse(input.settings);
      await db.insert(settings).values({ key: "app", value: data }).onConflictDoUpdate({ target: settings.key, set: { value: data } }); target = "app";
    } else if (action === "update-user") {
      const data = z.object({ id: z.string().uuid(), suspended: z.boolean() }).parse(input); target = data.id;
      if (data.id === admin.id) throw new AppError("You cannot suspend your own account.");
      const [user] = await db.select().from(users).where(eq(users.id, data.id));
      if (!user || user.isDemo !== IS_DEMO || (admin.role !== "admin" && user.role === "admin")) throw new AppError("This account cannot be changed.", 403);
      await db.update(users).set({ suspended: data.suspended }).where(eq(users.id, data.id));
      if (data.suspended) await db.delete(sessions).where(eq(sessions.userId, data.id));
    } else if (action === "credit-user") {
      const data = z.object({ id: z.string().uuid(), amount: z.number().int().min(1).max(2000000000), currency: z.string().length(3).optional(), reason: z.string().trim().min(5).max(250), idempotencyKey: z.string().uuid() }).parse(input); target = data.id;
      const [targetUser] = await db.select().from(users).where(eq(users.id, data.id));
      if (!targetUser || targetUser.isDemo !== IS_DEMO) throw new AppError("User not found.", 404);
      if ((targetUser.currency !== "USD" && data.currency !== targetUser.currency) || (data.currency && data.currency !== targetUser.currency)) throw new AppError("Credit must use the customer’s account currency.", 422);
      const fx = await getCurrencyQuote(targetUser.currency); const baseAmount = toUsd(data.amount, fx);
      if (baseAmount > 1000000) throw new AppError("A single adjustment cannot exceed the equivalent of US$10,000.");
      await db.transaction(async tx => {
        const [user] = await tx.select().from(users).where(eq(users.id, data.id)).for("update");
        if (!user || user.isDemo !== IS_DEMO) throw new AppError("User not found.", 404);
        if (user.currency !== targetUser.currency || user.balance + data.amount > 2000000000) throw new AppError("This wallet adjustment needs reconciliation.", 409);
        const key = `admin:${data.idempotencyKey}`; const [existing] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key)); if (existing) return;
        await tx.update(users).set({ balance: sql`${users.balance} + ${data.amount}` }).where(eq(users.id, data.id));
        await tx.insert(orders).values({ userId: data.id, kind: "topup", title: "Administrator wallet credit", amount: data.amount, currency: targetUser.currency, baseAmount, status: "completed", idempotencyKey: key, metadata: { reason: data.reason, actor: admin.id, demo: IS_DEMO, fx } });
      });
    } else if (action === "approve-topup") {
      target = z.string().uuid().parse(input.id);
      await db.transaction(async tx => { const [order] = await tx.select().from(orders).where(eq(orders.id, target)).for("update"); if (!order || order.kind !== "topup" || order.status !== "pending") throw new AppError("This deposit is not awaiting approval.", 409); if (order.metadata.provider === "ashtechpay") throw new AppError("Ashtech Pay deposits require server-side provider verification, not manual approval.", 409); const [wallet] = await tx.select().from(users).where(eq(users.id, order.userId)).for("update"); if (!wallet || wallet.currency !== order.currency || wallet.balance + order.amount > 2000000000) throw new AppError("Deposit currency does not match the wallet.", 409); await tx.update(users).set({ balance: sql`${users.balance} + ${order.amount}` }).where(eq(users.id, order.userId)); await tx.update(orders).set({ status: "completed", metadata: { ...order.metadata, verifiedBy: admin.id, verifiedAt: new Date().toISOString() } }).where(eq(orders.id, target)); });
    } else if (action === "verify-payment") {
      const data = z.object({ id: z.string().uuid(), providerId: z.string().regex(/^[a-zA-Z0-9_-]{1,180}$/).optional() }).parse(input); target = data.id;
      const payment = await verifyPayment(data.id, data.providerId); result = { payment: publicPayment(payment) };
    } else if (action === "refund-order") {
      const data = z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(300) }).parse(input); target = data.id; result = { order: await refundOrder(data.id, data.reason, true) };
    } else if (action === "fulfill-order") {
      const data = z.object({ id: z.string().uuid(), fulfillment: z.string().trim().min(5).max(15000) }).parse(input); target = data.id; await validateDeliveryReference(data.fulfillment);
      const fulfilled = await db.transaction(async tx => { const [order] = await tx.select().from(orders).where(eq(orders.id, data.id)).for("update"); if (!order || order.kind !== "product" || order.status !== "processing") throw new AppError("This order cannot be fulfilled.", 409); await tx.update(orders).set({ status: "completed", metadata: { ...order.metadata, fulfillment: data.fulfillment, fulfilledBy: admin.id } }).where(eq(orders.id, data.id)); return order; }); await notifyUser(fulfilled.userId, { kind: "order", title: "Your order is ready", body: `${fulfilled.title} has been delivered.`, url: `/orders/${fulfilled.id}` });
    } else if (action === "reconcile-activation") {
      const data = z.object({ id: z.string().uuid(), providerId: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/), phone: z.string().min(5).max(40) }).parse(input); target = data.id;
      const [act] = await db.select().from(activations).where(eq(activations.id, data.id)); if (!act || act.status !== "reconciliation") throw new AppError("This activation does not need reconciliation.");
      await db.update(activations).set({ providerId: data.providerId, phone: data.phone, status: "waiting" }).where(eq(activations.id, data.id)); await db.update(orders).set({ status: "processing" }).where(eq(orders.id, act.orderId));
    } else if (action === "publish-news" || action === "save-news") {
      const isNew = action === "publish-news" ? !input.id : !input.post?.id; const news = await saveNews(action === "save-news" ? input.post : input); target = news.id; result = { announcement: news };
      if (news.active && isNew) after(() => notifyAll({ kind: "news", title: news.title, body: news.excerpt || news.body.slice(0, 160), url: `/${news.kind === "news" ? "news" : "updates"}/${news.slug}`, tag: `news-${news.id}` }));
    } else if (action === "archive-news") { target = z.string().uuid().parse(input.id); await db.update(announcements).set({ active: false }).where(eq(announcements.id, target));
    } else if (action === "reply-ticket") { const data = z.object({ id: z.string().uuid(), reply: z.string().trim().min(5).max(4000), status: z.enum(["open", "resolved"]) }).parse(input); target = data.id; const [replied] = await db.update(tickets).set({ reply: data.reply, status: data.status }).where(eq(tickets.id, data.id)).returning(); if (replied) after(() => notifyUser(replied.userId, { kind: "support", title: "Support replied", body: data.reply.slice(0, 140), url: "/support" }));
    } else if (action === "save-dev-project") { const project = await saveDevProject(input.project); target = project.id; result = { project };
    } else if (action === "delete-dev-project") { target = z.string().uuid().parse(input.id); await deleteDevProject(target);
    } else if (action === "dev-request-quote") { target = z.string().uuid().parse(input.id); result = { request: await adminQuote(target, { usd: input.usd, days: input.days, note: input.note ?? "" }) };
    } else if (action === "dev-request-status") { target = z.string().uuid().parse(input.id); result = { request: await adminStatus(target, String(input.status || "")) };
    } else if (action === "dev-request-deliver") { target = z.string().uuid().parse(input.id); result = { request: await adminDeliver(target, { links: input.links ?? [], note: input.note ?? "" }) };
    } else if (action === "dev-request-note") { target = z.string().uuid().parse(input.id); result = { request: await adminNote(target, input.note) };
    } else if (action === "dev-request-reply") { target = z.string().uuid().parse(input.id); result = { request: await addMessage(target, "admin", input.text) };
    } else { throw new AppError("Unknown administrator action."); }
    if (action.startsWith("dev-request-") && target) {
      const [req] = await db.select({ userId: devRequests.userId, title: devRequests.title }).from(devRequests).where(eq(devRequests.id, target));
      const text: Record<string, string> = { "dev-request-quote": "Your quote is ready", "dev-request-status": "Your request was updated", "dev-request-deliver": "Your project was delivered", "dev-request-reply": "New message on your request" };
      if (req && text[action]) after(() => notifyUser(req.userId, { kind: "order", title: text[action], body: req.title, url: `/build/requests/${target}` }));
    }
    await audit(admin.id, `admin.${action}`, target);
    return Response.json(result);
  } catch(e) { return apiError(e); }
}
