# Store OTP

A complete English-language digital marketplace built with **Next.js App Router, React, TypeScript, PostgreSQL, and Drizzle ORM**, ready to host on **Vercel with Supabase PostgreSQL and Storage**.

The interface follows the supplied visual references: vivid blue verification artwork, pastel 3D service cards, recognizable platform logos, a purple promotional banner, product cards, a navigation drawer, and mobile bottom navigation. Original reference-inspired artwork and local logo/font assets are included.

## Portable downloads, browser installation & media

All configured brand icons are now embedded in the source and also saved under `public/brands/`; there are no runtime favicon/CDN requests. Run `node scripts/export-project.mjs` for a verified source ZIP including every bundled asset.

The app supports browser installation at **`/install`**, separate **`/news`** and **`/updates`** feeds with individual media-rich posts, and private **APK/product uploads up to 250 MB** through direct Supabase Storage upload. Storage plan/global limits also apply. See **[MEDIA-PWA.md](MEDIA-PWA.md)** for install requirements, file support, security, and the upgrade.

**Existing deployment:** apply `supabase/upgrade-media-uploads.sql` once after the earlier category upgrade.

## Navigation & growing your catalog


**Existing deployment:** apply `supabase/upgrade-categories.sql` once before deploying this update. See [NAVIGATION.md](NAVIGATION.md) for routes and redirects.

## What is included

### Customer storefront
- Responsive home page, all-service overview, searchable/filterable/sortable product store, and individual product pages.
- Price review, wallet checkout, stock checks, idempotent purchases, order receipts, private deliveries, and CSV purchase exports.
- Service → country → review → number → OTP journey, full number history, copy controls, countdown, status polling, long polling, and provider-confirmed non-delivery refunds.
- Rental quote requests with a real support inbox; no speculative rental payload is submitted.
- Ashtech Pay Direct API wallet funding (Mobile Money and USDT), country-based signup currencies, account registration/login, in-app notifications, app news, and customer support tickets/replies.
- Full-page customer screens and a history-aware navigation drawer. Browser and Android system Back navigate between real routes naturally.

## Boost (SMM services) — SMM v1 / SMM v2

Customers open **/boost** (or Services → Boost) and run a four-step flow: platform → category → service → link and quantity, paying from their wallet. They choose **SMM v1** or **SMM v2**; real provider names, keys and raw rates never reach the browser.

- Configure `SMM_V1_API_KEY` / `SMM_V2_API_KEY` (and optionally `SMM_V1_API_URL` / `SMM_V2_API_URL`) in your server environment. v1 = ExoSupplier, v2 = Peakerr. Both use the standard SMM-panel API (`key`, `action=services|add|status`).
- **Existing deployment:** apply `supabase/upgrade-smm.sql` once (or run `npx drizzle-kit push`). Fresh installs get the `smm_orders` table from `supabase/schema.sql`.
- Wallet is debited when the order is placed. Cancelled orders are refunded in full; partially delivered orders are refunded for the undelivered share. If the provider can't be reached, the order goes to "Being checked" instead of being refunded or retried automatically.
- Order status is refreshed when customers open /boost and by `/api/cron/reconcile`.
- In sandbox mode (`APP_MODE=demo`) a sample catalog and simulated progress are used; no provider is contacted.

## 1. Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`, or keep the development sandbox's existing `.env`. Never overwrite working secrets blindly.
3. Start PostgreSQL and set `DATABASE_URL`.
4. Apply the schema with `npx drizzle-kit push`.
5. Run `npm run dev` and open `http://localhost:3000`.

The supplied development environment already has PostgreSQL. All database access goes through Drizzle and the `db` export in `src/db/index.ts`.

### Sandbox versus live

`APP_MODE=demo` is a **clearly labeled sandbox**, not a live provider simulation passed off as real:
- Creates a session-specific preview account with $25 of fictional credit.
- Seeds sample listings and app news, but no real accounts or subscriptions.
- Uses a curated set of example services/countries/prices.
- Allocates fictional US 202-555-01xx numbers; a clearly labeled sample OTP appears after approximately 18 seconds while polling.
- Supports demo number cancellation and test wallet top-ups; no real money is collected.
- Blocks all actual NumberOTP console operations, even if a key was inadvertently supplied.


## 2. Supabase setup

### Database
1. Create a new Supabase project.
2. In **SQL Editor**, run **`supabase/schema.sql` once on the fresh project**. It creates all fifteen application tables, indexes, foreign keys, enables RLS, and creates the storage buckets.
3. Copy the **transaction pooler** PostgreSQL URI (usually port 6543) from Supabase's Connect panel into `DATABASE_URL` for Vercel. URL-encode special characters in the password. Include the recommended TLS option such as `sslmode=require`.
4. Use a **direct connection or session pooler on port 5432** as `DIRECT_DATABASE_URL` for schema migration commands. `drizzle.config.ts` prefers this variable for migration work.

Alternatively, use Drizzle migrations to create the tables. Do not then rerun the `CREATE TABLE` section of the fresh-install SQL against existing tables. Apply the RLS and storage section separately if using Drizzle instead of the Supabase SQL installer. Future schema changes can be generated with `npx drizzle-kit generate` and applied through your normal migration review process.

### Security model
- This app intentionally uses **server-side Drizzle with its own password/session authentication**, not the Supabase Auth UI. Supabase hosts the PostgreSQL database and storage.
- RLS is enabled with **no anonymous or Supabase-authenticated application-table policies**. Browser clients cannot read account tables, delivery inventory, or orders through the Supabase REST API.
- The privileged server-side database connection accesses the tables. Session, ownership, suspension, and role checks in route handlers are the application authorization boundary.
- No `NEXT_PUBLIC_DATABASE_URL` or public service-role key is used.
- Database password rotation, backups, point-in-time recovery, and least-privilege database-role provisioning remain deployment responsibilities.

### Storage
Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the **server environment only**.
- `product-deliveries`: private customer files, including APK. Downloads require ownership of a completed order; new Storage downloads receive a five-minute signed URL (legacy links use 60 seconds).
- Signed direct uploads bypass Vercel’s function body limit: products up to 250 MB, images 10 MB, news video 150 MB, audio 50 MB, and attachments 25 MB. Supabase plan/global limits apply; see MEDIA-PWA.md.
- Without Storage configured, sandbox files up to 4 MB are actually stored in the preview database and served with the same publication/ownership checks. Live uploads require Supabase Storage.

## 4. NumberOTP configuration

Official references used:
- https://www.numberotp.com/docs/api
- https://www.numberotp.com/docs/reseller
- https://www.numberotp.com/docs/reseller/white-label

Set `APP_MODE=live` and `NUMBEROTP_API_KEY`. The documented default base URL is **`https://api.numberotp.com/v1`**. Account operations send `Authorization: Bearer <key>` from the server. Public catalog endpoints require no key.

The live storefront loads the provider's **complete returned service and country catalog**, including stock and current prices. It handles the documented/observed nested response shapes (`data.services`, country objects with English `eng` names, and country/service-keyed price data). Logos are locally included for popular platforms; known additional brands use checked-in, embedded icon files. Unmapped services get an honest generic phone icon, not a fabricated logo.

### Price integrity and activation lifecycle
- Catalog/provider base prices remain integer USD cents. Wallets, orders, and refunds use integer minor units of each account’s assigned currency (XAF/XOF have zero decimal places). USD retail SMS prices are marked up first, then converted to the customer’s currency.
- A fresh provider quote is checked on purchase. A changed price returns a conflict and requires a new review. The provider request includes a `max_price` cost cap.
- Wallet funds are reserved transactionally before provisioning. Repeated requests with the same customer/idempotency key return the original order rather than charging twice.
- Provider-confirmed provisioning rejection is refunded. Ambiguous timeouts are marked `reconciliation`, not automatically retried.
- OTP data is scoped to the signed-in owner. Browser polling runs approximately every five seconds while waiting; manual long-polling supports the documented 55-second wait.
- Countdown uses provider `expires_at` or `expiresAt`; `NUMBEROTP_ACTIVATION_MINUTES` is a display fallback when neither is returned. **A client-side timer reaching zero never independently authorizes a refund.**

### Webhooks
Set both the NumberOTP global webhook and reseller webhook URL to:

`https://YOUR_DOMAIN/api/webhooks/numberotp`

Configure the matching server secrets:
- `NUMBEROTP_WEBHOOK_SECRET` for `x-numberotp-signature`.
- `NUMBEROTP_RESELLER_WEBHOOK_SECRET` for `x-numberotp-reseller-signature`.

Signatures are HMAC-SHA256 over the **raw request body**, compared in constant time. Payload hashes deduplicate events. OTP delivery updates the owned activation and order. Supported reseller events are `sub_user.created`, `sub_user.topup`, and `sub_user.purchase`.

The handler returns a retriable conflict for an activation that arrives before its provider ID has been linked locally. Audit records do not include OTP message contents or provider keys.

## 5. Products, delivery, and payments

### Categorized product forms
- Social media: platform, account/product type, region, included items.
- Residential proxies: bandwidth, protocols, region, IP rotation.
- Premium apps: app plan, duration, device allowance, region.
- Accounts/subscriptions: tier, duration, renewal policy, region.
- Digital goods: format, license, version, requirements.

Only sell accounts, licenses, software, and content you are authorized to distribute. The sample brands are illustrative and do not imply affiliation.

### Unique inventory
For account credentials or individual licenses, choose **Unique credentials or license per purchase**. Enter one private delivery item per line. Each row is assigned to at most one order inside the same transaction as the stock decrement and wallet debit. Adding items preserves existing unsold inventory. Stock is automatically counted. Refunded delivered credentials are not automatically returned to inventory.

Shared instructions are intentionally shared across buyers: do not put a single-use password there. Manual delivery remains available for products that need personal fulfillment.

### Customer funding — Ashtech Pay Direct API

Customer wallet funding now uses **Ashtech Pay Direct API**, not Hosted Checkout and not the former manual-reference deposit flow. Detailed setup and behavior are in **[ASHTECHPAY.md](ASHTECHPAY.md)**.

- Country choices at signup come from authenticated `GET /v1/countries` (active deposit countries). The server assigns the returned ISO currency; it never trusts a browser-supplied currency.
- **Other / country not listed → USD ($)**. This option remains available when the provider catalog is unavailable. The UI does not pretend an unavailable catalog is an empty active-country list.
- Country/currency are fixed on the account to protect existing balances. Existing accounts and orders migrate safely to **Other / USD**, without changing numeric balances.
- Mobile Money supports provider-returned USSD Push, Wave, OTP SMS, and OTP USSD flows. Operators and OTP dialing codes are not hardcoded in live mode.
- USDT uses the active `/v1/crypto/assets` catalog, actual payer first/last name and email, exact returned network/address/memo, and provider expiry. USD accounts can pay USDT or explicitly quote a supported Mobile Money currency; the account itself stays USD.
- The store covers Ashtech Pay processing fees. Network/operator charges outside the store may still apply. The full payable amount and wallet credit are shown before initiation.
- Only a server-reloaded, matching confirmed transaction credits the wallet. Browser redirects, pending responses, screenshots, and provider sandbox responses are not proof of payment.
- Signed, timestamp-checked webhooks are durably recorded and deduplicated. The same credit cannot be applied twice. Timeouts stay in reconciliation rather than launching a second collection.

## 6. Vercel deployment

1. Push this project to your Git provider and import it into Vercel. Framework preset: **Next.js**.
3. Apply the Supabase schema before the first application request. Production does not silently create application tables.
4. Configure Storage credentials and buckets if you want uploads/downloads.
5. Set `CRON_SECRET` to a random value of at least 16 characters. Vercel automatically sends it as a Bearer token to the reconciliation route.
6. Deploy. The build command is `npm run build`.
8. Add your custom domain in Vercel. A custom app domain is separate from the provider's optional hosted white-label domain settings.

`vercel.json` includes a **daily** reconciliation job compatible with Vercel Hobby's cron limits. It removes expired sessions/rate-limit windows and reconciles expired waiting activations in bounded batches. Interactive polling and OTP webhooks provide normal fast updates. For a commercial store, configure a more frequent schedule on a plan that supports it and monitor outstanding reservations; a daily Hobby job alone is not an immediate background-refund or payment-reconciliation SLA. The job also drains queued Ashtech Pay events and checks pending payment transactions. No cron retry guarantee is assumed.

## 7. Environment reference

See `.env.example` for annotated values. No real keys are included.

| Variable | Purpose |
| --- | --- |
| `APP_MODE` | `demo` or `live` |
| `DATABASE_URL` | Runtime PostgreSQL/Supabase pooled connection |
| `DIRECT_DATABASE_URL` | Optional direct/session migration connection |
| `NUMBEROTP_BASE_URL` | Optional override of documented API base |
| `NUMBEROTP_API_KEY` | Server-side account/reseller Bearer key |
| `NUMBEROTP_WEBHOOK_SECRET` | Activation webhook HMAC secret |
| `NUMBEROTP_RESELLER_WEBHOOK_SECRET` | Reseller webhook HMAC secret |
| `NUMBEROTP_SUBUSER_API_KEY` | Optional console sub-user checkout key |
| `NUMBEROTP_ACTIVATION_MINUTES` | Display-only expiry fallback |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side Storage access |
| `ASHTECH_API_KEY` | Server-side `ak_...` Direct API key |
| `ASHTECH_USER_ID` | Ashtech Pay merchant profile ID matching the key |
| `ASHTECH_WEBHOOK_SECRET` | `whsec_...` signed payment webhook secret |
| `ASHTECH_BASE_URL` | Default `https://www.ashtechpay.com/v1` |
| `APP_URL` | Public HTTPS app origin for payment callbacks |
| `STORE_FX_RATES` | Optional JSON merchant rates: currency units per 1 USD |
| `CRON_SECRET` | Authenticates scheduled reconciliation |

`.env` is ignored by Git. Set production values through Vercel, not a committed file. No secrets are used in `NEXT_PUBLIC_*` variables.

## 8. Validation and tests

Production validation:
1. `npx next typegen`
2. `npm exec tsc -- --noEmit --pretty false`
3. `npm run build`
4. Start the production application through your hosting/runtime process and confirm `/api/health`. It now verifies all application tables and columns and returns `app: "store-otp"`; a database ping alone is not accepted as application readiness.

The original browser smoke test is `scripts/smoke.mjs`. Country/payment browser tests are in `scripts/payment-browser.mjs`; mocked Direct API contract tests are in `scripts/payment-contract.mjs` (commands in ASHTECHPAY.md). It requires a running **sandbox** app and Chromium (`npx playwright install chromium`). Run `PREVIEW_URL=http://localhost:3000 node --import dotenv/config --import tsx scripts/smoke.mjs` against a disposable sandbox database. The test intentionally creates sandbox purchases, support records, and archived test listings, and restores modified store settings. It must never be pointed at a real-money production store.

Screenshots and test artifacts are ignored by Git.

## Project map

- `src/app/`: App Router pages, styles, and route handlers.
- `src/db/schema.ts`: Typed Drizzle schema; `src/db/index.ts`: PostgreSQL pool.
- `src/lib/numberotp.ts`: Server-only provider transport and response normalization.
- `src/lib/provider-operations.ts`: Documented API operation allowlist.
- `src/lib/auth.ts`: Scrypt passwords, hashed sessions, role checks.
- `src/lib/billing.ts`: Idempotent refund and activation state transitions.
- `src/lib/storage.ts`: Server-only Supabase Storage client.
- `supabase/schema.sql`: Fresh-project SQL, RLS, and Storage buckets.
- `supabase/upgrade-categories.sql`: Additive category-management upgrade; preserves existing products and orders.
- `supabase/upgrade-ashtechpay.sql`: Additive upgrade for the previous app schema; existing USD balances are preserved.
- `src/lib/payments.ts`, `ashtech.ts`, `payment-verification.ts`: Direct API collection, verification, and idempotent wallet settlement.
- `src/lib/currency.ts`, `fx.ts`: Currency-specific precision and server-side price conversion.
- `drizzle/`: Generated SQL migration and schema metadata.
- `public/images/`, `public/brands/`, `public/fonts/`, `public/icons/`: Included artwork, brand/install icons, and typography.
- `src/lib/brand-assets.ts`: Embedded copies of all configured brand logos.
- `supabase/upgrade-media-uploads.sql`: Non-destructive media/upload upgrade.
- `public/sw.js`, `public/offline.html`, `src/app/manifest.ts`: Browser installation and safe static-asset/offline support.

## Operational notes

Monitor audit entries, reconciliation orders, provider credit balances, support requests, cron failures, database retention, and webhook delivery. Database transactions prevent duplicate credits/refunds; distributed request throttling uses database-backed windows. For a high-volume live marketplace, add a dedicated queue runner, configurable retention cleanup, email verification/password recovery, observability, and business-specific compliance policies before scaling. News notifications here are **in-app**, not an unconfigured email or push integration.

## Long-term number rentals

The **Long-term rentals** tab on `/numbers` rents real numbers from NumberOTP (`POST /rentals`) instead of sending a quote request.

- Flow: service → country → duration (2h, 4h, 12h, 1–30 days) → review → rent. Prices come from `/public/rent-prices` with your SMS markup applied, and are re-checked before the wallet is charged.
- The wallet is debited first, then the rental is requested with an idempotency key. If the provider refuses, the order is refunded automatically. If the provider's answer is unclear, the rental is saved as `reconciliation` and the wallet debit is kept for manual review.
- Messages are read from `GET /rentals/{id}` while the rental page is open, and stored with the rental. Rentals are paid for time, so they are not refunded when they expire.
- Database: run `supabase/upgrade-rentals.sql` once on an existing database (a fresh install of `supabase/schema.sql` already includes the `rentals` table).
- Needs `APP_MODE=live`, `NUMBEROTP_API_KEY`, and enough provider balance. In sandbox mode the same flow runs with a fictional number and sample messages.

## Websites & Bots (custom development service)

A new **Websites & Bots** category (`/build`) lets customers order custom development and lets you show your portfolio.

- **Order forms:** 10 project types (website, web app, online store, Telegram bot, WhatsApp bot, Discord bot, mobile app, API/backend, fix/redesign, other). Each has its own multi-step brief with choice fields (chips and dropdowns) and free-text fields. The definitions live in `src/lib/dev-forms.ts` and are validated on the server too. Edit that file to add or change questions.
- **Customer flow:** brief, quote, accept and pay from the wallet, chat, receive delivery, approve. Pages: `/build`, `/build/portfolio`, `/build/order/[type]`, `/build/requests`.
- **Database:** run `supabase/upgrade-dev-service.sql` once on an existing database (a fresh install of `supabase/schema.sql` already includes the tables). The category is added automatically on first load.
- Payment happens only when the customer accepts a quote. Paid projects appear under **Projects** in the customer's purchases.

## Store OTP AI assistant (Groq)

**Live chat:** the Support screen is a real conversation with the store team (instant sending, replies arrive on their own and as push notifications). Run `supabase/upgrade-support-chat.sql` once on an existing database.

A floating **Ask AI** button opens a chat that helps customers find products, virtual number services and prices, start a website or bot brief, check their wallet and orders, and send a support ticket to your team.

- **Setup:** add `GROQ_API_KEY` (server-side only) in your hosting environment variables and redeploy. With no key the assistant switches itself off politely and points customers to Support. No database changes are needed.
- **Models:** `openai/gpt-oss-120b` for chat and tools, `qwen/qwen3.8-27b` when a screenshot is attached. Groq retires models regularly, so override them with `GROQ_MODEL` and `GROQ_VISION_MODEL` if a model is shut down.
- **Safety:** the assistant only reads public catalog data and the signed-in customer's own account. It never sees private delivery content, cannot spend money or change accounts, and customers confirm every purchase themselves. Chats are rate-limited per visitor.
- Chat history stays on the customer's device for 24 hours and is not stored on the server.

## Notifications, dark theme, coupons, gifting

**Database:** run `npx drizzle-kit push`, or `supabase/upgrade-engagement.sql` once on an existing database (fresh installs: `supabase/schema.sql` already has it). The SQL also adds an "Account age" field to your existing social categories.

Web push (alerts when the app is closed) needs a key pair: run `npm run vapid`, put the three `VAPID_*` values in your environment variables and redeploy. Without keys the inbox still works and the "Turn on push" card stays hidden. On iPhone, push only works after the app is added to the Home Screen.

**Dark theme.** A sun/moon button in the header toggles it; Account → Appearance offers Light / Dark / Auto. The dark colours are generated from your CSS by `npm run dark` (writes `src/app/dark.generated.css`): re-run it whenever you change colours in a `.css` file. Hand-made exceptions go in `src/app/dark.css`.


**Gifting.** On checkout, "Send this as a gift" takes the recipient's account email (they must already have an account), shows "Sending to Jane D." for confirmation, and delivers to the recipient's own purchases with a notification. The buyer pays; refunding the buyer's order cancels an undelivered gift. Gifts work for every store product (including subscriptions, premium apps and social accounts). Boost and SMS numbers can't be gifted because they are tied to a link or phone number the buyer controls.

**Account age.** Social categories get an "Account age" field (e.g. `2 years`) in the product editor; it shows as a badge on cards and the product sheet, and adds an "Oldest accounts first" sort.

**Animations** are in `src/app/motion.css` and are switched off automatically for people who prefer reduced motion.

## Temp mail (`/mail`)
Customers open disposable inboxes at `/mail` and pick a version ("Mail V1"…); the real service behind each version is never shown.
1. Run `supabase/upgrade-tempmail.sql` once.
2. Set `TEMPMAIL_PROVIDERS`, `GRABMAIL_API_KEY` and `DROPMAIL_TOKEN` (see `.env.example`; local values are in the git-ignored `.env.local`). In Vercel, add the same names under Settings → Environment Variables. Keys stay server-side.
3. Versions: v1 GrabMail · v2 smails · v3 MailboxTemp · v4 mail.tm (its terms require a visible credit, which the page shows, and forbid proxying/reselling) · v5 DropMail · v6 NenzMail (not built yet).
Adapters live in `src/lib/tempmail.ts`; adding a service means adding one adapter object there.

## Gifting numbers
`/gift` has a Products / Numbers switch. Numbers can be one-time codes or rentals. The buyer pays and is refunded if the number never delivers; the recipient owns the number (shown in My numbers) and the buyer never sees its phone number or codes. Run `supabase/upgrade-number-gifts.sql` once BEFORE deploying (it adds gift columns to `activations` and `rentals`).

## Temp numbers (`/temp-numbers`)
Free, public, receive-only numbers. Customers pick "Number V1" (OnlineSim), a country and a number, then read its messages live. Nothing is stored per customer, so there is no migration. Responses are cached briefly in memory to protect the upstream rate limits. More versions plug in as adapters in `src/lib/tempnumbers.ts`.
