"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Headset, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function CustomerScreen({ title, subtitle, children, eyebrow = "YOUR DIGISMS PRO", backHref = "/account", backLabel = "Back to account", wide = false, screen = "customer", aside }: { title: string; subtitle?: string; children: ReactNode; eyebrow?: string; backHref?: string; backLabel?: string; wide?: boolean; screen?: string; aside?: ReactNode }) {
  return <main className={`site-main inner-main customer-screen ${wide ? "customer-screen-wide" : ""}`} data-screen={screen}>
    <Link href={backHref} className="screen-back"><ArrowLeft size={15}/>{backLabel}</Link>
    <header className="screen-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>
    <div className="customer-screen-layout"><section className="screen-content">{children}</section>{!wide && <aside className="screen-aside">{aside || <><div className="screen-aside-art"><ShieldCheck size={52}/><span>✦</span></div><h2>Your digital world.<br/>A little simpler.</h2><p>Your account, purchases, and payments stay together—securely, in one place.</p><div className="screen-assurance"><ShieldCheck size={19}/><div><strong>Private by design</strong><span>Your details are only yours.</span></div></div><div className="screen-assurance"><Sparkles size={19}/><div><strong>More to discover</strong><span>A growing store, made for you.</span></div></div><Link href="/support" className="screen-help-link"><Headset size={16}/>A real team, ready to help<ArrowRight size={14}/></Link></>}</aside>}</div>
  </main>;
}
