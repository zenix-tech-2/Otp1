"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "./app-provider";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Globe2, LoaderCircle, PackageOpen, ShieldCheck, Smartphone, X } from "lucide-react";
import { brandAssets } from "@/lib/brand-assets";
export function BrandIcon({ brand, size = 44, logo, className = "" }: { brand: string; size?: number; logo?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [brand, logo]);
  const localLogo = logo && /^\/(?:brands|images|api\/media)\//.test(logo) ? logo : undefined;
  const image = brandAssets[brand] || localLogo || "";
  return <span className={`brand-icon brand-${brand} ${className}`} style={{ width: size, height: size, borderRadius: size * .25 }}>
    {image && !failed ? <img src={image} alt={`${brand} logo`} width={size * .63} height={size * .63} onError={() => setFailed(true)} loading="lazy" /> : brand === "proxy" ? <Globe2 size={size * .57} /> : <Smartphone size={size * .52} />}
  </span>;
}
export function Logo({ compact = false }: { compact?: boolean }) { const { settings } = useStore(); const standard = ["storeotp"].includes(settings.appName.replace(/\s/g, "").toLowerCase()); return <Link href="/" className="logo" aria-label={`${settings.appName} home`}><span className="logo-symbol"><Smartphone strokeWidth={2.3} /><Check className="logo-check" strokeWidth={3} /></span>{!compact && <span>{standard ? <>Store <span className="logo-blue">OTP</span><span className="logo-period">.</span></> : settings.appName}</span>}</Link>; }
export function Spinner({ size = 19 }: { size?: number }) { return <LoaderCircle size={size} className="spin" aria-label="Loading" />; }
export function Loading({ label = "Getting things ready…" }: { label?: string }) { return <div className="loading-state"><Spinner size={28} /><span>{label}</span></div>; }
export function EmptyState({ title, description, children, icon }: { title: string; description: string; children?: ReactNode; icon?: ReactNode }) { return <div className="empty-state"><span className="empty-icon">{icon || <PackageOpen size={32} />}</span><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status}`}><span />{status.replaceAll("_", " ")}</span>; }
export function PageHeading({ eyebrow, title, description, action, back }: { eyebrow?: string; title: string; description: string; action?: ReactNode; back?: string }) { return <div className="page-heading"><div>{back && <Link className="back-link" href={back}><ArrowLeft size={15} />Back</Link>}{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function InfoBox({ children, tone = "blue" }: { children: ReactNode; tone?: string }) { return <div className={`info-box info-${tone}`}><ShieldCheck size={18} /><div>{children}</div></div>; }
export function SectionHeading({ title, description, href, linkLabel = "View all", icon }: { title: string; description?: string; href?: string; linkLabel?: string; icon?: ReactNode }) { return <div className="section-heading"><div><h2>{icon && <span className="section-title-icon">{icon}</span>}{title}</h2>{description && <p>{description}</p>}</div>{href && <Link className="text-link" href={href}>{linkLabel}<ArrowRight size={16} /></Link>}</div>; }
export function InlineError({ message }: { message: string }) { return message ? <div className="inline-error" role="alert">{message}</div> : null; }
export function ModalFrame({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const frame = useRef<HTMLElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; frame.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); } if (event.key === "Tab") { const items = Array.from(frame.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled)') || []).filter(el => el.offsetParent !== null); const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === frame.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === frame.current)) { event.preventDefault(); first?.focus(); } } }; const element = frame.current; element?.addEventListener("keydown", key); return () => { element?.removeEventListener("keydown", key); document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  return <div className="modal-scrim" onClick={onClose}><section ref={frame} tabIndex={-1} className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}><header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}
export function SuccessMark() { return <span className="success-mark"><CheckCircle2 size={37} /></span>; }
