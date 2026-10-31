"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, X } from "lucide-react";
import { api, useStore } from "./app-provider";
import { safePopupLink, type Popup } from "@/lib/popup-core";

const seenKey = (userId: string, p: Popup) => `${userId}:${p.id}:${p.updatedAt}`;
function wasSeen(userId: string, p: Popup) {
  try { return (p.frequency === "once" ? localStorage : sessionStorage).getItem(`storeotp:popup:${seenKey(userId, p)}`) === "1"; } catch { return false; }
}
function markSeen(userId: string, p: Popup) {
  try { (p.frequency === "once" ? localStorage : sessionStorage).setItem(`storeotp:popup:${seenKey(userId, p)}`, "1"); } catch { /* storage unavailable: it may show again, which is harmless */ }
}

const mb = (n: number) => (n / 1048576).toFixed(1);
type Dl = { state: "idle" | "running" | "done" | "error"; loaded: number; total: number; message?: string };
/** Streams the file so the progress bar fills as bytes arrive, then hands the finished file to the browser. */
function useDownload() {
  const [dl, setDl] = useState<Dl>({ state: "idle", loaded: 0, total: 0 }); const abort = useRef<AbortController | null>(null);
  async function start(url: string) {
    if (dl.state === "running") return; const ctrl = new AbortController(); abort.current = ctrl; setDl({ state: "running", loaded: 0, total: 0 });
    const name = url.split("/").pop() || "store-otp.apk";
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok || !res.body) throw new Error("The file isn’t available right now.");
      const total = Number(res.headers.get("content-length")) || 0; const reader = res.body.getReader(); const chunks: BlobPart[] = []; let loaded = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value as BlobPart); loaded += value.length; setDl({ state: "running", loaded, total }); }
      const blob = new Blob(chunks, { type: res.headers.get("content-type") || "application/vnd.android.package-archive" });
      const href = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setDl({ state: "done", loaded, total: total || loaded });
    } catch (e) {
      if ((e as Error).name === "AbortError") { setDl({ state: "idle", loaded: 0, total: 0 }); return; }
      setDl({ state: "error", loaded: 0, total: 0, message: (e as Error).message || "Download failed. Please try again." });
    }
  }
  const cancel = () => abort.current?.abort();
  return { dl, start, cancel };
}

/** Store pop-ups. They appear after a customer signs in, one at a time, and respect each pop-up's frequency. */
export function PopupNotices() {
  const { user } = useStore(); const router = useRouter(); const { dl, start, cancel } = useDownload(); const [queue, setQueue] = useState<Popup[]>([]); const loadedFor = useRef<string | null>(null);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) { loadedFor.current = null; setQueue([]); return; }
    if (loadedFor.current === userId) return; loadedFor.current = userId;
    api<{ popups: Popup[] }>("/api/popups").then(r => setQueue(r.popups.filter(p => !wasSeen(userId, p)))).catch(() => {});
  }, [userId]);
  const current = queue[0];
  useEffect(() => {
    if (!current) return; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); }; document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  if (!current || !userId) return null;
  function dismiss() { if (!current || !userId) return; if (dl.state === "running") cancel(); markSeen(userId, current); setQueue(q => q.slice(1)); }
  const kind = current.linkUrl ? safePopupLink(current.linkUrl) : null;
  function openLink() {
    const url = current!.linkUrl; dismiss();
    if (kind === "internal") router.push(url); else if (kind === "external") window.open(url, "_blank", "noopener,noreferrer");
  }
  return <div className="popup-scrim" onClick={dismiss}><section className="popup-card" role="dialog" aria-modal="true" aria-labelledby="popup-title" onClick={e => e.stopPropagation()}>
    <button className="popup-x" aria-label="Close" onClick={dismiss}><X size={18}/></button>
    {current.image && <img className="popup-image" src={current.image} alt="" />}
    <div className="popup-content"><h2 id="popup-title">{current.title}</h2>{current.body && <p>{current.body}</p>}</div>
    {current.downloadUrl && dl.state !== "idle" && <div className={`popup-progress popup-progress-${dl.state}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dl.total ? Math.round(dl.loaded / dl.total * 100) : undefined} aria-label="Download progress">
      <div className="popup-progress-top"><span>{dl.state === "done" ? <><CheckCircle2 size={15}/>Download complete. Open the file to install.</> : dl.state === "error" ? dl.message : "Downloading…"}</span>{dl.state === "running" && <b>{dl.total ? `${Math.round(dl.loaded / dl.total * 100)}%` : `${mb(dl.loaded)} MB`}</b>}</div>
      <div className="popup-progress-track"><i className={dl.state === "running" && !dl.total ? "indeterminate" : ""} style={{ width: dl.state === "done" ? "100%" : dl.total ? `${dl.loaded / dl.total * 100}%` : undefined }}/></div>
      {dl.state === "running" && dl.total > 0 && <small>{mb(dl.loaded)} of {mb(dl.total)} MB</small>}
    </div>}
    <div className="popup-actions">{current.downloadUrl && dl.state !== "done" && <button className="popup-cta popup-cta-download" disabled={dl.state === "running"} onClick={() => start(current.downloadUrl!)}><Download size={16}/>{dl.state === "running" ? "Downloading…" : dl.state === "error" ? "Try again" : current.downloadLabel || "Download app"}</button>}{kind && current.linkLabel && <button className="popup-cta" onClick={openLink}>{current.linkLabel}</button>}<button className={kind && current.linkLabel ? "popup-close popup-close-quiet" : "popup-close"} onClick={dismiss} autoFocus>{current.buttonLabel || "Close"}</button></div>
  </section></div>;
}
