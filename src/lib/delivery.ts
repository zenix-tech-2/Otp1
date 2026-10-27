// Structured delivery formats shared by the admin forms, the API and the customer receipt.
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
export type SlotKind = "proxy" | "account";

export const COURSE_LIMITS = { chapters: 40, modules: 40, lessons: 80, totalLessons: 400, title: 120 };
export const MAX_FULFILLMENT = 120000;
export const MAX_SLOT_BYTES = 4000;

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

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

function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export function normalizeProtocol(value: string): ProxyProtocol {
  const v = value.toLowerCase();
  if (v.startsWith("socks5")) return "socks5";
  if (v.startsWith("socks4")) return "socks4";
  return v === "https" ? "https" : "http";
}

export function isValidHost(host: string) {
  if (!host || host.length > 253 || /\s/.test(host)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host.split(".").every(n => Number(n) <= 255);
  return /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(host) && host.includes(".");
}

export function isValidPort(port: string) { return /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535; }

export type SlotResult<T> = { ok: true; slot: T } | { ok: false; error: string };

export function buildProxySlot(input: { protocol?: string; host?: string; port?: string; username?: string; password?: string }): SlotResult<ProxySlot> {
  const host = cleanText(input.host, 253);
  const port = cleanText(input.port, 5);
  const username = cleanText(input.username, 200);
  const password = typeof input.password === "string" ? input.password.trim().slice(0, 200) : "";
  const protocol = normalizeProtocol(cleanText(input.protocol, 10) || "http");
  if (!isValidHost(host)) return { ok: false, error: "Enter a valid server address (IP or hostname)." };
  if (!isValidPort(port)) return { ok: false, error: "The port must be a number between 1 and 65535." };
  if (!username) return { ok: false, error: "Add the proxy username." };
  if (!password) return { ok: false, error: "Add the proxy password." };
  return { ok: true, slot: { t: "proxy", protocol, host, port, username, password } };
}

export function buildAccountSlot(input: { login?: string; password?: string; note?: string }): SlotResult<AccountSlot> {
  const login = cleanText(input.login, 250);
  const password = typeof input.password === "string" ? input.password.trim().slice(0, 250) : "";
  const note = cleanText(input.note, 500);
  if (!login) return { ok: false, error: "Add the username, email or phone number." };
  if (!password) return { ok: false, error: "Add the account password." };
  return { ok: true, slot: { t: "account", login, password, ...(note ? { note } : {}) } };
}

/** Accepts protocol://user:pass@host:port, user:pass@host:port, host:port:user:pass and host:port|user|pass. */
export function parseProxyLine(raw: string): SlotResult<ProxySlot> {
  const line = raw.trim();
  let protocol = "http";
  let rest = line;
  const scheme = /^(https?|socks4|socks5h?):\/\/(.+)$/i.exec(rest);
  if (scheme) { protocol = scheme[1]; rest = scheme[2]; }
  const at = rest.lastIndexOf("@");
  if (at > -1) {
    const credentials = rest.slice(0, at);
    const hostPort = rest.slice(at + 1);
    const split = credentials.indexOf(":");
    const hi = hostPort.lastIndexOf(":");
    if (hi < 0) return { ok: false, error: "Missing the port." };
    return buildProxySlot({ protocol, host: hostPort.slice(0, hi), port: hostPort.slice(hi + 1), username: split > -1 ? credentials.slice(0, split) : credentials, password: split > -1 ? credentials.slice(split + 1) : "" });
  }
  const parts = rest.split(/[:|\t]/);
  if (parts.length < 4) return { ok: false, error: "Use host:port:username:password." };
  const [host, port, username, ...password] = parts;
  return buildProxySlot({ protocol, host, port, username, password: password.join(":") });
}

/** Accepts login|password, login|password|note or login:password (first colon splits). */
export function parseAccountLine(raw: string): SlotResult<AccountSlot> {
  const line = raw.trim();
  if (line.includes("|")) {
    const [login, password, ...note] = line.split("|").map(part => part.trim());
    return buildAccountSlot({ login, password, note: note.join(" | ") });
  }
  const index = line.indexOf(":");
  if (index < 1) return { ok: false, error: "Use login|password or login:password." };
  return buildAccountSlot({ login: line.slice(0, index), password: line.slice(index + 1) });
}

export function parseSlotLines(text: string, kind: SlotKind) {
  const slots: (ProxySlot | AccountSlot)[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const result = kind === "proxy" ? parseProxyLine(line) : parseAccountLine(line);
    if (result.ok) slots.push(result.slot); else errors.push(`Line ${index + 1}: ${result.error}`);
  });
  return { slots, errors };
}

export function serializeSlot(slot: ProxySlot | AccountSlot) { return JSON.stringify(slot); }

/** Validates one stored inventory payload for a slot product and returns the normalized text. */
export function normalizeSlotPayload(kind: SlotKind, payload: string): string {
  const parsed = parseDelivery(payload);
  if (!parsed || (kind === "proxy" && parsed.t !== "proxy") || (kind === "account" && parsed.t !== "account")) throw new Error("A stock slot has an unsupported format.");
  const result = parsed.t === "proxy" ? buildProxySlot(parsed) : buildAccountSlot(parsed as AccountSlot);
  if (!result.ok) throw new Error(result.error);
  const text = serializeSlot(result.slot);
  if (text.length > MAX_SLOT_BYTES) throw new Error("A stock slot is too long.");
  return text;
}

export function proxyUrl(slot: ProxySlot) {
  return `${slot.protocol}://${encodeURIComponent(slot.username)}:${encodeURIComponent(slot.password)}@${slot.host}:${slot.port}`;
}
export function proxyLine(slot: ProxySlot) { return `${slot.host}:${slot.port}:${slot.username}:${slot.password}`; }

export function isHttpsUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; }
}

export function normalizeLink(input: unknown): LinkDelivery {
  const value = typeof input === "string" ? parseDelivery(input) : (input as LinkDelivery | null);
  if (!value || value.t !== "link") throw new Error("Add the link your customer should receive.");
  const url = cleanText(value.url, 2000);
  if (!isHttpsUrl(url)) throw new Error("The link must be a full https:// address.");
  const label = cleanText(value.label, 80);
  const note = cleanText(value.note, 2000);
  return { t: "link", url, ...(label ? { label } : {}), ...(note ? { note } : {}) };
}

export function uploadIdOf(ref: string) { return ref.startsWith("upload:") ? ref.slice(7) : ""; }

/** Normalizes a course curriculum; throws a friendly Error for anything incomplete. */
export function normalizeCourse(input: unknown): CourseDelivery {
  const value = typeof input === "string" ? parseDelivery(input) : (input as CourseDelivery | null);
  if (!value || value.t !== "course" || !Array.isArray(value.chapters)) throw new Error("Add at least one chapter with a lesson.");
  if (!value.chapters.length) throw new Error("Add at least one chapter with a lesson.");
  if (value.chapters.length > COURSE_LIMITS.chapters) throw new Error(`A course can have up to ${COURSE_LIMITS.chapters} chapters.`);
  let total = 0;
  const chapters = value.chapters.map((chapter, ci) => {
    const title = cleanText(chapter.title, COURSE_LIMITS.title);
    if (!title) throw new Error(`Give chapter ${ci + 1} a title.`);
    if (!Array.isArray(chapter.modules) || !chapter.modules.length) throw new Error(`Chapter “${title}” needs at least one module.`);
    if (chapter.modules.length > COURSE_LIMITS.modules) throw new Error(`A chapter can have up to ${COURSE_LIMITS.modules} modules.`);
    const modules = chapter.modules.map((module, mi) => {
      const moduleTitle = cleanText(module.title, COURSE_LIMITS.title);
      if (!moduleTitle) throw new Error(`Give module ${mi + 1} in “${title}” a title.`);
      if (!Array.isArray(module.lessons) || !module.lessons.length) throw new Error(`Module “${moduleTitle}” needs at least one lesson.`);
      if (module.lessons.length > COURSE_LIMITS.lessons) throw new Error(`A module can have up to ${COURSE_LIMITS.lessons} lessons.`);
      const lessons = module.lessons.map((lesson, li) => {
        const lessonTitle = cleanText(lesson.title, COURSE_LIMITS.title);
        if (!lessonTitle) throw new Error(`Give lesson ${li + 1} in “${moduleTitle}” a title.`);
        total += 1;
        const id = cleanText(lesson.id, 64) || newId();
        if (lesson.source === "upload") {
          const ref = cleanText(lesson.ref, 80);
          if (!/^upload:[a-f0-9-]{36}$/.test(ref)) throw new Error(`Upload a video for “${lessonTitle}”, or switch it to a link.`);
          const size = Number.isFinite(lesson.size) ? Math.max(0, Math.floor(Number(lesson.size))) : undefined;
          return { id, title: lessonTitle, source: "upload" as const, ref, ...(lesson.name ? { name: cleanText(lesson.name, 200) } : {}), ...(size ? { size } : {}) };
        }
        const ref = cleanText(lesson.ref, 2000);
        if (!isHttpsUrl(ref)) throw new Error(`“${lessonTitle}” needs a full https:// link.`);
        return { id, title: lessonTitle, source: "link" as const, ref };
      });
      return { id: cleanText(module.id, 64) || newId(), title: moduleTitle, lessons };
    });
    return { id: cleanText(chapter.id, 64) || newId(), title, modules };
  });
  if (total > COURSE_LIMITS.totalLessons) throw new Error(`A course can have up to ${COURSE_LIMITS.totalLessons} lessons in total.`);
  return { t: "course", chapters };
}

export function courseLessonCount(course: CourseDelivery) {
  return course.chapters.reduce((n, c) => n + c.modules.reduce((m, mod) => m + mod.lessons.length, 0), 0);
}

export function courseUploadIds(course: CourseDelivery) {
  return course.chapters.flatMap(c => c.modules.flatMap(m => m.lessons.filter(l => l.source === "upload").map(l => uploadIdOf(l.ref))));
}

export type DigitalType = "ebook" | "video_course" | "course_link" | "software" | "bundle" | "license_keys" | "access_link" | "custom";
export const digitalTypes: { id: DigitalType; label: string; hint: string; mode: "file" | "course" | "link" | "inventory" | null }[] = [
  { id: "ebook", label: "Ebook", hint: "Upload the book and its cover. Buyers download the file.", mode: "file" },
  { id: "video_course", label: "Video course", hint: "Build chapters, modules and lessons with videos.", mode: "course" },
  { id: "course_link", label: "Course link", hint: "Deliver a private link to a course you host elsewhere.", mode: "link" },
  { id: "software", label: "Software / app", hint: "APK, ZIP or installer delivered as a private download.", mode: "file" },
  { id: "bundle", label: "Template / file bundle", hint: "A ZIP or PDF pack of templates, assets or documents.", mode: "file" },
  { id: "license_keys", label: "License keys / codes", hint: "One unique code per purchase. Stock follows your codes.", mode: "inventory" },
  { id: "access_link", label: "Membership / access link", hint: "Community, group invite or shared access link.", mode: "link" },
  { id: "custom", label: "Something else", hint: "Pick any delivery method yourself.", mode: null },
];
