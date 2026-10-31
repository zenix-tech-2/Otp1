"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Headset, SendHorizontal } from "lucide-react";
import { api, useStore } from "./app-provider";
import { Spinner } from "./ui";

type Item = { id: string; sender: "customer" | "team"; body: string; at: string; legacy?: boolean; pending?: boolean; failed?: boolean };
const MAX = 2000;
const suggestions = ["My payment hasn’t arrived", "My number didn’t get a code", "I have a question about an order", "I need a custom service"];

function dayLabel(iso: string) {
  const d = new Date(iso); const today = new Date(); const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** A real conversation with the store team: bubbles, instant sending, and replies that arrive on their own. */
export function ChatPage() {
  const { user, accountLoading, openPanel } = useStore();
  const [items, setItems] = useState<Item[] | null>(null); const [text, setText] = useState(""); const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null); const box = useRef<HTMLTextAreaElement>(null); const stick = useRef(true); const busy = useRef(false);

  const merge = useCallback((server: Item[]) => setItems(prev => { const pending = (prev || []).filter(m => m.pending || m.failed); return [...server, ...pending]; }), []);
  const load = useCallback(async () => {
    if (!user || busy.current) return;
    try { const r = await api<{ messages: Item[] }>("/api/support?read=1"); merge(r.messages); setError(""); }
    catch (e) { setItems(prev => prev ?? []); if (!items) setError((e as Error).message || "We couldn’t load your messages."); }
  }, [user?.id, merge]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user) load(); }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const tick = () => { if (document.visibilityState === "visible") load(); };
    const timer = window.setInterval(tick, 5000); document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [user?.id, load]);

  useLayoutEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [items]);
  useEffect(() => { const el = box.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }, [text]);

  async function send(body = text) {
    const clean = body.trim(); if (!clean || !user) return;
    if (clean.length > MAX) { setError(`Keep messages under ${MAX} characters.`); return; }
    const temp: Item = { id: `tmp-${Date.now()}`, sender: "customer", body: clean, at: new Date().toISOString(), pending: true };
    stick.current = true; setError(""); setText(""); setItems(prev => [...(prev || []), temp]); busy.current = true;
    try { const r = await api<{ message: Item }>("/api/support", { method: "POST", body: JSON.stringify({ body: clean }) }); setItems(prev => (prev || []).map(m => m.id === temp.id ? r.message : m)); }
    catch (e) { setItems(prev => (prev || []).map(m => m.id === temp.id ? { ...m, pending: false, failed: true } : m)); setError((e as Error).message || "That message didn’t send."); }
    finally { busy.current = false; }
  }
  function retry(m: Item) { setItems(prev => (prev || []).filter(x => x.id !== m.id)); send(m.body); }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); } }
  function onScroll() { const el = scroller.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }

  const groups = useMemo(() => { const out: { day: string; rows: Item[] }[] = []; for (const m of items || []) { const day = dayLabel(m.at); const last = out[out.length - 1]; if (last && last.day === day) last.rows.push(m); else out.push({ day, rows: [m] }); } return out; }, [items]);
  const first = user?.name?.split(" ")[0] || "there";

  const header = <header className="chat-bar"><Link href="/account" className="chat-back" aria-label="Back"><ArrowLeft size={20} /></Link><span className="chat-avatar"><Headset size={19} /></span><div className="chat-title"><strong>Store OTP team</strong><small>Real people. Replies also arrive as notifications.</small></div></header>;

  if (accountLoading) return <div className="chat-screen">{header}<div className="chat-center"><Spinner /></div></div>;
  if (!user) return <div className="chat-screen">{header}<div className="chat-center chat-gate"><span className="chat-gate-icon"><Headset size={28} /></span><h2>Sign in to message us</h2><p>We’ll keep your conversation here so you can come back to it any time.</p><button className="button button-primary" onClick={() => openPanel("login")}>Sign in</button></div></div>;

  return <div className="chat-screen">{header}
    <div className="chat-scroll" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversation">
      {items === null ? <div className="chat-center"><Spinner /></div> : <div className="chat-thread">
        {!items.length && <>
          <div className="chat-day"><span>Today</span></div>
          <div className="chat-row team"><span className="chat-mini"><Headset size={14} /></span><div className="chat-bubble">Hi {first}! 👋 How can we help? Orders, numbers, payments or a custom request — write it here and a real person will reply.</div></div>
          <div className="chat-suggest">{suggestions.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
        </>}
        {groups.map(g => <div key={g.day}><div className="chat-day"><span>{g.day}</span></div>
          {g.rows.map(m => <div key={m.id} className={`chat-row ${m.sender}`}>
            {m.sender === "team" && <span className="chat-mini"><Headset size={14} /></span>}
            <div className={`chat-bubble${m.pending ? " is-pending" : ""}${m.failed ? " is-failed" : ""}${m.legacy ? " is-legacy" : ""}`}>{m.body}
              <span className="chat-meta">{m.failed ? <button onClick={() => retry(m)}>Not sent. Tap to retry</button> : m.pending ? "Sending…" : clock(m.at)}</span></div>
          </div>)}</div>)}
      </div>}
    </div>
    {error && <p className="chat-error" role="alert">{error}</p>}
    <div className="chat-composer"><textarea ref={box} rows={1} value={text} maxLength={MAX + 200} placeholder="Write a message…" aria-label="Message" onChange={e => setText(e.target.value)} onKeyDown={onKey} />
      <button className="chat-send" aria-label="Send message" disabled={!text.trim()} onClick={() => send()}><SendHorizontal size={20} /></button></div>
  </div>;
}
