import "server-only";
import { randomBytes } from "node:crypto";
import { AppError } from "./server";
import { extractCode, MAIL_PROVIDERS, PROVIDER_TRAITS, providerLabel, type MailCredit, type MailProviderId, type MessageFull, type MessageSummary, type ProviderOption } from "./tempmail-core";

// One adapter per upstream service. Customers only see "Mail V1…"; keys and tokens never leave the server.
type J = Record<string, unknown>;
export type BoxRef = { address: string; secret: string; ref: string };
export type CreatedBox = { address: string; secret: string; ref: string; expiresAt: Date };
interface Adapter {
  create(opts: { name?: string }): Promise<CreatedBox>;
  list(box: BoxRef): Promise<MessageSummary[]>;
  read(box: BoxRef, id: string): Promise<MessageFull>;
  remove(box: BoxRef, id: string): Promise<void>;
  extend?(box: BoxRef): Promise<Date>;
  /** For services with no delete call: returns the new secret that hides this message from now on. */
  hide?(box: BoxRef, id: string): string;
  /** Called after a 401 so token-based services can sign in again. Returns the new secret. */
  reauth?(box: BoxRef): Promise<string>;
}
const HOUR = 3_600_000;
const busy = () => new AppError("This mailbox version is busy right now. Try again in a moment, or switch to another Mail version.", 502);
const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const o = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const iso = (v: unknown) => { const d = new Date(s(v)); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
const randomName = (n = 10) => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; const b = randomBytes(n); return Array.from(b, x => a[x % a.length]).join(""); };
/** "Jane <jane@x.com>" → { name, address } */
function parseFrom(v: unknown): { name: string; address: string } {
  if (v && typeof v === "object") { const x = o(v); return { name: s(x.name), address: s(x.address || x.email) }; }
  const text = s(v); const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(text); return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: text.trim() };
}
type HttpInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };
async function http(url: string, init: HttpInit = {}) {
  let res: Response;
  try { res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json, application/ld+json;q=0.9, */*;q=0.1", ...init.headers } }); } catch { throw busy(); }
  const raw = await res.text(); let data: unknown = null; try { data = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }
  return { status: res.status, ok: res.ok, data };
}
const json = (body: unknown): HttpInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const attachmentsOf = (list: unknown[]) => list.map(a => { const x = o(a); return { name: s(x.filename || x.name || x.file_name) || "attachment", size: Number(x.size_bytes ?? x.size ?? x.bytes) || null, type: s(x.mime_type || x.contentType || x.content_type || x.type) || "file" }; });

// ── Mail V1 · GrabMail ─────────────────────────────────────────────────────────
const GRAB = "https://grabmail.io/api/v1"; const grabKey = () => process.env.GRABMAIL_API_KEY?.trim() || "";
const grabHeaders = (): Record<string, string> => (grabKey() ? { Authorization: `Bearer ${grabKey()}` } : {});
let grabDomains: { at: number; list: string[] } | null = null;
async function grabmailDomains() {
  if (grabDomains && Date.now() - grabDomains.at < 10 * 60_000) return grabDomains.list;
  let list = ["grabmail.io", "mixozia.com", "linqmail.com"];
  try {
    const r = await http(`${GRAB}/domains`, { headers: grabHeaders() }); const d = o(r.data); const premium = o(d.premium);
    const pub = arr(d.public).map(s).filter(Boolean); if (pub.length) list = pub;
    if (process.env.GRABMAIL_USE_PREMIUM === "1" && premium.unlocked === true) { const p = arr(premium.domains).map(s).filter(Boolean); if (p.length) list = p; }
  } catch { /* fall back to the public list */ }
  grabDomains = { at: Date.now(), list }; return list;
}
const grabV1: Adapter = {
  async create({ name }) {
    const domains = await grabmailDomains(); const domain = domains[Math.floor(Math.random() * domains.length)];
    const address = `${name || randomName(12)}@${domain}`;
    // A mailbox exists the moment mail arrives. On the premium pool the first read "holds" the address for this account.
    if (process.env.GRABMAIL_USE_PREMIUM === "1") { const r = await http(`${GRAB}/mailbox?address=${encodeURIComponent(address)}`, { headers: grabHeaders() }); if (r.status === 403) throw new AppError("That name is taken. Try another."); if (!r.ok) throw busy(); }
    return { address, secret: "", ref: "", expiresAt: new Date(Date.now() + 24 * HOUR) };
  },
  async list(b) {
    const r = await http(`${GRAB}/mailbox?address=${encodeURIComponent(b.address)}&limit=50`, { headers: grabHeaders() });
    if (r.status === 429) throw new AppError("Slow down a little, then refresh.", 429); if (!r.ok) throw busy();
    return arr(o(r.data).messages).map(m => { const x = o(m); const f = parseFrom(x.from); return { id: s(x.id), from: f.address, fromName: f.name, subject: s(x.subject), date: iso(x.date), seen: x.seen === true, hasAttachments: Number(x.attachments) > 0, code: null }; });
  },
  async read(b, id) {
    const r = await http(`${GRAB}/message/${encodeURIComponent(id)}?mailbox=${encodeURIComponent(b.address)}`, { headers: grabHeaders() });
    if (r.status === 404) throw new AppError("That message is no longer available.", 404); if (!r.ok) throw busy();
    const x = o(r.data); const f = parseFrom(x.from); const text = s(x.text);
    return { id: s(x.id) || id, from: f.address, fromName: f.name, to: s(x.to) || b.address, subject: s(x.subject), date: iso(x.date), seen: true, hasAttachments: arr(x.attachments).length > 0, code: null, text, html: s(x.html) || null, attachments: attachmentsOf(arr(x.attachments)) };
  },
  async remove(b, id) { const r = await http(`${GRAB}/message/${encodeURIComponent(id)}?mailbox=${encodeURIComponent(b.address)}`, { method: "DELETE", headers: grabHeaders() }); if (!r.ok && r.status !== 404) throw busy(); },
};

// ── Mail V2 · smails ───────────────────────────────────────────────────────────
const SM = "https://smails.dev/api/mailbox";
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const smailsV2: Adapter = {
  async create() {
    const r = await http(SM, { method: "POST" }); const d = o(r.data); if (!r.ok || !s(d.address) || !s(d.token)) throw busy();
    return { address: s(d.address), secret: s(d.token), ref: "", expiresAt: new Date(Date.now() + 24 * HOUR) };
  },
  async list(b) {
    const r = await http(`${SM}/messages`, { headers: bearer(b.secret) }); if (r.status === 401 || r.status === 404) throw new AppError("This mailbox has expired.", 410); if (!r.ok) throw busy();
    const rows = Array.isArray(r.data) ? r.data : arr(o(r.data).messages ?? o(r.data).items ?? o(r.data).data);
    return rows.map(m => { const x = o(m); const f = parseFrom(x.from ?? x.sender); return { id: s(x.id), from: f.address, fromName: f.name || s(x.fromName), subject: s(x.subject), date: iso(x.date ?? x.receivedAt ?? x.received_at ?? x.createdAt ?? x.created_at), seen: (x.seen ?? x.read) === true, hasAttachments: Array.isArray(x.attachments) ? x.attachments.length > 0 : Number(x.attachments) > 0 || x.hasAttachments === true, code: null }; });
  },
  async read(b, id) {
    const r = await http(`${SM}/messages/${encodeURIComponent(id)}`, { headers: bearer(b.secret) }); if (r.status === 404) throw new AppError("That message is no longer available.", 404); if (!r.ok) throw busy();
    const x = o(o(r.data).message ?? r.data); const f = parseFrom(x.from ?? x.sender); const html = s(x.html ?? x.bodyHtml ?? x.body_html);
    return { id: s(x.id) || id, from: f.address, fromName: f.name, to: s(x.to) || b.address, subject: s(x.subject), date: iso(x.date ?? x.receivedAt ?? x.received_at ?? x.createdAt ?? x.created_at), seen: true, hasAttachments: arr(x.attachments).length > 0, code: null, text: s(x.text ?? x.bodyText ?? x.body_text ?? x.body), html: html || null, attachments: attachmentsOf(arr(x.attachments)) };
  },
  async remove(b, id) { const r = await http(`${SM}/messages/${encodeURIComponent(id)}`, { method: "DELETE", headers: bearer(b.secret) }); if (!r.ok && r.status !== 404) throw busy(); },
};

// ── Mail V3 · MailboxTemp ──────────────────────────────────────────────────────
const MB = "https://mailboxtemp.com";
const mbPath = (a: string) => encodeURIComponent(a);
const mailboxTempV3: Adapter = {
  async create() {
    const r = await http(`${MB}/api/inbox/generate`, { method: "POST" }); const d = o(r.data);
    if (r.status === 429) throw new AppError("Too many new mailboxes right now. Try again in a minute.", 429); if (!r.ok || d.ok !== true || !s(d.address)) throw busy();
    return { address: s(d.address), secret: "", ref: s(d.inboxId), expiresAt: new Date(s(d.expires) || Date.now() + HOUR) };
  },
  async list(b) {
    const r = await http(`${MB}/api/inbox/${mbPath(b.address)}/emails`); if (r.status === 404) throw new AppError("This mailbox has expired.", 410); if (!r.ok) throw busy();
    return arr(o(r.data).emails).map(m => { const x = o(m); return { id: s(x.id), from: s(x.from_address), fromName: s(x.from_name), subject: s(x.subject), date: iso(x.received_at), seen: x.read === true, hasAttachments: x.has_attachments === true, code: s(x.otp_code) || null }; });
  },
  async read(b, id) {
    const r = await http(`${MB}/api/email/${mbPath(b.address)}/${encodeURIComponent(id)}`); if (r.status === 404) throw new AppError("That message is no longer available.", 404); if (!r.ok) throw busy();
    const d = o(r.data); const x = o(d.email);
    return { id: s(x.id) || id, from: s(x.from_address), fromName: s(x.from_name), to: b.address, subject: s(x.subject), date: iso(x.received_at), seen: true, hasAttachments: arr(d.attachments).length > 0, code: s(x.otp_code) || null, text: s(x.body_text), html: s(x.body_html) || null, attachments: attachmentsOf(arr(d.attachments)) };
  },
  async remove(b, id) { const r = await http(`${MB}/api/email/${mbPath(b.address)}/${encodeURIComponent(id)}`, { method: "DELETE" }); if (!r.ok && r.status !== 404) throw busy(); },
  async extend(b) {
    const r = await http(`${MB}/api/inbox/${mbPath(b.address)}/extend`, { method: "POST" }); if (!r.ok) throw busy();
    const info = await http(`${MB}/api/inbox/${mbPath(b.address)}`); const at = s(o(info.data).expires_at); return new Date(at || Date.now() + HOUR);
  },
};

// ── Mail V4 · mail.tm (off unless listed in TEMPMAIL_PROVIDERS — see its terms) ─
const TM = "https://api.mail.tm";
const mailTmV4: Adapter = {
  async create({ name }) {
    const d = await http(`${TM}/domains`); const rows = Array.isArray(d.data) ? d.data : arr(o(d.data)["hydra:member"]);
    const domains = rows.map(x => o(x)).filter(x => x.isActive !== false && s(x.domain)).map(x => s(x.domain)); if (!d.ok || !domains.length) throw busy();
    const address = `${name || randomName(10)}@${domains[Math.floor(Math.random() * domains.length)]}`; const password = randomBytes(18).toString("base64url");
    const made = await http(`${TM}/accounts`, json({ address, password })); if (made.status === 422) throw new AppError("That name is taken. Try another."); if (!made.ok) throw busy();
    const t = await http(`${TM}/token`, json({ address, password })); const token = s(o(t.data).token); if (!t.ok || !token) throw busy();
    return { address, secret: JSON.stringify({ password, token }), ref: s(o(made.data).id), expiresAt: new Date(Date.now() + 24 * HOUR) };
  },
  async reauth(b) { const { password } = JSON.parse(b.secret || "{}") as { password?: string }; const t = await http(`${TM}/token`, json({ address: b.address, password })); const token = s(o(t.data).token); if (!token) throw new AppError("This mailbox has expired.", 410); return JSON.stringify({ password, token }); },
  async list(b) {
    const r = await http(`${TM}/messages`, { headers: bearer(tmToken(b)) }); if (r.status === 401) throw new AppError("auth", 401); if (!r.ok) throw busy();
    const rows = Array.isArray(r.data) ? r.data : arr(o(r.data)["hydra:member"]);
    return rows.map(m => { const x = o(m); const f = parseFrom(x.from); return { id: s(x.id), from: f.address, fromName: f.name, subject: s(x.subject), date: iso(x.createdAt), seen: x.seen === true, hasAttachments: x.hasAttachments === true, code: extractCode(s(x.subject), s(x.intro)) }; });
  },
  async read(b, id) {
    const r = await http(`${TM}/messages/${encodeURIComponent(id)}`, { headers: bearer(tmToken(b)) }); if (r.status === 401) throw new AppError("auth", 401); if (r.status === 404) throw new AppError("That message is no longer available.", 404); if (!r.ok) throw busy();
    const x = o(r.data); const f = parseFrom(x.from); const html = Array.isArray(x.html) ? x.html.map(s).join("") : s(x.html);
    return { id: s(x.id) || id, from: f.address, fromName: f.name, to: s(o(arr(x.to)[0]).address) || b.address, subject: s(x.subject), date: iso(x.createdAt), seen: true, hasAttachments: arr(x.attachments).length > 0, code: null, text: s(x.text), html: html || null, attachments: attachmentsOf(arr(x.attachments)) };
  },
  async remove(b, id) { const r = await http(`${TM}/messages/${encodeURIComponent(id)}`, { method: "DELETE", headers: bearer(tmToken(b)) }); if (r.status === 401) throw new AppError("auth", 401); if (!r.ok && r.status !== 404) throw busy(); },
};
function tmToken(b: BoxRef) { try { return (JSON.parse(b.secret) as { token?: string }).token || ""; } catch { return ""; } }


// ── Mail V5 · DropMail (GraphQL) ───────────────────────────────────────────────
const dropToken = () => process.env.DROPMAIL_TOKEN?.trim() || "";
const dropUrl = () => `https://dropmail.me/api/graphql/${encodeURIComponent(dropToken())}`;
async function gql(query: string, variables?: J): Promise<{ data: J | null; errors: string }> {
  const body = new URLSearchParams({ query }); if (variables) body.set("variables", JSON.stringify(variables));
  const r = await http(dropUrl(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (r.status === 401 || r.status === 403) throw new AppError("This mailbox version isn’t configured correctly.", 502);
  if (r.status === 429) throw new AppError("Slow down a little, then refresh.", 429);
  const d = o(r.data); const errors = arr(d.errors).map(e => s(o(e).message)).join("; ");
  if (!r.ok && !errors) throw busy();
  return { data: d.data && typeof d.data === "object" ? (d.data as J) : null, errors };
}
// The schema is in public beta, so ask for the richest field set first and fall back if a field was renamed.
const DROP_TIERS = [
  "id fromAddr toAddr headerFrom headerSubject headerDate text html downloadUrl",
  "id fromAddr toAddr headerSubject text html downloadUrl",
  "fromAddr toAddr headerSubject text html downloadUrl",
];
let dropTier = 0;
async function dropSession(sessionId: string): Promise<{ mails: J[]; expiresAt: string }> {
  for (let t = dropTier; t < DROP_TIERS.length; t++) {
    const r = await gql(`query($id:ID!){session(id:$id){expiresAt mails{${DROP_TIERS[t]}}}}`, { id: sessionId });
    if (/cannot query field|unknown field|field .* (?:not|doesn)/i.test(r.errors) && t < DROP_TIERS.length - 1) { dropTier = t + 1; continue; }
    if (r.errors && !r.data) throw busy();
    const session = o(r.data?.session); if (!r.data || !r.data.session) throw new AppError("This mailbox has expired.", 410);
    return { mails: arr(session.mails).map(o), expiresAt: s(session.expiresAt) };
  }
  throw busy();
}
const dropId = (m: J) => s(m.id) || s(m.downloadUrl);
const hiddenOf = (secret: string): string[] => { try { return arr((JSON.parse(secret) as J).hidden).map(s); } catch { return []; } };
function dropSummary(m: J): MessageSummary {
  const f = parseFrom(m.headerFrom || m.fromAddr); const text = s(m.text);
  return { id: dropId(m), from: s(m.fromAddr) || f.address, fromName: f.name, subject: s(m.headerSubject), date: m.headerDate ? iso(m.headerDate) : new Date().toISOString(), seen: false, hasAttachments: false, code: extractCode(s(m.headerSubject), text) };
}
const dropMailV5: Adapter = {
  async create() {
    let domainId = "";
    try { const d = await gql("query{domains{id name availableViaApi}}"); const ok = arr(d.data?.domains).map(o).filter(x => x.availableViaApi !== false && s(x.id)); if (ok.length) domainId = s(ok[Math.floor(Math.random() * ok.length)].id); } catch { /* use the default domain */ }
    const r = await gql(`mutation($i:IntroduceSessionInput){introduceSession(input:$i){id expiresAt addresses{address}}}`, { i: { withAddress: true, ...(domainId ? { domainId } : {}) } });
    const session = o(r.data?.introduceSession); const address = s(o(arr(session.addresses)[0]).address);
    if (!s(session.id) || !address) throw busy();
    return { address, secret: "", ref: s(session.id), expiresAt: new Date(Date.now() + 24 * HOUR) };
  },
  async list(b) { const { mails } = await dropSession(b.ref); const hidden = new Set(hiddenOf(b.secret)); return mails.map(dropSummary).filter(m => !hidden.has(m.id)); },
  async read(b, id) {
    const { mails } = await dropSession(b.ref); const m = mails.find(x => dropId(x) === id); if (!m) throw new AppError("That message is no longer available.", 404);
    const sum = dropSummary(m); return { ...sum, to: s(m.toAddr) || b.address, seen: true, text: s(m.text), html: s(m.html) || null, attachments: [] };
  },
  // DropMail has no delete call: hide the message for this mailbox instead.
  async remove(b, id) { await dropSession(b.ref); },
  hide: (b, id) => JSON.stringify({ hidden: [...hiddenOf(b.secret), id].slice(-200) }),
};

// Mail V6 (NenzMail) has no adapter yet: its API docs could not be read automatically. See the README note.
const adapters: Partial<Record<MailProviderId, Adapter>> = { v1: grabV1, v2: smailsV2, v3: mailboxTempV3, v4: mailTmV4, v5: dropMailV5 };

/** Versions that are both built and switched on via TEMPMAIL_PROVIDERS (default: v1,v2,v3). */
export function enabledProviders(): MailProviderId[] {
  const wanted = (process.env.TEMPMAIL_PROVIDERS ?? "v1,v2,v3,v4,v5").split(",").map(x => x.trim().toLowerCase());
  return MAIL_PROVIDERS.filter(id => wanted.includes(id) && adapters[id]);
}
export function providerOptions(): ProviderOption[] { return enabledProviders().map(id => ({ id, label: providerLabel(id), note: PROVIDER_TRAITS[id].note, customName: PROVIDER_TRAITS[id].customName })); }
export function adapterFor(id: string): { adapter: Adapter; id: MailProviderId } {
  const ok = enabledProviders().find(p => p === id); if (!ok) throw new AppError("That mailbox version isn’t available right now.", 400);
  return { adapter: adapters[ok]!, id: ok };
}
/** Credits that the enabled services ask for in their terms. */
export function providerCredits(): MailCredit[] { return enabledProviders().includes("v4") ? [{ name: "mail.tm", url: "https://mail.tm" }] : []; }
export const canExtend = (id: MailProviderId) => Boolean(adapters[id]?.extend);

/** Runs an operation and, for token-based services, signs in again once if the token was rejected. */
export async function withAuth<T>(id: MailProviderId, box: BoxRef, run: (adapter: Adapter, box: BoxRef) => Promise<T>, saveSecret: (secret: string) => Promise<void>): Promise<T> {
  const adapter = adapters[id]; if (!adapter) throw busy();
  try { return await run(adapter, box); } catch (e) {
    if (e instanceof AppError && e.status === 401 && e.message === "auth" && adapter.reauth) { const secret = await adapter.reauth(box); await saveSecret(secret); return run(adapter, { ...box, secret }); }
    throw e;
  }
}
export function fullWithCode(m: MessageFull): MessageFull { return { ...m, code: m.code || extractCode(m.subject, m.text) }; }
