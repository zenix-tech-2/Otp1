// Client-safe temp-mail definitions. Customers only ever see the neutral "Mail V1…" names.
export const MAIL_PROVIDERS = ["v1", "v2", "v3", "v4", "v5", "v6"] as const;
export type MailProviderId = (typeof MAIL_PROVIDERS)[number];
export const MAX_MAILBOXES = 5;
export const providerLabel = (id: string) => `Mail ${id.toUpperCase()}`;
/** What each version offers, described without naming the service behind it. */
export const PROVIDER_TRAITS: Record<MailProviderId, { note: string; customName: boolean; extend: boolean }> = {
  v1: { note: "Pick your own name · long storage", customName: true, extend: false },
  v2: { note: "Instant address · simple and fast", customName: false, extend: false },
  v3: { note: "Detects codes · can be extended", customName: false, extend: true },
  v4: { note: "Pick your own name", customName: true, extend: false },
  v5: { note: "Instant address · fresh each time", customName: false, extend: false },
  v6: { note: "Instant address", customName: false, extend: false },
};
/** Services whose terms ask for a visible credit. Shown once at the bottom of the page without saying which version they power. */
export type MailCredit = { name: string; url: string };
export type ProviderOption = { id: MailProviderId; label: string; note: string; customName: boolean };
export type MailboxView = { id: string; provider: MailProviderId; label: string; address: string; expiresAt: string; createdAt: string; canExtend: boolean };
export type MessageSummary = { id: string; from: string; fromName: string; subject: string; date: string; seen: boolean; hasAttachments: boolean; code: string | null };
export type MessageFull = MessageSummary & { to: string; text: string; html: string | null; attachments: { name: string; size: number | null; type: string }[] };

/** Finds a one-time code in a message: a 4–8 digit number near a word like "code" or "verification". */
export function extractCode(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(" \n ").slice(0, 4000);
  const keyword = /(?:code|otp|pin|passcode|verification|verify|confirm|security)[^0-9]{0,40}(\d{3}[- ]?\d{3}|\d{4,8})\b/i.exec(text);
  const reverse = /\b(\d{4,8})\b[^0-9\n]{0,30}(?:is your|is the|as your)[^.\n]{0,30}(?:code|otp|pin)/i.exec(text);
  const found = keyword?.[1] || reverse?.[1]; return found ? found.replace(/[- ]/g, "") : null;
}
