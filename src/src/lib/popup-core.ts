// Client-safe pop-up definitions shared by the storefront and the API.
export type PopupFrequency = "session" | "once";
export type Popup = {
  id: string; title: string; body: string;
  /** "" (no image), a small data: URL, or a path inside the app such as /images/gift.webp */
  image: string;
  buttonLabel: string;
  /** Optional call-to-action target: a path inside the app (/gift) or an https:// link. */
  linkUrl: string; linkLabel: string;
  /** Optional file offered for download (the mobile app). A path inside the app such as /store-otp.apk, or "" for none. */
  downloadUrl?: string; downloadLabel?: string;
  active: boolean;
  /** "session" = shown once per login session. "once" = shown once per customer, then never again (until edited). */
  frequency: PopupFrequency;
  startsAt: string | null; endsAt: string | null;
  createdAt: string; updatedAt: string;
};
export const POPUP_LIMIT = 10;
export const POPUP_IMAGE_MAX_CHARS = 700_000; // ≈ 500 KB of image data
export const POPUP_IMAGE_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export function popupLive(p: Popup, now = Date.now()) {
  if (!p.active) return false;
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
  return true;
}
export function safePopupLink(url: string) { return url.startsWith("/") && !url.startsWith("//") ? "internal" : /^https:\/\//i.test(url) ? "external" : null; }
