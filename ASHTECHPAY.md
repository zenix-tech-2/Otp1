# Ashtech Pay Direct API + account currencies

This integration uses the **Direct API** documented at https://doc.ashtechpay.com. It does not use the `hp_live_...` Hosted Checkout product.

## Required production configuration

Configure these **server-side** variables in Vercel; never place secrets in `NEXT_PUBLIC_*` variables or paste them into client code:

| Variable | Value |
| --- | --- |
| `APP_MODE` | `live` for actual payments; `demo` for the isolated preview |
| `ASHTECH_API_KEY` | Your **`ak_...` Direct API key** |
| `ASHTECH_USER_ID` | The merchant profile ID that owns that key, not an Digisms Pro customer ID |
| `ASHTECH_WEBHOOK_SECRET` | Your `whsec_...` secret from Ashtech Pay → API Key → Direct API → Webhook Secret |
| `ASHTECH_BASE_URL` | `https://www.ashtechpay.com/v1` (the default) |
| `APP_URL` | Your stable public HTTPS app origin, for example `https://store.example.com` |
| `CRON_SECRET` | Random value of at least 16 characters for background reconciliation |
| `STORE_FX_RATES` | Optional JSON object of merchant rates in currency units per 1 USD |

Your Ashtech Pay account needs KYC approval and Direct API access enabled. A key alone cannot bypass those requirements.

The server sends `notify_url = APP_URL + /api/webhooks/ashtechpay` on collection requests. This must be publicly reachable over HTTPS. Do not put localhost or private network destinations in production settings. Merchant key, user ID, and callback URL are never supplied by the browser.

### Database upgrade

- **Fresh Supabase project:** run the updated `supabase/schema.sql` once. It includes all tables, currency columns, payment event storage, RLS, and Storage buckets.
- **Existing previous-version deployment:** back up the database, then run `supabase/upgrade-ashtechpay.sql` once. Do not rerun the fresh-install script against existing tables.
- **Drizzle-managed upgrade:** use the generated additive migration `drizzle/0001_rapid_valkyrie.sql` through your migration workflow, or `npx drizzle-kit push` during local development. Apply RLS to `payments` and `payment_events` if not using the Supabase SQL script.
- Do not apply both the migration and the equivalent upgrade SQL twice.

Existing accounts receive `country_code=OTHER`, `country_name=Other`, `currency=USD`. Existing balances and order amounts stay unchanged: **there is no silent FX revaluation of existing money**.

## Country and currency assignment

1. Signup loads the active **deposit** catalog using authenticated `GET /v1/countries`.
2. The UI uses each returned `code` and `currency`. Country names are displayed in English, while operator names are preserved exactly as returned.
3. The user explicitly selects a country. The server checks that it is still in the provider catalog and assigns its currency.
4. **Other / country not listed always assigns USD ($)**. If the catalog is temporarily unavailable, the UI explains the failure and allows retry or an explicit Other choice.
5. Clients cannot override currency by sending a different `currency` field. Country/currency are read-only in Profile & security once the account exists.
6. The country of a purchased SMS number is separate from the user's billing country.

There is **no hardcoded live country/operator list**. Without configured provider credentials, `APP_MODE=demo` uses a clearly labeled small preview fixture based on documented examples. Those fixtures are never a fallback for a live store.

## Currency accounting and price conversion

- Catalog prices and NumberOTP provider costs remain **USD cents**.
- An account wallet is held in its own currency's **integer minor units**. XAF/XOF use whole francs; USD/GHS/NGN/KES use their normal ISO decimal precision.
- Local product/SMS prices are rounded up to one minor unit using deterministic integer arithmetic.
- Checkout compares the client-reviewed local amount with a server-computed amount; changed price/rate/currency returns a conflict requiring review.
- Each order stores its charged `amount`, `currency`, and `base_amount` (USD cents for admin reporting). Receipts, exports, wallet adjustments, and refunds use the recorded currency.
- Administrative sales totals sum USD equivalents, not mixed XAF/USD/NGN amounts.

### Exchange-rate source

In live mode, if a currency is not supplied in `STORE_FX_RATES`, the app fetches `https://open.er-api.com/v6/latest/USD`, caches it for one hour, and rejects missing or more-than-72-hour-old rate data. The free endpoint updates daily. A discreet **Rates by ExchangeRate-API** link is shown when those rates are used, as required by its documentation.

`STORE_FX_RATES` lets you set explicit merchant rates without assuming Ashtech Pay offers a generic USD FX-rate endpoint. Ashtech Pay's wallet-conversion endpoints are **not** called to invent display rates or move merchant funds automatically.

A USDT payment uses the explicit store conversion **1 USDT = 1 USD of base-price value**. The reviewed payable USDT amount and native-wallet amount are shown before confirmation. This is a store quoting policy, not a promise about external USDT market prices or banking settlement. Sandbox FX rates are fixed, labeled test values and are never used for live accounts.

If FX is unavailable, the native wallet balance remains valid. Purchases needing conversion are blocked rather than charging a mislabeled USD amount.

## Payment flow

### 1. Quote

`POST /api/payments/quote`:
- Reads the signed-in customer's currency.
- Validates amount precision and a current equivalent limit of US$1–US$1,000.
- Reloads the active provider country/operator or crypto-asset catalog.
- Creates a persisted quote/order/payment with a server-generated, stable `smsw_...` merchant reference.
- Locks the payable amount and wallet credit for ten minutes.
- Does **not** call a collection endpoint, debit a wallet, or add credit.

For a supported-country account, Mobile Money uses that account's exact country/currency. An Other/USD user may explicitly choose a supported payment country where they own a Mobile Money wallet. The payment amount is quoted in that country's currency; the account remains USD.

### 2. Direct collection

`POST /api/payments/{id}` with action `start` runs at most one initiation per saved payment. A database lock protects concurrent clicks. Parameters come from the persisted quote and the validated payer information, not client-supplied prices or merchant credentials.

**Mobile Money** uses `POST /v1/collect` with:
- Merchant `user_id`.
- Positive major-unit `amount`, exact ISO `currency`, `country_code`.
- Exact active `operator`, international `phone`.
- Stable `reference` and server-owned HTTPS `notify_url`.

Provider responses determine the next step:
- **USSD Push:** show a waiting screen; approve on the phone. Never enter a Mobile Money PIN in the store.
- **Wave:** open the returned HTTPS `wave_url`. A return from Wave does not credit funds.
- **OTP SMS / USSD:** treat HTTP `400 otp_required` as an action-needed state. Show the returned `ussd_code` where present. Re-submit exactly the original amount, currency, country, operator, and phone with the returned OTP session reference, not a new merchant reference.
- Invalid OTP leaves the session retryable. `otp_expired` ends that attempt; an ambiguous confirmation is not resent blindly.
- OTP values are not stored in payment records, audit entries, or browser persistence.

**Crypto** uses the active `GET /v1/crypto/assets` catalog and `POST /v1/crypto/collect`:
- USDT asset/network codes must be returned by the provider.
- Actual payer first name, last name, and account email are required. No names are invented.
- For Other/USD accounts, the payer enters their actual ISO country code for payment compliance; this does not change the account currency.
- The UI preserves the exact provider address, network, amount, memo/tag, and expiry. Memo/tag is separate from the address.
- A creation that returns pending without an address remains saved and is checked for its address; it is not recreated with a new reference.
- Crypto addresses are temporary. The provider documents a 15-minute pending expiry. The UI timer is informational; only provider status decides settlement.
- The UI currently offers exact address/memo copying, not an invented network QR encoding.

### 3. Verified credit

Credit requires a server-side `GET /v1/transaction/{id}?user_id=MERCHANT_ID` response with:
- The expected provider transaction ID.
- A matching merchant/provider/OTP-session reference associated with the saved payment.
- The exact currency and major amount corresponding to the saved integer-minor quote.
- Matching merchant/country where returned.
- Final `success` or `completed` status.
- No `sandbox`, `simulation`, or `sandbox_test` marker.

The provider's initial success response is **not** enough. The browser cannot submit a status to settle a real payment. The transaction is reloaded from Ashtech Pay.

Settlement locks the order, payment, and wallet. It updates the payment's `credited_at`, order completion, wallet balance, and unique audit event together. Duplicate callbacks, repeated polling, and concurrent workers can only credit the amount once.

The **store absorbs Ashtech Pay processing fees**: wallet credit is the agreed gross native-wallet amount, not the merchant's net `credited_amount`. The provider's returned fee is stored separately. Operator and blockchain/network fees outside the store may still apply and are disclosed before collection. There are no invented fee percentages in the live UI.

### Failure, uncertainty, and reconciliation

- Explicit provider failures/cancellations/expiry add no wallet credit.
- Network timeouts, 5xx, and ambiguous conflicts stay in reconciliation. The original reference is retained; the app does not create another charge blindly.
- Missing/mismatched verified details are quarantined; no credit is issued.
- Admin → Purchases → an Ashtech Pay order includes provider details and **Verify with Ashtech Pay**. An ambiguous request with no transaction ID can be linked to the actual ID from the provider dashboard, but all reference/amount/currency checks still apply.
- A pending Ashtech payment cannot be credited by the old manual deposit-approval action.
- `POST /api/account` with `action=topup` returns `410`; the old client-triggered top-up path is removed.

## Signed webhooks

Endpoint: `/api/webhooks/ashtechpay`

Required headers:
- `X-Ashtech-Event-Id`
- `X-Ashtech-Timestamp` (Unix seconds)
- `X-Ashtech-Signature: sha256=...`

Verification: **HMAC-SHA256(secret, timestamp + "." + raw_body)**. Verification is performed before JSON processing, using a constant-time comparison and a five-minute timestamp tolerance.

Verified events are durably inserted into `payment_events` before a `202` acknowledgement. A Next.js `after()` task reloads the provider transaction and processes the event; failed verification remains retryable in the database. Replay/event IDs are deduplicated. Minimal signed accounting fields and a payload hash are retained, not OTPs or full phone numbers.

The daily Vercel-compatible reconciliation route also drains queued payment events and checks outstanding transactions. Configure a more frequent scheduler on a suitable Vercel plan for commercial transaction volume. A daily Hobby schedule is not a real-time fallback SLA; monitor retry/reconciliation records. No background task is allowed to credit solely from unverified webhook payload fields.

## Sandbox behavior

`APP_MODE=demo` never posts a real Ashtech Pay collection, even if a key is present. It provides clearly labeled local phone/OTP/Wave/crypto previews. A sandbox OTP is `000000`. Buttons explicitly say **Simulate confirmed payment** or **Simulate failed payment**. Crypto preview generates no real transfer address.

Ashtech Pay's documented simulated test numbers return `sandbox: true` / `simulation: true`, do not move merchant money, and do not deliver real webhooks. This implementation rejects such provider responses as proof for real-wallet credit, even if they say `status: success`.

## Tests

Always use the disposable local demo database, never a real-money database.

1. Mocked provider contract + accounting tests (all outgoing provider fetches are intercepted):
   `node --conditions=react-server --import dotenv/config --import tsx scripts/payment-contract.mjs`
2. Signup, native currency, payment OTP, duplicate-credit, USD fallback, mobile layout, and authorization browser tests against a running sandbox app:
   `PREVIEW_URL=http://127.0.0.1:3000 node --import dotenv/config --import tsx scripts/payment-browser.mjs`
3. Existing storefront/admin regression suite:
   `PREVIEW_URL=http://127.0.0.1:3000 node --import dotenv/config --import tsx scripts/smoke.mjs`

The mocked tests never send a real payment request. Browser tests create sandbox accounts and records. Screenshots are saved under ignored `tests/screenshots/`.

Live merchant behavior must be verified with your own activated Ashtech Pay account before accepting real customers. No real API key or live charge is included in this project.

## Official references

- https://doc.ashtechpay.com/docs/authentication
- https://doc.ashtechpay.com/docs/reference/countries
- https://doc.ashtechpay.com/docs/direct-api/mobile-money
- https://doc.ashtechpay.com/docs/direct-api/payment-flows
- https://doc.ashtechpay.com/docs/direct-api/crypto
- https://doc.ashtechpay.com/docs/reference/transaction
- https://doc.ashtechpay.com/docs/direct-api/webhooks
- https://doc.ashtechpay.com/docs/sandbox
- https://www.exchangerate-api.com/docs/free

## Navigation update
Wallet and payments are full pages at `/wallet` and `/wallet/payments/{id}`. Signup is `/register`, profile is `/account/profile`, and receipts use `/orders/{id}`. Old panel/query links redirect to these routes. For the category schema upgrade and private `/admin` entry, see NAVIGATION.md.
