"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { api, useStore } from "./app-provider";
import { safePopupLink, type Popup } from "@/lib/popup-core";

const seenKey = (userId: string, p: Popup) => `${userId}:${p.id}:${p.updatedAt}`;
function wasSeen(userId: string, p: Popup) {
  try { return (p.frequency === "once" ? localStorage : sessionStorage).getItem(`digisms:popup:${seenKey(userId, p)}`) === "1"; } catch { return false; }
}
function markSeen(userId: string, p: Popup) {
  try { (p.frequency === "once" ? localStorage : sessionStorage).setItem(`digisms:popup:${seenKey(userId, p)}`, "1"); } catch { /* storage unavailable: it may show again, which is harmless */ }
}

/** Admin-managed pop-ups. They appear after a customer signs in, one at a time, and respect each pop-up's frequency. */
export function PopupNotices() {
  const { user } = useStore(); const router = useRouter(); const [queue, setQueue] = useState<Popup[]>([]); const loadedFor = useRef<string | null>(null);
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
  function dismiss() { if (!current || !userId) return; markSeen(userId, current); setQueue(q => q.slice(1)); }
  const kind = current.linkUrl ? safePopupLink(current.linkUrl) : null;
  function openLink() {
    const url = current!.linkUrl; dismiss();
    if (kind === "internal") router.push(url); else if (kind === "external") window.open(url, "_blank", "noopener,noreferrer");
  }
  return <div className="popup-scrim" onClick={dismiss}><section className="popup-card" role="dialog" aria-modal="true" aria-labelledby="popup-title" onClick={e => e.stopPropagation()}>
    <button className="popup-x" aria-label="Close" onClick={dismiss}><X size={18}/></button>
    {current.image && <img className="popup-image" src={current.image} alt="" />}
    <div className="popup-content"><h2 id="popup-title">{current.title}</h2>{current.body && <p>{current.body}</p>}</div>
    <div className="popup-actions">{kind && current.linkLabel && <button className="popup-cta" onClick={openLink}>{current.linkLabel}</button>}<button className={kind && current.linkLabel ? "popup-close popup-close-quiet" : "popup-close"} onClick={dismiss} autoFocus>{current.buttonLabel || "Close"}</button></div>
  </section></div>;
}
