"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, EllipsisVertical, ImageOff, Inbox, List, Mail, Menu, Paperclip, Plus, RefreshCw, ShieldAlert, Timer, Trash2, X } from "lucide-react";
import { api, useStore } from "./app-provider";
import { Spinner } from "./ui";
import type { MailCredit, MailboxView, MessageFull, MessageSummary, ProviderOption } from "@/lib/tempmail-core";

type Tab = "email" | "inbox" | "manage";
type Sheet = null | "actions" | "create" | "delete";
type Retired = { id: string; address: string; label: string };

const ago = (iso: string) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
const left = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); if (ms <= 0) return "Expired"; const m = Math.floor(ms / 60000); return m < 60 ? `${Math.max(1, m)} min left` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${Math.floor(m / 1440)}d left`; };
const sizeLabel = (n: number | null) => n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const initials = (m: { fromName: string; from: string }) => ((m.fromName || m.from || "?").trim()[0] || "?").toUpperCase();
async function copyText(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
function frameDoc(html: string, images: boolean) {
  const csp = `default-src 'none'; img-src data: ${images ? "https: http:" : ""}; style-src 'unsafe-inline'; font-src data:`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;margin:14px;color:#142344;background:#fff;word-break:break-word}img{max-width:100%;height:auto}a{color:#1754f5}</style>${html}`;
}

/** The green mail tile with a little ribbon, as on the Email screen. */
function MailTile() {
  return <svg className="tm-tile" viewBox="0 0 160 120" aria-hidden="true"><defs><linearGradient id="tmg" x1="0" y1="0" x2="0" y2="1"><stop className="tm-g1" offset="0"/><stop className="tm-g2" offset="1"/></linearGradient></defs>
    <path className="tm-ribbon" d="M112 22h26a4 4 0 0 1 4 4v50l-17-12-17 12V26a4 4 0 0 1 4-4Z"/>
    <rect x="18" y="14" width="96" height="96" rx="26" fill="url(#tmg)"/>
    <rect className="tm-tile-paper" x="34" y="42" width="64" height="44" rx="8"/><path className="tm-tile-line" d="M36 46l30 22 30-22" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
/** Dark open envelope used for the empty inbox. */
function EnvelopeArt() {
  return <svg className="tm-envelope" viewBox="0 0 330 330" aria-hidden="true"><path className="tm-env-flap" d="M20 120 160 24a28 28 0 0 1 30 0l120 80a30 30 0 0 1 14 25v130a30 30 0 0 1-30 30H36a30 30 0 0 1-30-30V145a30 30 0 0 1 14-25Z"/><path className="tm-env-line" d="M6 150 150 252a20 20 0 0 0 30 0L324 150" fill="none" strokeWidth="2"/></svg>;
}

export function TempMailPage() {
  const { user, accountLoading, openPanel, notify } = useStore();
  const [providers, setProviders] = useState<ProviderOption[]>([]); const [credits, setCredits] = useState<MailCredit[]>([]); const [boxes, setBoxes] = useState<MailboxView[] | null>(null); const [max, setMax] = useState(5); const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("email"); const [sheet, setSheet] = useState<Sheet>(null); const [activeId, setActiveId] = useState<string | null>(null); const [pickOpen, setPickOpen] = useState(false); const [manageTab, setManageTab] = useState<"active" | "inactive">("active"); const [retired, setRetired] = useState<Retired[]>([]);
  const [messages, setMessages] = useState<MessageSummary[] | null>(null); const [listError, setListError] = useState(""); const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null); const [detail, setDetail] = useState<MessageFull | null>(null); const [detailBusy, setDetailBusy] = useState(false); const [detailError, setDetailError] = useState(""); const [images, setImages] = useState(false);
  const [provider, setProvider] = useState(""); const [name, setName] = useState(""); const [createBusy, setCreateBusy] = useState(false); const [createError, setCreateError] = useState(""); const [deleteBusy, setDeleteBusy] = useState(false);
  const [copied, setCopied] = useState(""); const [, tick] = useState(0); const seen = useRef(new Set<string>()); const retiredKey = user ? `digisms:tempmail:retired:${user.id}` : "";
  const active = boxes?.find(b => b.id === activeId) || null;

  useEffect(() => { if (!retiredKey) return; try { setRetired(JSON.parse(localStorage.getItem(retiredKey) || "[]")); } catch { setRetired([]); } }, [retiredKey]);
  const retire = useCallback((b: MailboxView) => { setRetired(list => { const next = [{ id: b.id, address: b.address, label: b.label }, ...list.filter(x => x.id !== b.id)].slice(0, 12); try { if (retiredKey) localStorage.setItem(retiredKey, JSON.stringify(next)); } catch { /* ignore */ } return next; }); }, [retiredKey]);

  const loadBoxes = useCallback(async () => {
    const r = await api<{ providers: ProviderOption[]; credits: MailCredit[]; mailboxes: MailboxView[]; max: number }>("/api/tempmail");
    setProviders(r.providers); setCredits(r.credits); setMax(r.max); setProvider(p => p || r.providers[0]?.id || "");
    setBoxes(prev => { prev?.filter(old => !r.mailboxes.some(n => n.id === old.id)).forEach(retire); return r.mailboxes; });
    setActiveId(cur => (cur && r.mailboxes.some(b => b.id === cur) ? cur : r.mailboxes[0]?.id ?? null));
  }, [retire]);
  useEffect(() => { if (accountLoading) return; if (!user) { setBoxes([]); return; } loadBoxes().catch(e => { setError((e as Error).message); setBoxes([]); }); }, [user?.id, accountLoading, loadBoxes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!activeId) return; if (!quiet) setRefreshing(true);
    try { const r = await api<{ messages: MessageSummary[] }>(`/api/tempmail/${activeId}/messages`); setMessages(r.messages); setListError(""); }
    catch (e) { const msg = (e as Error).message; setListError(msg); if (/expired|not found/i.test(msg)) loadBoxes().catch(() => {}); }
    finally { setRefreshing(false); }
  }, [activeId, loadBoxes]);
  useEffect(() => { setMessages(null); setOpenId(null); setDetail(null); setListError(""); seen.current = new Set(); if (!activeId) return; refresh(true); const t = setInterval(() => { if (document.visibilityState === "visible") refresh(true); }, 7000); return () => clearInterval(t); }, [activeId, refresh]);
  useEffect(() => { if (!messages) return; if (seen.current.size && messages.some(m => !seen.current.has(m.id))) notify("New email arrived."); seen.current = new Set(messages.map(m => m.id)); }, [messages, notify]);
  useEffect(() => { if (!sheet && !pickOpen) return; const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setSheet(null); setPickOpen(false); } }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [sheet, pickOpen]);

  async function openMessage(id: string) {
    setOpenId(id); setDetail(null); setDetailError(""); setDetailBusy(true); setImages(false);
    try { const r = await api<{ message: MessageFull }>(`/api/tempmail/${activeId}/messages/${encodeURIComponent(id)}`); setDetail(r.message); setMessages(list => list?.map(m => m.id === id ? { ...m, seen: true } : m) ?? list); }
    catch (e) { setDetailError((e as Error).message); } finally { setDetailBusy(false); }
  }
  async function deleteMessage() {
    if (!openId) return; const id = openId;
    try { await api(`/api/tempmail/${activeId}/messages/${encodeURIComponent(id)}`, { method: "DELETE" }); setMessages(l => l?.filter(m => m.id !== id) ?? l); setOpenId(null); setDetail(null); } catch (e) { notify((e as Error).message, "error"); }
  }
  async function create() {
    setCreateBusy(true); setCreateError("");
    try { const r = await api<{ mailbox: MailboxView }>("/api/tempmail", { method: "POST", body: JSON.stringify({ provider, name: name.trim() }) }); setBoxes(b => [r.mailbox, ...(b || [])]); setActiveId(r.mailbox.id); setTab("email"); setSheet(null); setName(""); }
    catch (e) { setCreateError((e as Error).message); } finally { setCreateBusy(false); }
  }
  async function removeBox(box: MailboxView) {
    setDeleteBusy(true);
    try { await api(`/api/tempmail/${box.id}`, { method: "DELETE" }); setBoxes(b => b?.filter(x => x.id !== box.id) ?? b); retire(box); if (box.id === activeId) setActiveId(null); setSheet(null); await loadBoxes(); } catch (e) { notify((e as Error).message, "error"); } finally { setDeleteBusy(false); }
  }
  async function extend() { if (!active) return; setSheet(null); try { const r = await api<{ mailbox: MailboxView }>(`/api/tempmail/${active.id}`, { method: "POST", body: "{}" }); setBoxes(b => b?.map(x => x.id === r.mailbox.id ? r.mailbox : x) ?? b); notify("Mailbox extended."); } catch (e) { notify((e as Error).message, "error"); } }
  async function doCopy(text: string, key: string) { if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied(""), 1600); } else notify("Couldn’t copy. Select and copy it manually.", "error"); }
  const current = providers.find(p => p.id === provider); const frame = useMemo(() => detail?.html ? frameDoc(detail.html, images) : "", [detail?.html, images]);
  const unread = messages?.filter(m => !m.seen).length ?? 0; const canCreate = (boxes?.length ?? 0) < max && providers.length > 0;
  function openCreate() { setCreateError(""); setSheet("create"); }

  const credit = credits.length > 0 && <p className="tm-credit">Some mailboxes are powered in part by {credits.map((c, i) => <span key={c.url}>{i > 0 && ", "}<a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a></span>)}.</p>;
  const titles: Record<Tab, string> = { email: "Temp Mail", inbox: "Inbox", manage: "Email Addresses" };
  const reading = tab === "inbox" && openId;
  const right = reading ? null : tab === "inbox" ? <button className="tm-round" aria-label="Refresh inbox" onClick={() => refresh()} disabled={refreshing || !activeId}><RefreshCw size={20} className={refreshing ? "spin" : ""}/></button> : tab === "manage" ? <button className="tm-round tm-round-green" aria-label="New email" onClick={openCreate} disabled={!canCreate}><Plus size={22}/></button> : <span className="tm-round-space"/>;

  const bar = <header className="tm-bar">{reading ? <button className="tm-round" aria-label="Back to inbox" onClick={() => { setOpenId(null); setDetail(null); }}><ArrowLeft size={20}/></button> : <button className="tm-round" aria-label="Open menu" onClick={() => openPanel("menu")}><Menu size={22}/></button>}<h1>{reading ? "Message" : titles[tab]}</h1>{right || <span className="tm-round-space"/>}</header>;
  const shell = (body: ReactNode, showTabs = true) => <div className="tm-app"><div className="tm-frame-col">{bar}<div className="tm-scroll">{body}</div>{showTabs && <nav className="tm-tabs" aria-label="Temp mail sections">{([["email", "Email", Mail], ["inbox", "Inbox", Inbox], ["manage", "Manage", List]] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); setOpenId(null); setDetail(null); setPickOpen(false); }}><span className="tm-tab-icon"><Icon size={26}/>{id === "inbox" && unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}</span>{label}</button>)}</nav>}</div>{sheetView}</div>;

  const sheetView = sheet && <div className="tm-sheet-scrim" onClick={() => setSheet(null)}><section className="tm-sheet" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
    <button className="tm-sheet-x" aria-label="Close" onClick={() => setSheet(null)}><X size={20}/></button>
    {sheet === "actions" && <><button className="tm-sheet-btn" disabled={!canCreate} onClick={openCreate}>Create New</button>{active?.canExtend && <button className="tm-sheet-btn" onClick={extend}><Timer size={18}/>Add time</button>}<button className="tm-sheet-btn tm-danger" disabled={!active} onClick={() => setSheet("delete")}><Trash2 size={19}/>Delete</button><button className="tm-sheet-btn tm-sheet-cancel" onClick={() => setSheet(null)}>Cancel</button>{!canCreate && boxes && boxes.length >= max && <p className="tm-sheet-note">You have {max} open mailboxes. Delete one to create another.</p>}</>}
    {sheet === "delete" && active && <><h2>Delete this email?</h2><p className="tm-sheet-note">{active.address} and everything in it will be removed.</p><button className="tm-sheet-btn tm-danger" disabled={deleteBusy} onClick={() => removeBox(active)}>{deleteBusy ? <Spinner size={16}/> : <><Trash2 size={19}/>Delete</>}</button><button className="tm-sheet-btn tm-sheet-cancel" onClick={() => setSheet(null)}>Cancel</button></>}
    {sheet === "create" && <><h2>New email</h2>{!providers.length ? <p className="tm-sheet-note">Temp mail isn’t available right now. Please check back soon.</p> : <>
      <div className="tm-providers" role="radiogroup" aria-label="Mailbox version">{providers.map(p => <button key={p.id} type="button" role="radio" aria-checked={p.id === provider} className={p.id === provider ? "on" : ""} onClick={() => setProvider(p.id)}><strong>{p.label}</strong><small>{p.note}</small></button>)}</div>
      {current?.customName && <label className="tm-name"><span>Address name (optional)</span><input value={name} maxLength={30} placeholder="Leave blank for a random one" autoComplete="off" autoCapitalize="none" onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}/></label>}
      {createError && <p className="tm-error" role="alert">{createError}</p>}
      <button className="tm-green" disabled={createBusy || !provider} onClick={create}>{createBusy ? <Spinner size={18}/> : "Create email"}</button>
      <p className="tm-sheet-note"><ShieldAlert size={13}/>Anyone who knows an address can read its inbox. Don’t use temp mail for banking or anything you need to recover later.</p></>}</>}
  </section></div>;

  if (accountLoading || boxes === null) return shell(<div className="tm-center"><Spinner size={28}/></div>, false);
  if (!user) return shell(<div className="tm-center tm-signin"><span className="tm-signin-art"><Mail size={34}/></span><h2>Sign in to open a mailbox</h2><p>Your mailboxes are tied to your account so only you can read them.</p><button className="tm-green" onClick={() => openPanel("login")}>Sign in</button><Link href="/" className="tm-link">Back to home</Link></div>, false);

  // ── Email ──
  const emailScreen = <div className="tm-pad">{error && <p className="tm-error" role="alert">{error}</p>}
    <div className="tm-card-wrap"><div className="tm-card"><svg className="tm-flap" viewBox="0 0 330 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tmf" x1="0" y1="0" x2="0" y2="1"><stop className="tm-f1" offset="0"/><stop className="tm-f2" offset="1"/></linearGradient></defs><path className="tm-flap-path" d="M0 28 150 136a22 22 0 0 0 30 0L330 28V0H0Z" fill="url(#tmf)" strokeWidth="1"/></svg>
      <button className="tm-kebab" aria-label="More options" onClick={() => setSheet("actions")}><EllipsisVertical size={20}/></button><MailTile/>
      {active ? <><p className="tm-address">{active.address}</p><p className="tm-sub">Your Temporary Email Address</p><p className="tm-meta">{active.label} · {left(active.expiresAt)}</p><button className="tm-green" onClick={() => doCopy(active.address, "addr")}>{copied === "addr" ? <><Check size={20}/>Copied</> : <><Copy size={20}/>Copy email</>}</button></> :
        <><p className="tm-address tm-none">No email yet</p><p className="tm-sub">Create a temporary address in one tap</p><p className="tm-meta">&nbsp;</p><button className="tm-green" disabled={!canCreate} onClick={openCreate}><Plus size={20}/>Create email</button></>}</div></div>
    {active && <button className="tm-change" onClick={openCreate} disabled={!canCreate}><RefreshCw size={18}/>Change</button>}
    {credit}</div>;

  // ── Inbox ──
  const picker = <div className="tm-picker"><button className="tm-select" aria-haspopup="listbox" aria-expanded={pickOpen} disabled={!boxes.length} onClick={() => setPickOpen(o => !o)}><span>{active?.address || "No email yet"}</span><ChevronDown size={22} className={pickOpen ? "flip" : ""}/></button>
    {pickOpen && <><div className="tm-pick-scrim" onClick={() => setPickOpen(false)}/><ul className="tm-options" role="listbox">{boxes.map(b => <li key={b.id}><button role="option" aria-selected={b.id === activeId} className={b.id === activeId ? "on" : ""} onClick={() => { setActiveId(b.id); setPickOpen(false); }}><span>{b.address}</span><small>{b.label}</small></button></li>)}</ul></>}</div>;
  const reader = <div className="tm-pad tm-reader" aria-live="polite">
    {detailBusy ? <div className="tm-center"><Spinner size={26}/></div> : detailError ? <p className="tm-error" role="alert">{detailError}</p> : detail && <>
      <h2 className="tm-r-subject">{detail.subject || "(no subject)"}</h2>
      <div className="tm-r-from"><span className="tm-avatar">{initials(detail)}</span><div><strong>{detail.fromName || detail.from}</strong>{detail.fromName && <small>{detail.from}</small>}</div><time>{new Date(detail.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></div>
      {detail.code && <div className="tm-code"><div><small>Verification code</small><strong>{detail.code}</strong></div><button className="tm-green tm-green-sm" onClick={() => doCopy(detail.code!, "code")}>{copied === "code" ? <><Check size={16}/>Copied</> : <><Copy size={16}/>Copy</>}</button></div>}
      {detail.html ? <>{!images && <div className="tm-images"><ImageOff size={14}/>Remote images are blocked to protect your privacy.<button onClick={() => setImages(true)}>Show images</button></div>}<iframe className="tm-mailframe" title="Email content" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={frame}/></> : <pre className="tm-text">{detail.text || "This message has no content."}</pre>}
      {detail.attachments.length > 0 && <div className="tm-attachments"><h4><Paperclip size={14}/>Attachments</h4>{detail.attachments.map((a, i) => <span key={i}>{a.name}<small>{sizeLabel(a.size)}</small></span>)}<p>Attachments can’t be downloaded here.</p></div>}
      <button className="tm-ghost-danger" onClick={deleteMessage}><Trash2 size={16}/>Delete message</button></>}</div>;
  const inboxScreen = reading ? reader : <div className="tm-pad">{picker}{listError && <p className="tm-error" role="alert">{listError}</p>}
    {!active ? <div className="tm-envelope-card"><EnvelopeArt/><p className="tm-env-text">Create an email first to start receiving mail.</p><button className="tm-soft" disabled={!canCreate} onClick={openCreate}><Plus size={20}/>Create email</button></div> :
      messages && messages.length ? <ul className="tm-msgs">{messages.map(m => <li key={m.id}><button className={`tm-msg ${m.seen ? "" : "unread"}`} onClick={() => openMessage(m.id)}><span className="tm-avatar">{initials(m)}</span><span className="tm-msg-main"><span className="tm-msg-top"><strong>{m.fromName || m.from || "Unknown sender"}</strong><time>{ago(m.date)}</time></span><span className="tm-msg-subject">{m.subject || "(no subject)"}</span>{(m.code || m.hasAttachments) && <span className="tm-chips">{m.code && <span className="tm-chip">Code {m.code}</span>}{m.hasAttachments && <Paperclip size={13}/>}</span>}</span></button></li>)}</ul> :
      <div className="tm-envelope-card"><EnvelopeArt/><p className="tm-env-text">{messages === null && !listError ? "Checking for mail…" : "No messages yet. New mail appears here automatically."}</p><button className="tm-soft" onClick={() => refresh()} disabled={refreshing}><RefreshCw size={20} className={refreshing ? "spin" : ""}/>Refresh</button></div>}</div>;

  // ── Manage ──
  const manageScreen = <div className="tm-pad"><div className="tm-seg" role="tablist"><button role="tab" aria-selected={manageTab === "active"} className={manageTab === "active" ? "on" : ""} onClick={() => setManageTab("active")}>Active</button><button role="tab" aria-selected={manageTab === "inactive"} className={manageTab === "inactive" ? "on" : ""} onClick={() => setManageTab("inactive")}>Not Active</button></div>
    {manageTab === "active" ? (boxes.length ? <ul className="tm-addr-list">{boxes.map(b => <li key={b.id} className={b.id === activeId ? "on" : ""}><button className="tm-addr-main" onClick={() => { setActiveId(b.id); setTab("email"); }}><strong>{b.address}</strong><small>{b.label} · {left(b.expiresAt)}</small></button><button className="tm-addr-del" aria-label={`Delete ${b.address}`} onClick={() => { setActiveId(b.id); setSheet("delete"); }}><Trash2 size={18}/></button></li>)}</ul> : <div className="tm-dashed">You don’t have any active emails yet. Tap + to create one.</div>)
      : retired.length ? <ul className="tm-addr-list tm-faded">{retired.map(r => <li key={r.id}><div className="tm-addr-main"><strong>{r.address}</strong><small>{r.label} · no longer available</small></div></li>)}</ul> : <div className="tm-dashed">This mailboxes are not available anymore. The domain has been removed.</div>}
    {credit}</div>;

  return shell(tab === "email" ? emailScreen : tab === "inbox" ? inboxScreen : manageScreen);
}
