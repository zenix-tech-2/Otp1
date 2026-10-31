# Portable assets, browser installation, media posts, and APK products

## 1. The icons travel with the source

All **61 configured brand logos** are now included twice:
- Actual image files in `public/brands/`.
- Embedded data-URI copies in `src/lib/brand-assets.ts`, used by the UI.

There are no runtime Google favicon or icon-CDN requests. Interface icons from Lucide are bundled into the application. Category illustrations, banners, the local font, and Android/Apple installation icons are in `public/`.

A provider service with no known brand mapping uses a bundled generic icon rather than a broken remote image. Arbitrary future brands are not falsely claimed to have official artwork: upload a custom product/category image where appropriate.

### Create a complete download

Run `node scripts/export-project.mjs`. It creates **`exports/store-otp-source.zip`** and verifies that the app icons, brand icons, font, artwork, PWA files, schema, and source code are included. The archive excludes `.env`, secret files, node_modules, build caches, and customer data.

Run `node scripts/check-assets.mjs` to validate every embedded logo and the PWA icon dimensions. `scripts/bundle-assets.mjs` can optionally regenerate assets; normal builds/deployments do not fetch icons from the internet.

After extracting the project, run `npm install`, configure `.env`, apply the SQL, and run/build Next.js. Do not open a `.tsx` file directly using `file://`: this is a server-backed app, not a standalone HTML file.

**Uploads made after deployment are different from bundled design assets.** They belong to your Supabase database/Storage project and are not automatically part of a source ZIP. Keep the same Supabase connection when moving hosts, or migrate the database and Storage objects together. Demo upload bytes live in the local preview database, not in the code archive.

## 2. Install from a browser

The app includes:
- `src/app/manifest.ts` → `/manifest.webmanifest`, with name, app ID, start URL, standalone display, shortcuts, and local icons.
- 192×192 and 512×512 Android icons, a maskable icon, and an Apple touch icon.
- `/install`, with an install button when supported and platform-specific instructions otherwise.
- `public/sw.js` and `public/offline.html`.
- An Install app link in customer navigation/account pages.

Deploy over **HTTPS** and open the actual website in a normal browser tab. Install prompts do not reliably work inside embedded previews or in-app browsers.

### Android

In Chrome, use **Install app**, or the browser menu → Install app / Add to Home screen. Supported Chrome Android devices with Google Mobile Services and Samsung Internet on supported Samsung devices can install a **WebAPK**. Other browsers/devices may create a browser-badged shortcut instead. The browser controls availability, prompting, and packaging.

### iPhone / iPad

Open the site in Safari and use Share → Add to Home Screen. iOS does not support the `beforeinstallprompt` button; the app shows the correct instructions instead of claiming an install occurred.

### Desktop

Chrome/Edge offer an address-bar or menu install action. Recent Safari/macOS supports Add to Dock. Unsupported browsers can still use the website normally.

### A PWA is not an independently signed APK

This project makes the website browser-installable. It does not fabricate a standalone APK download. For a separately signed Android APK/AAB or Play Store distribution, package the deployed PWA with a tool such as PWABuilder/Bubblewrap, configure verified-domain Digital Asset Links, and sign it with your own Android key. Those deployment/signing credentials are not included or guessed.

### Offline and update safety

The service worker caches **only local static artwork, icons, fonts, hashed scripts/styles, and a neutral offline page**. It does not cache HTML account pages, API responses, OTPs, wallets, order receipts, payment requests, media endpoints, or signed delivery URLs. It does not queue purchases or payments while offline.

Navigations use the network; a network failure shows a clear offline page. This also avoids resurrecting the old starter screen from a page cache. Existing data already visible in an open tab may remain on screen, but new transactions still require a live server connection.

A waiting service-worker update is offered on `/install`; it is not force-applied in the middle of checkout. Finish active payments/uploads before selecting Update & reload. Change the worker cache version when updating pre-cached assets.

## 3. News and updates have their own pages

- `/news`: store news and announcements.
- `/updates`: app updates, service notices, and maintenance posts.
- `/news/{slug}` and `/updates/{slug}`: full article pages.

Posts support a title, short introduction, full story, publication status, a cover image, and **up to 12 ordered media attachments**. Images, MP4/WebM video, audio, PDF/TXT/ZIP attachments, alt text, and captions are supported. Native video/audio controls are used; media does not autoplay.



Only post media types are allowed in articles. Private product APKs cannot be republished as a news attachment through this endpoint.

## 4. Product files, including APK

In the product form choose **Private downloadable file (including APK)**. Select or drag your file into the upload area. File upload, progress, cancellation, content validation, filename, size, and replacement are handled before publishing the product.

Supported private files include:
- **APK** and **AAB** (AAB is an app bundle, not a directly installable APK).
- ZIP, PDF, EPUB, TXT.
- PNG/JPG/WebP/GIF images.
- MP4/WebM video and MP3/M4A/OGG/WAV audio.


The store never executes APKs or automatically installs them. A customer with a completed purchase receives an authenticated download preserving the original `.apk` filename. Other accounts, anonymous visitors, and refunded orders cannot use that download endpoint.

## 5. Larger direct uploads

The 4 MB form-post restriction is replaced for configured Storage by a direct signed upload flow:

2. The server validates limits and creates a database upload record plus a Supabase signed upload URL for a server-generated path, with overwrite disabled.
3. Browser sends the actual file **directly to Supabase** using PUT and reports progress. The service-role key is never sent to the browser.
5. Server verifies actual Storage size/content type and reads a small byte prefix for format validation, then marks the record ready.
6. Only ready files can be published or used for product fulfillment.

Large files do not pass through a Vercel function body. A dropped connection leaves an incomplete, unpublished upload; retry by choosing the file again. The current uploader is a single signed PUT, not a resumable TUS transfer. On unreliable mobile connections, use smaller files or add a resumable uploader before raising limits further.

### Limits

| Purpose | App limit with configured Supabase Storage |
| --- | --- |
| Private product files, including APK | **250 MiB** |
| Product/category/post images | **10 MiB** |
| News/update video | **150 MiB** |
| News/update audio | **50 MiB** |
| Public article attachments | **25 MiB** |
| Demo database-only upload | **4,000,000 bytes** |

**Your Supabase plan and project-wide Storage maximum must also permit the chosen size.** Raising a bucket limit does not override the plan/global limit. Configure this in the Supabase Storage settings; higher limits may require a suitable paid plan. The UI reports a storage error rather than claiming an oversized transfer succeeded.

### Environment and SQL

Use existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- Fresh project: use the updated `supabase/schema.sql`.
- Existing installation after the category upgrade: run **`supabase/upgrade-media-uploads.sql` once**. It adds upload records, post fields, RLS, and updates the Storage bucket limits/MIME types without deleting existing data.
- If the application migration was already applied via Drizzle, run only **`supabase/storage-media.sql`** for the Storage settings.
- Do not apply the equivalent schema upgrade twice.

Buckets:
- `product-deliveries`: private purchased files, including APK.
- `news-media`: private media; publication checks precede short-lived signed reads.

No anonymous upload policy is added. Monitor abandoned pending uploads and clean up stale unattached Storage objects as part of your retention process. Successful uploaded files referenced by purchases must not be deleted during ordinary catalog cleanup.

### Sandbox behavior

If Storage is absent and `APP_MODE=demo`, files up to 4 MB can be genuinely uploaded and persisted as bounded bytes in the local PostgreSQL preview database. This lets the media editor and small APK purchase/download flow be tested. It is not a claim that a real cloud upload took place. Larger demo files produce an explicit request to configure Storage. Live mode never silently falls back to storing customer product binaries in PostgreSQL.

## 6. Tests

All write tests use the disposable local sandbox database.

- `node scripts/check-assets.mjs`: all bundled/embedded brand files and PWA icons.
- `node --conditions=react-server --import dotenv/config --import tsx scripts/upload-contract.mjs`: mocked signed-upload contract, 240 MB APK acceptance, 250 MB limit, owner checks, metadata/signature validation. No real large file is sent.
- `node --import dotenv/config --import tsx scripts/media-browser.mjs`: PWA, blocked external-icon requests, media article publication, draft privacy, and purchased APK download.
- Existing navigation, payment, and SMS regression scripts remain available.

`tests/fixtures/not-installable-test.apk` is a deliberately non-installable ZIP-format test fixture, not an Android application for distribution. Media fixtures are small local test files.
