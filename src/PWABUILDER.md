# Store OTP: PWABuilder checklist

After deploying, open https://www.pwabuilder.com, enter your URL and re-test.

## What is already wired up
| PWABuilder item | Where |
|---|---|
| Name / short name = **Store OTP** | `src/app/manifest.ts`, `src/app/layout.tsx`, `src/lib/server.ts` |
| Service worker (offline page, nav preload, asset cache, push, background sync, periodic sync, widgets) | `public/sw.js` (registered in `<head>` in `src/app/layout.tsx` and again in `pwa-provider.tsx`) |
| Screenshots (wide + narrow) | `public/screenshots/` |
| Icons: any, maskable, monochrome | `public/icons/` |
| Shortcuts, categories, dir, lang, orientation, display, display_override | manifest |
| `share_target` | `/share` redirects shared text into store search |
| `protocol_handlers` | `web+storeotp:` handled by `/protocol` (allow-listed destinations only) |
| `file_handlers` (.txt, .csv) | `/open-file` (read on-device, nothing uploaded) |
| `launch_handler`, `edge_side_panel`, `tab_strip` / tabbed, window-controls-overlay | manifest + `src/app/pwa.css` |
| `note_taking` | `/notes` (stored in the browser only) |
| `widgets` (Windows 11) | `public/widgets/updates.json` + `/api/widgets/updates` |

## Things only you can supply (deliberately left out)
- **`iarc_rating_id`**: a real certificate from the IARC questionnaire in Google Play Console. A made-up ID would be invalid.
- **`related_applications`**: needs your real Play Store package name. Add it after PWABuilder generates the Android package.
- **`scope_extensions`**: only useful if you own a second domain; it also needs a `/.well-known/web-app-origin-association` file on that domain.
- **Push delivery**: the worker shows notifications, but sending them needs a push server with VAPID keys.

## Notes
- The old PWABuilder "Download a Service Worker" snippets use `importScripts` from storage.googleapis.com. `/sw.js` is served with `script-src 'self'`, so they would be blocked; `public/sw.js` has the same features without any external script.
- The screenshots are generated mockups in the app's colours. Replace them with real screenshots at the same file names and sizes when you have them.
