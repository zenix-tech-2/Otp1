// Structured delivery formats shared by the API and the customer receipt.
// Everything here is plain TypeScript so it can run in the browser and on the server.

export const proxyProtocols = ["http", "https", "socks4", "socks5"] as const;
export type ProxyProtocol = (typeof proxyProtocols)[number];

export type ProxySlot = { t: "proxy"; protocol: ProxyProtocol; host: string; port: string; username: string; password: string };
export type AccountSlot = { t: "account"; login: string; password: string; note?: string };
export type LinkDelivery = { t: "link"; url: string; label?: string; note?: string };
export type Lesson = { id: string; title: string; source: "upload" | "link"; ref: string; name?: string; size?: number };
export type CourseModule = { id: string; title: string; lessons: Lesson[] };
export type CourseChapter = { id: string; title: string; modules: CourseModule[] };
export type CourseDelivery = { t: "course"; chapters: CourseChapter[] };
export type Delivery = ProxySlot | AccountSlot | LinkDelivery | CourseDelivery;



/** Metadata keys that drive behaviour and are not shown to shoppers. */
export const internalMetadataKeys = ["deliveryMode", "slotType", "countryCode", "digitalType", "fileName", "fileBytes", "delivery"];

export function publicMetadata(metadata: Record<string, string>) {
  return Object.entries(metadata).filter(([key, value]) => !internalMetadataKeys.includes(key) && value !== "");
}

export function parseDelivery(text: unknown): Delivery | null {
  if (typeof text !== "string" || !text.startsWith("{\"t\":")) return null;
  try {
    const value = JSON.parse(text);
    return value && ["proxy", "account", "link", "course"].includes(value.t) ? (value as Delivery) : null;
  } catch { return null; }
}













export function proxyUrl(slot: ProxySlot) {
  return `${slot.protocol}://${encodeURIComponent(slot.username)}:${encodeURIComponent(slot.password)}@${slot.host}:${slot.port}`;
}
export function proxyLine(slot: ProxySlot) { return `${slot.host}:${slot.port}:${slot.username}:${slot.password}`; }







