"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// A bottom sheet (full-width on phones, centered card on larger screens) with focus trapping, Escape-to-close and scroll lock.
export function Sheet({ title, subtitle, children, onClose, footer, className = "" }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; className?: string }) {
  const frame = useRef<HTMLElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; frame.current?.focus();
    const element = frame.current;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); return; }
      if (event.key !== "Tab") return;
      const items = Array.from(element?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || []).filter(el => el.offsetParent !== null);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    };
    element?.addEventListener("keydown", key);
    return () => { element?.removeEventListener("keydown", key); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="sheet-scrim" onClick={onClose}>
    <section ref={frame} tabIndex={-1} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
      <span className="sheet-handle" aria-hidden="true" />
      <button className="sheet-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
      <div className="sheet-body"><header className="sheet-header"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</header>{children}</div>
      {footer && <footer className="sheet-footer">{footer}</footer>}
    </section>
  </div>;
}
