// Client-safe gifting helpers.
export const GIFT_MESSAGE_MAX = 200;
/** "Jane Doe" → "Jane D." so a buyer can confirm the recipient without seeing a full name. */
export function maskedName(name: string): string { const parts = name.trim().split(/\s+/).filter(Boolean); if (!parts.length) return "Store OTP user"; return parts.length === 1 ? parts[0].slice(0, 20) : `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toUpperCase()}.`; }
export type GiftMeta = { to?: string; toName?: string; from?: string; fromName?: string; message?: string };
