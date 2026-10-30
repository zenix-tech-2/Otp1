"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, BellOff, BellRing, CheckCheck, Gift, Headset, Mail, Megaphone, Package, Smartphone, Sparkles, TrendingUp, Wallet, X } from "lucide-react";
import { api, useStore } from "./app-provider";
import { usePwa } from "./pwa-provider";
import { Spinner } from "./ui";

export type InboxItem = { id: string; kind: string; title: string; body: string; url: string | null; readAt: string | null; createdAt: string };
type Inbox = { items: InboxItem[]; unread: number; loading: boolean; refresh: () => Promise<void>; markRead: (ids?: string[]) => Promise<void> };
const InboxContext = createContext<Inbox | null>(null);
const POLL_MS = 25_000;
export function InboxProvider({ children }: { children: ReactNode }) {
  const { user, notify } = useStore(); const [items, setItems] = useState<InboxItem[]>([]); const [unread, setUnread] = useState(0); const [loading, setLoading] = useState(false);
  const seen = useRef<Set<string> | null>(null); const userId = user?.id; const busy = useRef(false);
  const apply = useCallback((data: { items: InboxItem[]; unread: number }, announce: boolean) => {
    setItems(data.items); setUnread(data.unread);
    if (seen.current && announce) for (const item of data.items.slice().reverse()) if (!item.readAt && !seen.current.has(item.id)) notify(item.title + (item.body ? ` — ${item.body}` : ""));
    seen.current = new Set(data.items.map(i => i.id));
  }, [notify]);
  const refresh = useCallback(async () => {
    if (!userId || busy.current) return; busy.current = true;
    try { apply(await api<{ items: InboxItem[]; unread: number }>("/api/notifications"), true); } catch { /* offline or signed out: try again on the next tick */ } finally { busy.current = false; setLoading(false); }
  }, [userId, apply]);
  useEffect(() => {
    seen.current = null; setItems([]); setUnread(0); if (!userId) return; setLoading(true); refresh();
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(tick, POLL_MS); const wake = () => tick(); const manual = () => refresh();
    const onWorker = (event: MessageEvent) => { if (event.data?.type === "PUSH_RECEIVED") refresh(); }; navigator.serviceWorker?.addEventListener("message", onWorker);
    document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake); window.addEventListener("online", wake); window.addEventListener("storeotp:inbox-refresh", manual);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); window.removeEventListener("storeotp:inbox-refresh", manual); navigator.serviceWorker?.removeEventListener("message", onWorker); };
  }, [userId, refresh]);
  const markRead = useCallback(async (ids?: string[]) => {
    const now = new Date().toISOString(); setItems(list => list.map(i => (!ids || ids.includes(i.id)) && !i.readAt ? { ...i, readAt: now } : i)); setUnread(n => ids ? Math.max(0, n - ids.length) : 0);
    try { await api("/api/notifications", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }); } catch { refresh(); }
  }, [refresh]);
  const value = useMemo(() => ({ items, unread, loading, refresh, markRead }), [items, unread, loading, refresh, markRead]);
  return <InboxContext.Provider value={value}>{children}<PushKeeper /></InboxContext.Provider>;
}
export function useInbox() { const value = useContext(InboxContext); if (!value) throw new Error("Inbox provider is missing"); return value; }

/* ---------- web push (browser side) ---------- */
function keyBytes(base64Url: string) { const padded = (base64Url + "=".repeat((4 - base64Url.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(padded); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function subscribeThisDevice(publicKey: string) {
  const registration = await navigator.serviceWorker.ready; let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  await api("/api/push", { method: "POST", body: JSON.stringify(subscription.toJSON()) }); return subscription;
}
// Keeps the server's copy of this device's subscription fresh (browsers rotate them) when notifications were already allowed.
function PushKeeper() {
  const { user } = useStore(); const userId = user?.id;
  useEffect(() => {
    if (!userId || !pushSupported() || Notification.permission !== "granted") return; let cancelled = false;
    const sync = async () => { try { const status = await api<{ configured: boolean; publicKey: string | null }>("/api/push"); if (!cancelled && status.configured && status.publicKey) await subscribeThisDevice(status.publicKey); } catch { /* retried next visit */ } };
    sync(); const onMessage = (event: MessageEvent) => { if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") sync(); };
    navigator.serviceWorker.addEventListener("message", onMessage); return () => { cancelled = true; navigator.serviceWorker.removeEventListener("message", onMessage); };
  }, [userId]);
  return null;
}
type PushState = "loading" | "unsupported" | "unconfigured" | "ios-install" | "blocked" | "off" | "on";
export function usePushToggle() {
  const { user, notify } = useStore(); const { platform, installed } = usePwa(); const [state, setState] = useState<PushState>("loading"); const [busy, setBusy] = useState(false); const [publicKey, setPublicKey] = useState<string | null>(null);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) { setState("off"); return; } let cancelled = false;
    (async () => {
      if (!pushSupported()) { if (!cancelled) setState(platform === "ios" && !installed ? "ios-install" : "unsupported"); return; }
      try {
        const status = await api<{ configured: boolean; publicKey: string | null }>("/api/push"); if (cancelled) return;
        if (!status.configured || !status.publicKey) { setState("unconfigured"); return; } setPublicKey(status.publicKey);
        if (Notification.permission === "denied") { setState("blocked"); return; }
        const registration = await navigator.serviceWorker.ready; const existing = await registration.pushManager.getSubscription(); if (!cancelled) setState(existing && Notification.permission === "granted" ? "on" : "off");
      } catch { if (!cancelled) setState("off"); }
    })(); return () => { cancelled = true; };
  }, [userId, platform, installed]);
  const enable = useCallback(async () => {
    if (!publicKey) return; setBusy(true);
    try {
      const asked = await Promise.race([Notification.requestPermission(), new Promise<"timeout">(r => window.setTimeout(() => r("timeout"), 12000))]);
      const permission = asked === "timeout" ? Notification.permission : asked;
      if (permission !== "granted") { setState(permission === "denied" || asked === "timeout" ? "blocked" : "off"); if (asked === "timeout" || permission === "denied") notify("Notifications are blocked for this app. Turn them on in your phone’s settings, then try again.", "error"); return; }
      await subscribeThisDevice(publicKey); setState("on"); notify("Push notifications are on for this device.");
    } catch (e) { notify((e as Error).message || "We couldn’t turn on notifications on this device.", "error"); } finally { setBusy(false); }
  }, [publicKey, notify]);
  const disable = useCallback(async () => {
    setBusy(true);
    try { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (subscription) { await api("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {}); await subscription.unsubscribe(); } setState("off"); notify("Push notifications are off for this device."); }
    finally { setBusy(false); }
  }, [notify]);
  return { state, busy, enable, disable };
}
export function PushCard() {
  const { state, busy, enable, disable } = usePushToggle();
  if (state === "loading" || state === "unconfigured") return null;
  const copy: Record<Exclude<PushState, "loading" | "unconfigured">, { title: string; text: string }> = {
    on: { title: "Push notifications are on", text: "We’ll alert this device about purchases, SMS codes, new emails, news, gifts and wallet activity, even when the app is closed." },
    off: { title: "Get alerts the moment things happen", text: "Turn on push notifications for purchases, SMS codes, new emails, news, updates, gifts and wallet top-ups." },
    blocked: { title: "Notifications are blocked", text: "Allow notifications for this site in your browser settings, then come back and turn them on." },
    unsupported: { title: "Push isn’t available here", text: "This browser doesn’t support push notifications. You’ll still see everything in this inbox." },
    "ios-install": { title: "Install the app to get push on iPhone", text: "On iPhone and iPad, push works after you tap Share → Add to Home Screen and open Store OTP from there." },
  };
  const c = copy[state];
  return <div className={`push-card push-${state}`}><span className="push-card-icon">{state === "on" ? <BellRing size={22} /> : state === "off" ? <Bell size={22} /> : <BellOff size={22} />}</span><div><strong>{c.title}</strong><p>{c.text}</p></div>{(state === "on" || state === "off") && <button className={`button ${state === "on" ? "button-secondary" : "button-primary"} button-small`} disabled={busy} onClick={state === "on" ? disable : enable}>{busy ? <Spinner /> : state === "on" ? "Turn off" : "Turn on"}</button>}</div>;
}
const kindIcon: Record<string, typeof Bell> = { order: Package, gift: Gift, wallet: Wallet, boost: TrendingUp, number: Smartphone, mail: Mail, news: Megaphone, support: Headset, system: Sparkles };
export function timeAgo(iso: string) { const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (seconds < 60) return "just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`; return new Date(iso).toLocaleDateString(); }
export function InboxList() {
  const { items, unread, loading, markRead } = useInbox(); const { user } = useStore();
  if (!user) return <div className="inbox-empty"><Bell size={28} /><strong>Sign in to see your alerts</strong><p>Orders, gifts and wallet activity show up here.</p></div>;
  if (loading && !items.length) return <div className="loading-state"><Spinner /></div>;
  if (!items.length) return <div className="inbox-empty"><Bell size={28} /><strong>You’re all caught up</strong><p>Order updates, gifts and wallet activity will appear here as they happen.</p></div>;
  return <div className="inbox-list">{unread > 0 && <button className="text-link-button inbox-markall" onClick={() => markRead()}><CheckCheck size={14} />Mark all as read</button>}{items.map(item => { const Icon = kindIcon[item.kind] || Bell; const inner = <><span className={`inbox-icon inbox-${item.kind}`}><Icon size={19} /></span><div><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}<time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time></div>{!item.readAt && <i className="inbox-unread" aria-label="Unread" />}</>; return item.url ? <Link key={item.id} href={item.url} className={`inbox-item ${item.readAt ? "" : "is-unread"}`} onClick={() => !item.readAt && markRead([item.id])}>{inner}</Link> : <button key={item.id} className={`inbox-item ${item.readAt ? "" : "is-unread"}`} onClick={() => !item.readAt && markRead([item.id])}>{inner}</button>; })}</div>;
}

const ASK_KEY = "storeotp:push-ask";
/** Asks once, a few seconds after sign-in, to allow phone notifications. Permission has to come from a tap, so this shows a small card with an Allow button. */
export function PushPrompt() {
  const { user } = useStore(); const { state, busy, enable } = usePushToggle(); const [show, setShow] = useState(false);
  useEffect(() => {
    if (!user || state !== "off" || (typeof Notification !== "undefined" && Notification.permission === "denied")) { setShow(false); return; }
    let snoozed = false; try { snoozed = Date.now() < Number(localStorage.getItem(ASK_KEY) || 0); } catch { /* storage unavailable: ask anyway */ }
    if (snoozed) return; const timer = window.setTimeout(() => setShow(true), 5000); return () => window.clearTimeout(timer);
  }, [user, state]);
  function later(days: number) { try { localStorage.setItem(ASK_KEY, String(Date.now() + days * 86400_000)); } catch { /* ignore */ } setShow(false); }
  if (!show || state !== "off") return null;
  return <div className="push-ask" role="dialog" aria-label="Turn on notifications"><span className="push-ask-icon"><BellRing size={22} /></span>
    <div><strong>Turn on notifications</strong><p>Get alerted instantly for SMS codes, new emails, purchases, news and updates, even when the app is closed.</p>
      <div className="push-ask-actions"><button className="button button-primary button-small" disabled={busy} onClick={async () => { await enable(); setShow(false); }}>{busy ? <Spinner size={14} /> : "Allow notifications"}</button><button className="button button-secondary button-small" onClick={() => later(3)}>Not now</button></div></div>
    <button className="push-ask-x" aria-label="Dismiss" onClick={() => later(7)}><X size={16} /></button></div>;
}
