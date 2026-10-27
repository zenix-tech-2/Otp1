"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Headset, ImagePlus, Package, RotateCcw, Send, Sparkles, X } from "lucide-react";
import type { AssistantResult, ChatCard } from "@/lib/ai-assistant";
import { api, useMoney, useStore } from "./app-provider";
import { DevIcon } from "./dev-pages";
import { BrandIcon, Spinner } from "./ui";

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; cards?: ChatCard[]; images?: number; error?: boolean; escalated?: boolean };
type Attachment = { id: string; mediaType: "image/jpeg"; data: string; preview: string };
const STORE_KEY = "digisms:ai-chat:v1";
const suggestions = ["What can I buy here?", "I need a number for WhatsApp", "I want a Telegram bot built", "My payment is still pending"];
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

// Scales a picked image down so it uploads quickly and stays within the provider's size limits.
async function toJpeg(file: File): Promise<Attachment> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image or screenshot.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large. Choose one under 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error("We couldn’t read that image.")); el.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height)); const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Your browser can’t process images.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82); const data = dataUrl.split(",")[1] || "";
    if (data.length > 1_400_000) throw new Error("That image is still too large. Try a smaller screenshot.");
    return { id: uid(), mediaType: "image/jpeg", data, preview: dataUrl };
  } finally { URL.revokeObjectURL(url); }
}

function Rich({ text }: { text: string }) {
  const inline = (line: string): ReactNode[] => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
  const blocks: ReactNode[] = []; let bullets: string[] = [];
  const flush = () => { if (bullets.length) { blocks.push(<ul key={`u${blocks.length}`}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; } };
  for (const raw of text.split("\n")) { const line = raw.trim(); const m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/); if (m) bullets.push(m[1]); else { flush(); if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>); } }
  flush(); return <>{blocks}</>;
}

function CardView({ card, onOpen }: { card: ChatCard; onOpen: () => void }) {
  const { price, money } = useMoney();
  if (card.type === "product") return <Link href={card.href} onClick={onOpen} className="ai-card"><span className="ai-card-media">{card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <BrandIcon brand={card.brand.toLowerCase()} size={44} />}</span><span className="ai-card-body"><small>{card.brand}</small><strong>{card.name}</strong><span className="ai-card-price">{price(card.price)}{card.comparePrice && card.comparePrice > card.price ? <s>{price(card.comparePrice)}</s> : null}</span></span><span className={`ai-card-cta ${card.inStock ? "" : "ai-card-out"}`}>{card.inStock ? <>View & buy<ArrowRight size={13} /></> : "Out of stock"}</span></Link>;
  if (card.type === "number_service") return <Link href={card.href} onClick={onOpen} className="ai-card"><span className="ai-card-media"><BrandIcon brand={card.brand} logo={card.logo} size={44} /></span><span className="ai-card-body"><small>Virtual number</small><strong>{card.name}</strong></span><span className="ai-card-cta">Get a number<ArrowRight size={13} /></span></Link>;
  if (card.type === "dev_type") return <Link href={card.href} onClick={onOpen} className="ai-card"><span className="ai-card-media ai-card-icon"><DevIcon name={card.icon} size={24} /></span><span className="ai-card-body"><small>Websites & Bots</small><strong>{card.name}</strong><span className="ai-card-text">{card.tagline}</span></span><span className="ai-card-cta">Start a brief<ArrowRight size={13} /></span></Link>;
  if (card.type === "order") return <Link href={card.href} onClick={onOpen} className="ai-card"><span className="ai-card-media ai-card-icon"><Package size={22} /></span><span className="ai-card-body"><small>{card.status}</small><strong>{card.title}</strong><span className="ai-card-price">{money(card.amount, card.currency)}</span></span><span className="ai-card-cta">View order<ArrowRight size={13} /></span></Link>;
  return <Link href={card.href} onClick={onOpen} className="ai-link-card">{card.label}<ArrowRight size={13} /></Link>;
}

export function AiChat() {
  const { user, openPanel } = useStore(); const pathname = usePathname();
  const [open, setOpen] = useState(false); const [messages, setMessages] = useState<ChatMessage[]>([]); const [input, setInput] = useState(""); const [images, setImages] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [enabled, setEnabled] = useState<boolean | null>(null); const [loaded, setLoaded] = useState(false);
  const panel = useRef<HTMLElement>(null); const scroller = useRef<HTMLDivElement>(null); const picker = useRef<HTMLInputElement>(null); const field = useRef<HTMLTextAreaElement>(null); const userId = user?.id || "guest";
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => { const handler = () => setOpen(true); window.addEventListener("digisms:open-assistant", handler); return () => window.removeEventListener("digisms:open-assistant", handler); }, []);
  // Restore a recent chat, but never across different accounts on a shared device.
  useEffect(() => { try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const d = JSON.parse(raw); if (d?.userId === userId && Date.now() - Number(d.at) < 86400000 && Array.isArray(d.messages)) setMessages(d.messages); else localStorage.removeItem(STORE_KEY); } } catch { /* storage unavailable */ } setLoaded(true); }, [userId]);
  useEffect(() => { if (!loaded) return; try { if (messages.length) localStorage.setItem(STORE_KEY, JSON.stringify({ userId, at: Date.now(), messages: messages.slice(-30) })); else localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ } }, [messages, loaded, userId]);
  useEffect(() => { if (open && enabled === null) api<{ enabled: boolean }>("/api/ai/chat").then(r => setEnabled(r.enabled)).catch(() => setEnabled(true)); }, [open, enabled]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, open]);
  useEffect(() => { if (!open || typeof window === "undefined" || window.innerWidth >= 900) return; const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, [open]);
  // On phones the on-screen keyboard shrinks the visual viewport; keep the whole chat (and its input) above it.
  useEffect(() => {
    if (!open || typeof window === "undefined" || window.innerWidth >= 900 || !window.visualViewport) return;
    const vv = window.visualViewport; const apply = () => { const el = panel.current; if (!el) return; el.style.height = `${vv.height}px`; el.style.top = `${vv.offsetTop}px`; };
    apply(); vv.addEventListener("resize", apply); vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); if (panel.current) { panel.current.style.height = ""; panel.current.style.top = ""; } };
  }, [open]);
  const closeOnMobile = useCallback(() => { if (typeof window !== "undefined" && window.innerWidth < 900) setOpen(false); }, []);

  async function send(raw: string, retryOf?: string) {
    const text = raw.trim(); if ((!text && !images.length) || busy) return;
    const content = text || "Please look at the attached screenshot.";
    const history = retryOf ? messages.filter(m => m.id !== retryOf && !m.error) : messages.filter(m => !m.error);
    const mine: ChatMessage = { id: uid(), role: "user", text: content, images: images.length || undefined };
    const next = retryOf ? history : [...history, mine]; const sentImages = images;
    setMessages(retryOf ? history : [...messages.filter(m => !m.error), mine]); setInput(""); setImages([]); setBusy(true); setNotice("");
    try {
      const payload = { messages: next.slice(-16).map(m => ({ role: m.role, text: m.text })), images: sentImages.map(i => ({ mediaType: i.mediaType, data: i.data })) };
      const r = await api<AssistantResult>("/api/ai/chat", { method: "POST", body: JSON.stringify(payload) });
      setMessages(m => [...m, { id: uid(), role: "assistant", text: r.reply, cards: r.cards?.length ? r.cards : undefined, escalated: !!r.escalated }]);
    } catch (e) { setMessages(m => [...m, { id: uid(), role: "assistant", text: (e as Error).message, error: true }]); }
    finally { setBusy(false); requestAnimationFrame(() => field.current?.focus()); }
  }
  async function attach(files: FileList | null) {
    if (!files?.length) return; setNotice("");
    try { const picked: Attachment[] = []; for (const file of Array.from(files).slice(0, 3 - images.length)) picked.push(await toJpeg(file)); setImages(a => [...a, ...picked].slice(0, 3)); }
    catch (e) { setNotice((e as Error).message); } finally { if (picker.current) picker.current.value = ""; }
  }
  function reset() { if (messages.length && !confirm("Start a new chat? This clears the current conversation.")) return; setMessages([]); setImages([]); setInput(""); setNotice(""); }
  function human() { setOpen(false); openPanel("support"); }

  if (admin) return null;
  const lastUserText = [...messages].reverse().find(m => m.role === "user")?.text;
  return <>
    {open && <section ref={panel} className="ai-panel" role="dialog" aria-label="Digi AI assistant">
      <header className="ai-header"><span className="ai-avatar"><Sparkles size={20} /></span><div className="ai-title"><strong>Digi AI</strong><span><i />Digisms assistant · replies instantly</span></div>
        <button className="ai-icon" aria-label="Talk to a person" title="Talk to a person" onClick={human}><Headset size={18} /></button>
        <button className="ai-icon" aria-label="Start a new chat" title="New chat" onClick={reset}><RotateCcw size={18} /></button>
        <button className="ai-icon" aria-label="Close assistant" onClick={() => setOpen(false)}><X size={20} /></button></header>
      <div className="ai-messages" ref={scroller}>
        {!messages.length && <div className="ai-welcome"><span className="ai-avatar ai-avatar-large"><Sparkles size={34} /></span><h2>Hi, I’m Digi AI 👋</h2><p>Ask me about products, virtual numbers, websites and bots, your wallet or your orders. You can also send a screenshot.</p>
          {enabled === false ? <div className="ai-offline"><p>The assistant isn’t switched on yet. Our team can still help you.</p><button className="button button-primary" onClick={human}>Contact support<ArrowRight size={14} /></button></div> : <div className="ai-chips">{suggestions.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}</div>}
        {messages.map(m => <div key={m.id} className={`ai-row ai-row-${m.role}`}><div className={`ai-bubble ai-bubble-${m.role} ${m.error ? "ai-bubble-error" : ""}`}>{m.images ? <small className="ai-attached"><ImagePlus size={12} />{m.images} image{m.images === 1 ? "" : "s"} attached</small> : null}<Rich text={m.text} />
          {m.error && lastUserText && <button className="ai-retry" onClick={() => send(lastUserText, m.id)}>Try again</button>}</div>
          {m.escalated && <div className="ai-escalated"><Headset size={13} />Sent to our support team. Follow the reply in <Link href="/support" onClick={closeOnMobile}>Support</Link>.</div>}
          {m.cards && <div className="ai-cards">{m.cards.map((c, i) => <CardView key={`${c.type}-${i}`} card={c} onOpen={closeOnMobile} />)}</div>}</div>)}
        {busy && <div className="ai-row ai-row-assistant"><div className="ai-bubble ai-bubble-assistant ai-typing" aria-label="Digi is typing"><span /><span /><span /></div></div>}
      </div>
      <footer className="ai-footer">
        {notice && <p className="ai-notice" role="alert">{notice}</p>}
        {images.length > 0 && <div className="ai-previews">{images.map(i => <figure key={i.id}><img src={i.preview} alt="Attached" /><button aria-label="Remove image" onClick={() => setImages(a => a.filter(x => x.id !== i.id))}><X size={12} /></button></figure>)}</div>}
        <form className="ai-form" onSubmit={e => { e.preventDefault(); send(input); }}>
          <input ref={picker} type="file" accept="image/*" multiple hidden onChange={e => attach(e.target.files)} />
          <button type="button" className="ai-attach" aria-label="Attach a screenshot" disabled={busy || images.length >= 3 || enabled === false} onClick={() => picker.current?.click()}><ImagePlus size={20} /></button>
          <textarea ref={field} rows={1} value={input} maxLength={2000} placeholder="Message Digi AI…" disabled={enabled === false} onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="ai-send" aria-label="Send message" disabled={busy || enabled === false || (!input.trim() && !images.length)}>{busy ? <Spinner size={18} /> : <Send size={19} />}</button></form>
        <p className="ai-disclaimer">Digi AI can make mistakes. Never share passwords, PINs or codes.</p></footer>
    </section>}
  </>;
}
