"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { api, useStore } from "../app-provider";
import { InlineError, Loading, Spinner } from "../ui";
import { AdminHeading } from "./admin-workspace";
import { POPUP_IMAGE_MAX_CHARS, POPUP_LIMIT, type Popup } from "@/lib/popup-core";

type Draft = { id?: string; title: string; body: string; image: string; buttonLabel: string; linkUrl: string; linkLabel: string; active: boolean; frequency: "session" | "once"; startsAt: string; endsAt: string };
const blank: Draft = { title: "", body: "", image: "", buttonLabel: "Close", linkUrl: "", linkLabel: "", active: true, frequency: "session", startsAt: "", endsAt: "" };
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: string | null) => { if (!d) return ""; const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const toDraft = (p: Popup): Draft => ({ id: p.id, title: p.title, body: p.body, image: p.image, buttonLabel: p.buttonLabel, linkUrl: p.linkUrl, linkLabel: p.linkLabel, active: p.active, frequency: p.frequency, startsAt: localInput(p.startsAt), endsAt: localInput(p.endsAt) });

// Shrinks the chosen picture in the browser so it stays small, then keeps it as a data URL inside the pop-up.
async function shrink(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  const bitmap = await createImageBitmap(file); const scale = Math.min(1, 960 / bitmap.width); const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Your browser couldn’t process that image.");
  ctx.drawImage(bitmap, 0, 0, w, h); bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) { const url = canvas.toDataURL("image/webp", quality); if (url.length <= POPUP_IMAGE_MAX_CHARS) return url; }
  throw new Error("That image is still too large. Try a smaller one.");
}

export function PopupPreview({ draft }: { draft: Draft }) {
  return <div className="popup-card popup-card-preview">{draft.image && <img className="popup-image" src={draft.image} alt="" />}<div className="popup-content"><h2>{draft.title || "Pop-up title"}</h2>{draft.body && <p>{draft.body}</p>}</div><div className="popup-actions">{draft.linkUrl && draft.linkLabel && <span className="popup-cta">{draft.linkLabel}</span>}<span className={draft.linkUrl && draft.linkLabel ? "popup-close popup-close-quiet" : "popup-close"}>{draft.buttonLabel || "Close"}</span></div></div>;
}

export function AdminPopups() {
  const { notify } = useStore(); const [popups, setPopups] = useState<Popup[] | null>(null); const [draft, setDraft] = useState<Draft>(blank); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [imageBusy, setImageBusy] = useState(false); const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { setPopups((await api<{ popups: Popup[] }>("/api/admin/popups")).popups); }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
  async function pick(files: FileList | null) {
    const f = files?.[0]; if (!f) return; setImageBusy(true); setError("");
    try { set({ image: await shrink(f) }); } catch (e) { setError((e as Error).message); } finally { setImageBusy(false); if (file.current) file.current.value = ""; }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const iso = (v: string) => v ? new Date(v).toISOString() : "";
    try { await api("/api/admin/popups", { method: "POST", body: JSON.stringify({ action: "save", ...draft, startsAt: iso(draft.startsAt), endsAt: iso(draft.endsAt) }) }); notify(draft.id ? "Pop-up updated." : "Pop-up created. Customers will see it when they sign in."); setDraft(blank); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function toggle(p: Popup) { try { await api("/api/admin/popups", { method: "POST", body: JSON.stringify({ action: "toggle", id: p.id, active: !p.active }) }); await load(); } catch (e) { notify((e as Error).message, "error"); } }
  async function remove(p: Popup) { if (!confirm(`Delete “${p.title}”?`)) return; try { await api("/api/admin/popups", { method: "POST", body: JSON.stringify({ action: "delete", id: p.id }) }); if (draft.id === p.id) setDraft(blank); notify("Pop-up deleted."); await load(); } catch (e) { notify((e as Error).message, "error"); } }
  const status = (p: Popup) => !p.active ? "Off" : p.startsAt && new Date(p.startsAt) > new Date() ? "Scheduled" : p.endsAt && new Date(p.endsAt) < new Date() ? "Expired" : "Live";
  return <><AdminHeading eyebrow="TALK TO YOUR CUSTOMERS" title="Pop-ups" description="Show a notice, offer or announcement (with an image if you like) to customers when they sign in."/>
    <div className="promo-layout"><form className="promo-panel" onSubmit={save}><h3>{draft.id ? "Edit pop-up" : "New pop-up"}</h3>
      <div className="promo-form">
        <label className="span2">Title<input required minLength={2} maxLength={100} placeholder="Important Notice" value={draft.title} onChange={e => set({ title: e.target.value })}/></label>
        <label className="span2">Message<textarea rows={5} maxLength={1200} placeholder="What do you want customers to know?" value={draft.body} onChange={e => set({ body: e.target.value })}/></label>
        <div className="span2 popup-image-field"><span>Image (optional)</span>{draft.image ? <div className="popup-image-chosen"><img src={draft.image} alt=""/><button type="button" className="button button-secondary button-small" onClick={() => set({ image: "" })}><X size={14}/>Remove image</button></div> : <button type="button" className="button button-secondary" disabled={imageBusy} onClick={() => file.current?.click()}>{imageBusy ? <Spinner size={15}/> : <ImagePlus size={16}/>}Upload image</button>}<input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => pick(e.target.files)}/></div>
        <label>Close button text<input maxLength={30} value={draft.buttonLabel} onChange={e => set({ buttonLabel: e.target.value })}/></label>
        <label>How often<select value={draft.frequency} onChange={e => set({ frequency: e.target.value as Draft["frequency"] })}><option value="session">Every time they sign in</option><option value="once">Only once per customer</option></select></label>
        <label>Action button text (optional)<input maxLength={30} placeholder="Send a gift" value={draft.linkLabel} onChange={e => set({ linkLabel: e.target.value })}/></label>
        <label>Action opens (optional)<input maxLength={300} placeholder="/gift or https://…" value={draft.linkUrl} onChange={e => set({ linkUrl: e.target.value })}/></label>
        <label>Starts (optional)<input type="datetime-local" value={draft.startsAt} onChange={e => set({ startsAt: e.target.value })}/></label>
        <label>Ends (optional)<input type="datetime-local" value={draft.endsAt} onChange={e => set({ endsAt: e.target.value })}/></label>
        <label className="span2" style={{ display: "flex", alignItems: "center", gap: 8 }}><input style={{ width: "auto" }} type="checkbox" checked={draft.active} onChange={e => set({ active: e.target.checked })}/>Active (visible to customers)</label>
        <div className="span2"><InlineError message={error}/></div>
        <div className="span2" style={{ display: "flex", gap: 8 }}><button className="button button-primary" disabled={busy || imageBusy}>{busy ? <Spinner/> : draft.id ? "Save changes" : "Create pop-up"}</button>{draft.id && <button type="button" className="button button-secondary" onClick={() => { setDraft(blank); setError(""); }}>Cancel</button>}</div>
      </div></form>
      <div style={{ display: "grid", gap: 18 }}>
        <div className="promo-panel"><h3>Preview</h3><div className="popup-preview-wrap"><PopupPreview draft={draft}/></div></div>
        <div className="promo-panel"><h3>Your pop-ups ({popups?.length ?? 0}/{POPUP_LIMIT})</h3>{!popups ? <Loading label="Loading pop-ups…"/> : !popups.length ? <p>No pop-ups yet. Create your first one.</p> : <div className="coupon-list">{popups.map(p => <div key={p.id} className={`coupon-item ${p.active ? "" : "off"}`}><div><code>{p.title}</code><small>{status(p)} · {p.frequency === "once" ? "once per customer" : "every sign-in"}{p.image ? " · with image" : ""}</small></div><div className="coupon-actions"><button className="button button-secondary button-small" onClick={() => toggle(p)}>{p.active ? "Turn off" : "Turn on"}</button><button className="icon-button" aria-label={`Edit ${p.title}`} onClick={() => { setDraft(toDraft(p)); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={15}/></button><button className="icon-button" aria-label={`Delete ${p.title}`} onClick={() => remove(p)}><Trash2 size={15}/></button></div></div>)}</div>}</div>
      </div></div></>;
}
