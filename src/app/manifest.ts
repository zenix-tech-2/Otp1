import type { MetadataRoute } from "next";

// Full PWABuilder-ready web app manifest. Next.js' Manifest type does not yet include every
// newer field (file_handlers, widgets, launch_handler, tab_strip, note_taking, ...), so the object
// is cast at the end. Every key below is served as-is at /manifest.webmanifest.
const icon = (src: string, sizes: string, purpose?: string) => ({ src, sizes, type: "image/png", ...(purpose ? { purpose } : {}) });

export default function manifest(): MetadataRoute.Manifest {
  const manifest = {
    id: "/",
    name: "Store OTP",
    short_name: "Store OTP",
    description: "Your digital world, all in one place. Virtual numbers, digital products, and your personal wallet.",
    lang: "en",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    // Browsers use the first mode they support, then fall back to `display`.
    display_override: ["window-controls-overlay", "tabbed", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f5f8fd",
    theme_color: "#1754f5",
    prefer_related_applications: false,
    categories: ["shopping", "utilities", "finance"],

    icons: [
      icon("/icons/icon-96.png", "96x96", "any"),
      icon("/icons/icon-144.png", "144x144", "any"),
      icon("/icons/icon-192.png", "192x192", "any"),
      icon("/icons/icon-256.png", "256x256", "any"),
      icon("/icons/icon-384.png", "384x384", "any"),
      icon("/icons/icon-512.png", "512x512", "any"),
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      icon("/icons/maskable-192.png", "192x192", "maskable"),
      icon("/icons/maskable-512.png", "512x512", "maskable"),
      icon("/icons/monochrome-512.png", "512x512", "monochrome"),
    ],

    screenshots: [
      { src: "/screenshots/home-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Store OTP home: your digital world in one place" },
      { src: "/screenshots/numbers-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Get a virtual number and receive codes instantly" },
      { src: "/screenshots/wallet-wide.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Your wallet and orders at a glance" },
      { src: "/screenshots/home-narrow.png", sizes: "720x1280", type: "image/png", form_factor: "narrow", label: "Home" },
      { src: "/screenshots/numbers-narrow.png", sizes: "720x1280", type: "image/png", form_factor: "narrow", label: "Virtual numbers" },
      { src: "/screenshots/wallet-narrow.png", sizes: "720x1280", type: "image/png", form_factor: "narrow", label: "Wallet" },
    ],

    shortcuts: [
      { name: "Get a number", short_name: "Numbers", description: "Rent a virtual number for SMS verification", url: "/numbers?source=shortcut", icons: [icon("/icons/icon-96.png", "96x96")] },
      { name: "Browse the store", short_name: "Store", description: "Digital products, apps and gift cards", url: "/store?source=shortcut", icons: [icon("/icons/icon-96.png", "96x96")] },
      { name: "My wallet", short_name: "Wallet", description: "Check your balance and top up", url: "/wallet?source=shortcut", icons: [icon("/icons/icon-96.png", "96x96")] },
      { name: "My account", short_name: "Account", description: "Orders, numbers and profile", url: "/account?source=shortcut", icons: [icon("/icons/icon-96.png", "96x96")] },
    ],

    // Lets the OS share sheet send text or links into the store search (GET /share).
    share_target: {
      action: "/share",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },

    // web+storeotp://store, web+storeotp:numbers, web+storeotp://wallet ... (see /protocol).
    protocol_handlers: [{ protocol: "web+storeotp", url: "/protocol?url=%s" }],

    // Open plain-text or CSV files from the OS with Store OTP (see /open-file).
    file_handlers: [
      { action: "/open-file", name: "Store OTP list", accept: { "text/plain": [".txt"], "text/csv": [".csv"] }, launch_type: "single-client" },
    ],

    // Re-use the open window instead of spawning a new one on every launch.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },

    // Tabbed display mode (display_override: "tabbed").
    tab_strip: { home_tab: "auto", new_tab_button: { url: "/store" } },

    // Microsoft Edge sidebar.
    edge_side_panel: { preferred_width: 400 },

    // OS note-taking apps (ChromeOS and others) can start a new note here (see /notes).
    note_taking: { new_note_url: "/notes?new=1" },

    // Windows 11 widget board (see /widgets/updates.json and /api/widgets/updates).
    widgets: [
      {
        name: "Store OTP updates",
        short_name: "Updates",
        description: "The latest news and offers from Store OTP.",
        tag: "storeotp-updates",
        template: "storeotp-updates",
        ms_ac_template: "/widgets/updates.json",
        data: "/api/widgets/updates",
        type: "application/json",
        auth: false,
        update: 3600,
        icons: [icon("/icons/icon-96.png", "96x96")],
        screenshots: [{ src: "/screenshots/widget-updates.png", sizes: "387x387", label: "Store OTP updates widget" }],
      },
    ],
  };
  return manifest as unknown as MetadataRoute.Manifest;
}
