# Clean routes and expandable categories

## Customer navigation

Customer screens are ordinary Next.js pages, not modal overlays. Each can be opened directly, refreshed, bookmarked, and navigated using the browser or Android system Back button.

| Screen | URL |
| --- | --- |
| Account | `/account` |
| Profile and security | `/account/profile` |
| Notifications | `/notifications` |
| Wallet | `/wallet` |
| Saved payment | `/wallet/payments/{payment-id}` |
| Support | `/support` |
| Privacy and terms | `/terms` |
| Login / signup | `/login`, `/register` |
| Purchase history | `/orders` |
| Purchase receipt | `/orders/{order-id}` |
| Category directory | `/services` |
| All products | `/store` |
| Category | `/store/{category-slug}` |
| Product | `/store/product/{product-id}` |
| Checkout | `/store/product/{product-id}/checkout` |


### Existing links still work

- `/store?category=premium` → `/store/premium`
- `/store?category=proxies` → `/store/proxies`
- `/store?category=social` and `/store?category=socials` → `/store/socials`
- `/store/social` → `/store/socials`
- `/store/{old-product-id}` → `/store/product/{product-id}` if no category owns that slug.
- `?panel=account`, `?panel=notifications`, `?panel=wallet`, etc. redirect to full-page routes.
- Old `?checkout=1`, `?order=...`, and wallet `?payment=...` links redirect to the corresponding pages.

Search and sort options are preserved during category redirects and filter changes. Internal return URLs are validated to prevent external/open redirects. APIs and static assets are not rewritten by the compatibility proxy.

## Add future categories without changing code

- Category name and stable URL slug.
- Short card description and page introduction.
- Icon or uploaded image, card color, and display order.
- Publication status.
- Product form template, or a set of custom product fields.

Published categories automatically appear on the home page, category directory, drawer, store filters, and product editor. No specific category is required to be a permanent navigation tab.

The initial categories are defaults, not an allowlist. Product validation accepts database-managed category IDs rather than the previous fixed enum. Templates such as subscriptions, app licenses, digital goods, and general products can be reused across any number of categories. Custom fields allow entirely new product types.

Slugs are unique and immutable after creation to keep shared URLs stable. Reserved routes such as `product` cannot be used as category slugs. Existing default category IDs are preserved, so existing products remain attached correctly; the `social` ID has canonical slug `socials`.

Unpublishing a category hides it and its products from public discovery and blocks new checkout in that category. Previous orders and delivery information are preserved. Republish it to make its products available again.

## Supabase upgrade

- Fresh database: run the updated `supabase/schema.sql`.
- Existing installation with the Ashtech Pay schema: apply **`supabase/upgrade-categories.sql` once**, then deploy the updated app.
- Drizzle-managed schema: apply `drizzle/0002_fat_adam_warlock.sql` through your migration workflow, or use `npx drizzle-kit push` locally. Do not apply both the SQL upgrade and the equivalent Drizzle migration twice.

The upgrade adds `store_categories` with RLS and indexes. It does not modify user balances or delete products/orders. The application seeds the initial category records idempotently when starting.

## Tests

Run only against a disposable local sandbox database:

- `node --import dotenv/config --import tsx scripts/navigation-browser.mjs`
- `node --import dotenv/config --import tsx scripts/smoke.mjs`
- `node --import dotenv/config --import tsx scripts/payment-browser.mjs`


The read-only deployment check remains:

`PREVIEW_URL=https://YOUR_DEPLOYMENT node scripts/verify-preview.mjs`

## Media and installation routes
News is `/news`, app updates are `/updates`, and each post has a full page at `/news/{slug}` or `/updates/{slug}`. Both support published media attachments. Browser installation is `/install`; see MEDIA-PWA.md for PWA support and APK product uploads.
