"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BellRing, Pencil, Send, TicketPercent, Trash2 } from "lucide-react";
import type { Coupon } from "@/db/schema";
import { api, useStore } from "../app-provider";
import { InlineError, Loading, Spinner } from "../ui";
import { AdminHeading, useAdmin } from "./admin-workspace";

type Draft = { id?: string; code: string; description: string; type: "percent" | "fixed"; value: string; minSubtotal: string; maxDiscount: string; maxUses: string; perUserLimit: string; categoryId: string; startsAt: string; expiresAt: string; active: boolean };
const blank: Draft = { code: "", description: "", type: "percent", value: "10", minSubtotal: "", maxDiscount: "", maxUses: "", perUserLimit: "1", categoryId: "", startsAt: "", expiresAt: "", active: true };
const localInput = (d: Date | string | null) => { if (!d) return ""; const date = new Date(d); const pad = (n: number) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; };
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function toDraft(c: Coupon): Draft { return { id: c.id, code: c.code, description: c.description, type: c.type === "fixed" ? "fixed" : "percent", value: c.type === "fixed" ? String(c.value / 100) : String(c.value), minSubtotal: c.minSubtotal ? String(c.minSubtotal / 100) : "", maxDiscount: c.maxDiscount ? String(c.maxDiscount / 100) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit), categoryId: c.categoryId || "", startsAt: localInput(c.startsAt), expiresAt: localInput(c.expiresAt), active: c.active }; }
function toPayload(d: Draft) {
  const cents = (v: string) => Math.round(Number(v) * 100);
  return { ...(d.id ? { id: d.id } : {}), code: d.code, description: d.description, type: d.type, value: d.type === "fixed" ? cents(d.value) : Math.round(Number(d.value)), minSubtotal: d.minSubtotal ? cents(d.minSubtotal) : 0, maxDiscount: d.maxDiscount ? cents(d.maxDiscount) : null, maxUses: d.maxUses ? Math.round(Number(d.maxUses)) : null, perUserLimit: Math.max(1, Math.round(Number(d.perUserLimit) || 1)), categoryId: d.categoryId || null, startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : "", expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : "", active: d.active };
}
export function AdminPromotions() {
  const { data } = useAdmin(); const { notify } = useStore();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null); const [pushReady, setPushReady] = useState(false); const [draft, setDraft] = useState<Draft>(blank); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [note, setNote] = useState({ title: "", body: "", url: "/store" }); const [sending, setSending] = useState(false); const [noteError, setNoteError] = useState("");
  const load = useCallback(async () => { const r = await api<{ coupons: Coupon[]; pushConfigured: boolean }>("/api/admin/promotions"); setCoupons(r.coupons); setPushReady(r.pushConfigured); }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/admin/promotions", { method: "POST", body: JSON.stringify({ action: "save-coupon", ...toPayload(draft) }) }); notify(draft.id ? "Coupon updated." : "Coupon created."); setDraft(blank); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(c: Coupon) {
    if (!confirm(c.usedCount ? `${c.code} has been used ${c.usedCount} time(s), so it will be switched off instead of deleted. Continue?` : `Delete ${c.code}?`)) return;
    try { const r = await api<{ deactivated?: boolean }>("/api/admin/promotions", { method: "POST", body: JSON.stringify({ action: "delete-coupon", id: c.id }) }); notify(r.deactivated ? "Coupon switched off." : "Coupon deleted."); await load(); } catch (e) { notify((e as Error).message, "error"); }
  }
  async function toggle(c: Coupon) { try { await api("/api/admin/promotions", { method: "POST", body: JSON.stringify({ action: "save-coupon", ...toPayload({ ...toDraft(c), active: !c.active }) }) }); await load(); } catch (e) { notify((e as Error).message, "error"); } }
  async function broadcast(event: FormEvent) {
    event.preventDefault(); if (!confirm("Send this notification to every customer?")) return; setSending(true); setNoteError("");
    try { const r = await api<{ recipients: number; pushed: number }>("/api/admin/promotions", { method: "POST", body: JSON.stringify({ action: "broadcast", ...note }) }); notify(`Sent to ${r.recipients} customers${pushReady ? ` (${r.pushed} push alerts delivered)` : ""}.`); setNote({ title: "", body: "", url: "/store" }); }
    catch (e) { setNoteError((e as Error).message); } finally { setSending(false); }
  }
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
  return <><AdminHeading eyebrow="GROW YOUR STORE" title="Promotions" description="Create discount coupons and send notifications to your customers."/>
    <div className="promo-layout"><div className="promo-panel"><h3><TicketPercent size={16}/> {draft.id ? `Edit ${draft.code}` : "New coupon"}</h3><p>Customers enter the code at checkout. Amounts are in US dollars and converted to each customer’s wallet currency.</p>
      <form className="promo-form" onSubmit={save}>
        <label>Code<input required minLength={3} maxLength={32} placeholder="WELCOME10" value={draft.code} onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}/></label>
        <label>Discount type<select value={draft.type} onChange={e => set({ type: e.target.value as Draft["type"] })}><option value="percent">Percentage off</option><option value="fixed">Fixed amount off (USD)</option></select></label>
        <label>{draft.type === "percent" ? "Percent (1–100)" : "Amount off (USD)"}<input required type="number" min={draft.type === "percent" ? 1 : 0.01} max={draft.type === "percent" ? 100 : undefined} step={draft.type === "percent" ? 1 : 0.01} value={draft.value} onChange={e => set({ value: e.target.value })}/></label>
        <label>Maximum discount (USD, optional)<input type="number" min="0.01" step="0.01" placeholder="No cap" value={draft.maxDiscount} onChange={e => set({ maxDiscount: e.target.value })}/></label>
        <label>Minimum order (USD, optional)<input type="number" min="0" step="0.01" placeholder="None" value={draft.minSubtotal} onChange={e => set({ minSubtotal: e.target.value })}/></label>
        <label>Total uses (optional)<input type="number" min="1" step="1" placeholder="Unlimited" value={draft.maxUses} onChange={e => set({ maxUses: e.target.value })}/></label>
        <label>Uses per customer<input type="number" min="1" step="1" value={draft.perUserLimit} onChange={e => set({ perUserLimit: e.target.value })}/></label>
        <label>Only for category (optional)<select value={draft.categoryId} onChange={e => set({ categoryId: e.target.value })}><option value="">All categories</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Starts (optional)<input type="datetime-local" value={draft.startsAt} onChange={e => set({ startsAt: e.target.value })}/></label>
        <label>Expires (optional)<input type="datetime-local" value={draft.expiresAt} onChange={e => set({ expiresAt: e.target.value })}/></label>
        <label className="span2">Internal note<input maxLength={160} placeholder="e.g. Black Friday campaign" value={draft.description} onChange={e => set({ description: e.target.value })}/></label>
        <label className="span2" style={{ display: "flex", alignItems: "center", gap: 8 }}><input style={{ width: "auto" }} type="checkbox" checked={draft.active} onChange={e => set({ active: e.target.checked })}/>Active</label>
        <div className="span2"><InlineError message={error}/></div>
        <div className="span2" style={{ display: "flex", gap: 8 }}><button className="button button-primary" disabled={busy}>{busy ? <Spinner/> : draft.id ? "Save changes" : "Create coupon"}</button>{draft.id && <button type="button" className="button button-secondary" onClick={() => { setDraft(blank); setError(""); }}>Cancel</button>}</div>
      </form></div>
      <div style={{ display: "grid", gap: 18 }}>
        <div className="promo-panel"><h3>Your coupons</h3>{!coupons ? <Loading label="Loading coupons…"/> : !coupons.length ? <p>No coupons yet. Create your first one.</p> : <div className="coupon-list">{coupons.map(c => <div key={c.id} className={`coupon-item ${c.active ? "" : "off"}`}><div><code>{c.code}</code><small>{c.type === "fixed" ? `${usd(c.value)} off` : `${c.value}% off`}{c.maxDiscount ? ` (max ${usd(c.maxDiscount)})` : ""} · used {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}{c.expiresAt ? ` · ends ${new Date(c.expiresAt).toLocaleDateString()}` : ""}{c.active ? "" : " · off"}</small></div><div className="coupon-actions"><button className="button button-secondary button-small" onClick={() => toggle(c)}>{c.active ? "Turn off" : "Turn on"}</button><button className="icon-button" aria-label={`Edit ${c.code}`} onClick={() => { setDraft(toDraft(c)); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={15}/></button><button className="icon-button" aria-label={`Delete ${c.code}`} onClick={() => remove(c)}><Trash2 size={15}/></button></div></div>)}</div>}</div>
        <form className="promo-panel" onSubmit={broadcast}><h3><BellRing size={16}/> Send a notification</h3><p>Appears in every customer’s inbox{pushReady ? " and as a push alert on devices that turned it on" : ". Push alerts need the VAPID keys (see README)"}.</p>
          <div className="promo-form"><label className="span2">Title<input required minLength={2} maxLength={100} value={note.title} onChange={e => setNote({ ...note, title: e.target.value })}/></label><label className="span2">Message<textarea maxLength={300} rows={3} value={note.body} onChange={e => setNote({ ...note, body: e.target.value })}/></label><label className="span2">Opens page<input value={note.url} onChange={e => setNote({ ...note, url: e.target.value })}/></label></div>
          <InlineError message={noteError}/><button className="button button-primary" disabled={sending}>{sending ? <Spinner/> : <><Send size={15}/>Send to everyone</>}</button></form>
      </div></div></>;
}
