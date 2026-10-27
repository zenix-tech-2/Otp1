import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const helper=await import('./admin-fixture.ts');const {createAdminFixture}=helper.default||helper;
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
fs.mkdirSync('tests/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const request = context.request;
let originalSettings; let adminContext; let adminPage; let fixture;
async function json(path, options) {
  const response = await request.fetch(`${base}${path}`, options);
  const body = await response.json();
  if (!response.ok()) throw new Error(`${path} [${response.status()}]: ${JSON.stringify(body)}`);
  return body;
}
async function post(path, data) { return json(path, { method: 'POST', data }); }
async function admin(action,payload={}){const response=await adminContext.request.post(`${base}/api/admin`,{data:{action,...payload}});const data=await response.json();if(!response.ok())throw new Error(data.error||'Admin request failed');return data;}
async function noOverflow(label,target=page) { const dimensions = await target.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert(dimensions.scroll <= dimensions.width + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`); }
try {
  const health = await json('/api/health'); assert.equal(health.ok, true);
  await page.goto(base, { waitUntil: 'networkidle' });
  const session = await json('/api/auth'); assert.equal(session.demo, true, 'Refusing to run write tests against a live store.');
  await page.getByRole('heading', { level: 1, name: /Your digital needs/ }).waitFor();
  await noOverflow('Desktop home');
  await page.screenshot({ path: 'tests/screenshots/home-desktop.png', fullPage: true });
  const catalog = await json('/api/catalog'); assert(catalog.products.length >= 4); assert(!('fulfillment' in catalog.products[0]));
  const startBalance = (await json('/api/auth')).user.balance;
  const product = catalog.products.find(p => p.id === 'netflix-premium'); assert(product);
  const idempotencyKey = crypto.randomUUID();
  const purchase = { productId: product.id, expectedPrice: product.price, idempotencyKey };
  const [first, duplicate] = await Promise.all([post('/api/orders', purchase), post('/api/orders', purchase)]);
  assert.equal(first.order.id, duplicate.order.id, 'Checkout must be idempotent');
  assert.equal((await json('/api/auth')).user.balance, startBalance - product.price);
  const changed = await request.post(`${base}/api/orders`, { data: { productId: product.id, expectedPrice: product.price + 1, idempotencyKey: crypto.randomUUID() } }); assert.equal(changed.status(), 409);
  console.log('PASS catalog privacy, atomic checkout, idempotency, and price protection');

  await page.goto(`${base}/numbers`, { waitUntil: 'networkidle' });
  await page.locator('.sms-service-card').filter({ hasText: 'WhatsApp' }).click();
  await page.waitForURL(/service=wa/);
  await page.locator('.country-row').filter({ hasText: 'United States' }).click();
  await page.waitForURL(/country=187/);
  await page.locator('.checkbox-label input').check();
  await page.locator('.number-buy-button').click();
  await page.waitForURL(/activation=/);
  await page.locator('.phone-display').waitFor();
  const activationId = new URL(page.url()).searchParams.get('activation');
  await page.screenshot({ path: 'tests/screenshots/number-waiting.png', fullPage: true });
  await post(`/api/sms/activations/${activationId}`, { action: 'simulate' });
  await page.locator('.otp-code').waitFor({ timeout: 20000 });
  assert.equal((await page.locator('.otp-code').innerText()).replace(/\s/g, ''), '482910');
  console.log('PASS service → country → review → number → OTP browser journey');

  const countries = await json('/api/sms/catalog?service=wa'); const country = countries.countries.find(c => c.id === '16');
  const beforeSms = (await json('/api/auth')).user.balance;
  const second = await post('/api/sms/activations', { service: 'wa', country: country.id, countryName: country.name, expectedPrice: country.price, idempotencyKey: crypto.randomUUID() });
  await post(`/api/sms/activations/${second.activation.id}`, { action: 'cancel' });
  assert.equal((await json('/api/auth')).user.balance, beforeSms);
  const secondCancel = await request.post(`${base}/api/sms/activations/${second.activation.id}`, { data: { action: 'cancel' } }); assert.equal(secondCancel.status(), 409);
  assert.equal((await json('/api/auth')).user.balance, beforeSms);
  console.log('PASS number cancellation and exactly-once refund');

  assert.equal((await request.get(`${base}/api/admin`)).status(),403); fixture=await createAdminFixture(base);adminContext=await browser.newContext({viewport:{width:1440,height:1050}});await fixture.install(adminContext);adminPage=await adminContext.newPage();adminPage.on('pageerror',error=>errors.push(error.message));
  const state = await (await adminContext.request.get(`${base}/api/admin`)).json(); originalSettings = state.settings;
  const inventoryProduct = { name: 'Sandbox inventory check', category: 'digital', brand: 'notion', description: 'An automated sandbox test of one-use delivery inventory.', price: 125, comparePrice: null, stock: 2, badge: null, imageUrl: null, metadata: { deliveryMode: 'inventory', delivery: 'Instant delivery', format: 'License' }, fulfillment: null, active: true, inventory: ['PRIVATE-TEST-ITEM-A', 'PRIVATE-TEST-ITEM-B'] };
  const created = await admin('save-product', { product: inventoryProduct });
  const buyInventory = () => post('/api/orders', { productId: created.product.id, expectedPrice: 125, idempotencyKey: crypto.randomUUID() });
  const [one, two] = await Promise.all([buyInventory(), buyInventory()]);
  assert.notEqual(one.order.metadata.fulfillment, two.order.metadata.fulfillment);
  const out = await request.post(`${base}/api/orders`, { data: { productId: created.product.id, expectedPrice: 125, idempotencyKey: crypto.randomUUID() } }); assert.equal(out.status(), 409);
  const beforeRefund = (await json('/api/auth')).user.balance;
  await Promise.all([admin('refund-order', { id: one.order.id, reason: 'Automated sandbox refund check' }), admin('refund-order', { id: one.order.id, reason: 'Automated sandbox refund retry' })]);
  assert.equal((await json('/api/auth')).user.balance, beforeRefund + 125);
  await admin('archive-product', { id: created.product.id });
  console.log('PASS category product creation, unique stock allocation, stock exhaustion, and idempotent admin refund');

  await admin('save-settings', { settings: { ...originalSettings, smsMarkup: 35 } });
  assert.equal((await json('/api/sms/catalog?service=wa')).countries[0].price, Math.ceil(65 * 1.35));
  await admin('save-settings', { settings: { ...originalSettings, maintenance: true } });
  const paused = await request.post(`${base}/api/orders`, { data: { productId: product.id, expectedPrice: product.price, idempotencyKey: crypto.randomUUID() } }); assert.equal(paused.status(), 503);
  await admin('save-settings', { settings: originalSettings });
  const news = await admin('publish-news', { title: 'Sandbox notification check', body: 'This announcement verifies the live in-app news and notifications workflow.', kind: 'update' });
  assert((await json('/api/catalog')).announcements.some(n => n.id === news.announcement.id));
  await admin('archive-news', { id: news.announcement.id });
  const ticket = await post('/api/account', { action: 'support', subject: 'Sandbox support check', message: 'Checking that customers can get a helpful reply from the admin workspace.' });
  await admin('reply-ticket', { id: ticket.ticket.id, reply: 'This sandbox support flow is working. Thank you for checking!', status: 'resolved' });
  assert.equal((await json('/api/account')).tickets.find(t => t.id === ticket.ticket.id).status, 'resolved');
  console.log('PASS markup, maintenance control, announcements, and customer support replies');

  const other = await browser.newContext();
  const otherRequest = other.request;
  const registration = await otherRequest.post(`${base}/api/auth`, { data: { action: 'register', name: 'Sandbox Customer', countryCode: 'OTHER', email: `check-${crypto.randomUUID()}@example.com`, password: 'Only-a-sandbox-test-923!' } }); assert.equal(registration.status(), 200);
  assert.equal((await otherRequest.get(`${base}/api/admin`)).status(), 403);
  assert.equal((await otherRequest.get(`${base}/api/sms/activations/${activationId}`)).status(), 404);
  const foreignOrders = await (await otherRequest.get(`${base}/api/orders`)).json(); assert(!foreignOrders.orders.some(o => o.id === first.order.id));
  const csrf = await request.post(`${base}/api/admin`, { headers: { Origin: 'https://untrusted.example' }, data: { action: 'save-settings', settings: originalSettings } }); assert.equal(csrf.status(), 403);
  const provider = await adminContext.request.post(`${base}/api/admin/provider`, { data: { operation: 'profile-get' } }); assert.equal(provider.status(), 503);
  const changedProfile = await otherRequest.post(`${base}/api/account`, { data: { action: 'profile', name: 'Sandbox Security Check' } }); assert.equal(changedProfile.status(), 200);
  const changedPassword = await otherRequest.post(`${base}/api/auth`, { data: { action: 'password', currentPassword: 'Only-a-sandbox-test-923!', newPassword: 'A-new-sandbox-password-847!', confirmPassword: 'A-new-sandbox-password-847!' } }); assert.equal(changedPassword.status(), 200);
  assert.equal((await (await otherRequest.get(`${base}/api/auth`)).json()).user.name, 'Sandbox Security Check');
  await other.close();
  console.log('PASS admin authorization, activation ownership, private order isolation, CSRF, password rotation, and honest sandbox provider errors');

  await adminPage.goto(`${base}/admin`, { waitUntil: 'networkidle' });
  await adminPage.locator('.admin-stat-grid').waitFor();
  await noOverflow('Desktop admin',adminPage);
  await adminPage.screenshot({ path: 'tests/screenshots/admin-desktop.png', fullPage: true });
  await adminPage.getByRole('button', { name: 'Add product', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor();
  await adminPage.getByRole('button', { name: 'Residential Proxies', exact: true }).click();
  await adminPage.getByLabel('Bandwidth allowance', { exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Digital Products', exact: true }).click();
  await adminPage.getByLabel('File / product format', { exact: true }).waitFor();
  await adminPage.screenshot({ path: 'tests/screenshots/product-editor.png', fullPage: true });
  await adminPage.goBack();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  await adminPage.locator('.admin-global-search input').fill('Netflix');
  await adminPage.getByRole('heading', { name: 'Results for “Netflix”' }).waitFor();
  await adminPage.locator('.admin-global-search input').fill('');
  console.log('PASS admin rendering, categorized product fields, workspace search, and modal back navigation');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open navigation drawer' }).click();
  await page.getByRole('dialog', { name: 'Navigation menu' }).waitFor();
  await page.goBack();
  await page.getByRole('dialog', { name: 'Navigation menu' }).waitFor({ state: 'hidden' });
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await noOverflow('Mobile home');
  await page.screenshot({ path: 'tests/screenshots/home-mobile.png', fullPage: true });
  await page.goto(`${base}/store`, { waitUntil: 'networkidle' }); await noOverflow('Mobile store');
  await page.goto(`${base}/numbers`, { waitUntil: 'networkidle' }); await noOverflow('Mobile numbers');
  await page.screenshot({ path: 'tests/screenshots/numbers-mobile.png', fullPage: true });
  await adminPage.setViewportSize({width:390,height:844});await adminPage.goto(`${base}/admin`,{waitUntil:'networkidle'});await adminPage.locator('.admin-stat-grid').waitFor();await noOverflow('Mobile admin',adminPage);await adminPage.screenshot({path:'tests/screenshots/admin-mobile.png',fullPage:true});
  assert.deepEqual(errors, [], `Unexpected browser errors: ${errors.join('; ')}`);
  console.log('PASS responsive layouts, native back navigation, scroll restoration, and no browser runtime errors');
  console.log('ALL SMOKE TESTS PASSED');
} finally {
  if (originalSettings) { try { await admin('save-settings', { settings: originalSettings }); } catch (error) { console.error('Settings restore:', error.message); } }
  if(fixture)await fixture.cleanup();
  await browser.close();
}
