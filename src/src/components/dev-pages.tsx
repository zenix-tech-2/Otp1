"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Code2, ExternalLink, FileText, Globe2, Headset, MessageCircle, Send, Server, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Users, Wallet, Wrench, X } from "lucide-react";
import type { DevProject } from "@/db/schema";
import type { PublicDevRequest } from "@/lib/dev-service";
import { briefRows, devSteps, devStatuses, devTypes, getDevType, isVisible, stepErrors, validateBrief, type Brief, type FormField } from "@/lib/dev-forms";
import { dateLabel } from "@/lib/catalog";
import { api, useMoney, useStore } from "./app-provider";
import { CustomerScreen } from "./customer-screen";
import { EmptyState, InfoBox, InlineError, Loading, Spinner } from "./ui";

const typeIcons: Record<string, typeof Globe2> = { globe: Globe2, code: Code2, shop: ShoppingBag, send: Send, chat: MessageCircle, phone: Smartphone, server: Server, wrench: Wrench, sparkles: Sparkles };
export function DevIcon({ name, size = 22 }: { name: string; size?: number }) { const Icon = typeIcons[name] || Code2; return <Icon size={size} />; }
function StatusPill({ status }: { status: string }) { const s = devStatuses[status] || { label: status, tone: "gray" }; return <span className={`dev-status dev-status-${s.tone}`}>{s.label}</span>; }

// ---------------- Landing ----------------
export function BuildHome({ projects }: { projects: DevProject[] }) {
  const { user } = useStore();
  return <main className="site-main inner-main dev-page">
    <section className="dev-hero"><span className="eyebrow">WEBSITES & BOTS</span><h1>Your idea, built by a real developer.</h1><p>Websites, web apps, Telegram and WhatsApp bots, mobile apps and more. Tell us what you need, get a clear quote, and follow your project from brief to delivery.</p>
      <div className="dev-hero-actions"><a className="button button-primary" href="#project-types">Start a project<ArrowRight size={16} /></a><Link className="button button-secondary" href="/build/portfolio">See our work</Link>{user && <Link className="button button-ghost" href="/build/requests">My requests</Link>}</div></section>
    <section className="dev-assurances"><div><ShieldCheck size={20} /><strong>No payment up front</strong><span>You only pay after you accept a quote.</span></div><div><Users size={20} /><strong>Talk to your developer</strong><span>Message us anytime from your request page.</span></div><div><Code2 size={20} /><strong>Yours to keep</strong><span>Full source code handover available.</span></div></section>
    <section id="project-types" className="dev-section"><div className="dev-section-heading"><h2>What do you need built?</h2><p>Pick a type. Each one has its own short brief, so we ask only what matters.</p></div>
      <div className="dev-type-grid">{devTypes.map(t => <Link key={t.id} href={`/build/order/${t.id}`} className="dev-type-card"><span className="dev-type-icon"><DevIcon name={t.icon} /></span><h3>{t.name}</h3><p>{t.tagline}</p><ul>{t.includes.slice(0, 3).map(i => <li key={i}><Check size={12} />{i}</li>)}</ul><span className="dev-type-cta">Start this brief<ArrowRight size={14} /></span></Link>)}</div></section>
    {projects.length > 0 && <section className="dev-section"><div className="dev-section-heading dev-heading-row"><div><h2>Recently built</h2><p>A few projects we are proud of.</p></div><Link className="button button-secondary" href="/build/portfolio">All projects<ArrowRight size={14} /></Link></div><div className="dev-project-grid">{projects.map(p => <ProjectCard key={p.id} project={p} />)}</div></section>}
    <section className="dev-section"><div className="dev-section-heading"><h2>How it works</h2></div><ol className="dev-steps">{[["Tell us about it", "Fill in the brief for your project type. It takes about five minutes."], ["Get a quote", "We review your answers and send a price and delivery time."], ["Accept and pay", "Approve the quote and pay securely from your wallet."], ["Receive and review", "Follow progress, chat with us, and approve the final delivery."]].map(([t, d], i) => <li key={t}><b>{i + 1}</b><div><strong>{t}</strong><span>{d}</span></div></li>)}</ol></section>
  </main>;
}

// ---------------- Portfolio ----------------
export function ProjectCard({ project }: { project: DevProject }) {
  const type = getDevType(project.type);
  return <Link href={`/build/portfolio/${project.slug}`} className="dev-project-card"><div className="dev-project-cover">{project.coverUrl ? <img src={project.coverUrl} alt="" loading="lazy" /> : <span><DevIcon name={type?.icon || "code"} size={34} /></span>}{project.featured && <em>Featured</em>}</div><div className="dev-project-body"><span className="dev-tag">{type?.name || "Project"}</span><h3>{project.title}</h3><p>{project.summary}</p><div className="dev-chips">{project.techStack.slice(0, 4).map(t => <span key={t}>{t}</span>)}</div></div></Link>;
}
export function PortfolioList({ projects, failed = false }: { projects: DevProject[]; failed?: boolean }) {
  const [filter, setFilter] = useState("all"); const error = failed ? "We could not load our portfolio just now. Please try again in a moment." : "";
  const types = devTypes.filter(t => projects.some(p => p.type === t.id)); const shown = projects.filter(p => filter === "all" || p.type === filter);
  return <CustomerScreen wide eyebrow="OUR WORK" title="Projects we have built." subtitle="Websites, apps and bots made for real businesses and communities." backHref="/build" backLabel="Websites & Bots">
    <InlineError message={error} />
    {types.length > 1 && <div className="dev-filter" role="tablist"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button>{types.map(t => <button key={t.id} className={filter === t.id ? "selected" : ""} onClick={() => setFilter(t.id)}>{t.name}</button>)}</div>}
    {shown.length ? <div className="dev-project-grid">{shown.map(p => <ProjectCard key={p.id} project={p} />)}</div> : <EmptyState title="Our portfolio is on its way." description="New projects will appear here soon. In the meantime, tell us about yours."><Link className="button button-primary" href="/build">Start a project<ArrowRight size={15} /></Link></EmptyState>}
  </CustomerScreen>;
}
export function PortfolioDetail({ project }: { project: DevProject }) {
  const [active, setActive] = useState<string | null>(null);
  const type = getDevType(project.type); const images = [project.coverUrl, ...project.gallery].filter((u): u is string => !!u);
  return <CustomerScreen wide eyebrow={(type?.name || "Project").toUpperCase()} title={project.title} subtitle={project.summary} backHref="/build/portfolio" backLabel="All projects">
    {images.length > 0 && <div className="dev-gallery">{images.map((u, i) => <button key={u + i} className={i === 0 ? "dev-gallery-main" : ""} onClick={() => setActive(u)} aria-label="View image larger"><img src={u} alt="" loading="lazy" /></button>)}</div>}
    <div className="dev-detail-layout"><div>
      {project.description && <div className="dev-prose">{project.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
      {project.features.length > 0 && <><h3 className="dev-subheading">Key features</h3><ul className="dev-feature-list">{project.features.map(f => <li key={f}><CheckCircle2 size={15} />{f}</li>)}</ul></>}
    </div><aside className="dev-facts"><dl>{project.clientName && <><dt>Client</dt><dd>{project.clientName}</dd></>}{project.year && <><dt>Year</dt><dd>{project.year}</dd></>}<dt>Type</dt><dd>{type?.name || "Project"}</dd></dl>
      {project.techStack.length > 0 && <div className="dev-chips">{project.techStack.map(t => <span key={t}>{t}</span>)}</div>}
      {project.liveUrl && <a className="button button-secondary button-full" href={project.liveUrl} target="_blank" rel="noopener noreferrer">Visit live project<ExternalLink size={14} /></a>}
      <Link className="button button-primary button-full" href={`/build/order/${project.type}`}>Order something like this<ArrowRight size={15} /></Link></aside></div>
    {active && <div className="dev-lightbox" role="dialog" aria-modal="true" onClick={() => setActive(null)}><button aria-label="Close" onClick={() => setActive(null)}><X size={22} /></button><img src={active} alt="" /></div>}
  </CustomerScreen>;
}

// ---------------- Order form ----------------
function FieldInput({ field, value, error, onChange }: { field: FormField; value: string | string[] | undefined; error?: string; onChange: (v: string | string[]) => void }) {
  const text = typeof value === "string" ? value : ""; const list = Array.isArray(value) ? value : [];
  const chips = field.type === "select" && (field.options?.length || 0) <= 6;
  return <div className={`dev-field ${error ? "dev-field-error" : ""}`} data-field={field.key}>
    <label className="dev-label" htmlFor={`f-${field.key}`}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : <small> optional</small>}</label>
    {field.help && <span className="dev-help">{field.help}</span>}
    {field.type === "textarea" && <><textarea id={`f-${field.key}`} rows={4} value={text} maxLength={field.max ?? 2000} placeholder={field.placeholder} onChange={e => onChange(e.target.value)} /><span className="dev-count">{text.length}/{field.max ?? 2000}</span></>}
    {(field.type === "text" || field.type === "email" || field.type === "url" || field.type === "number" || field.type === "date") && <input id={`f-${field.key}`} type={field.type === "text" ? "text" : field.type} value={text} maxLength={field.max ?? 300} placeholder={field.placeholder} onChange={e => onChange(e.target.value)} />}
    {field.type === "select" && !chips && <select id={`f-${field.key}`} value={text} onChange={e => onChange(e.target.value)}><option value="">Choose one…</option>{field.options!.map(o => <option key={o} value={o}>{o}</option>)}</select>}
    {(chips || field.type === "yesno") && <div className="dev-choices" role="radiogroup" aria-label={field.label}>{(field.type === "yesno" ? ["Yes", "No"] : field.options!).map(o => <button type="button" key={o} role="radio" aria-checked={text === o} className={text === o ? "selected" : ""} onClick={() => onChange(text === o && !field.required ? "" : o)}>{o}</button>)}</div>}
    {field.type === "multiselect" && <div className="dev-choices" role="group" aria-label={field.label}>{field.options!.map(o => { const on = list.includes(o); return <button type="button" key={o} role="checkbox" aria-checked={on} className={on ? "selected" : ""} onClick={() => onChange(on ? list.filter(v => v !== o) : [...list, o])}>{on && <Check size={12} />}{o}</button>; })}</div>}
    {error && <span className="dev-error" role="alert">{error}</span>}
  </div>;
}
export function DevOrderForm({ typeId }: { typeId: string }) {
  const type = getDevType(typeId); const { user, openPanel } = useStore(); const router = useRouter();
  const draftKey = `storeotp:dev-draft:${typeId}`;
  const [answers, setAnswers] = useState<Brief>({}); const [step, setStep] = useState(0); const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [serverError, setServerError] = useState(""); const [loaded, setLoaded] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const raw = localStorage.getItem(draftKey); if (raw) { const d = JSON.parse(raw); if (d && typeof d.answers === "object") { setAnswers(d.answers); setStep(Math.min(Number(d.step) || 0, (type?.sections.length || 0))); } } } catch { /* storage unavailable */ } setLoaded(true); }, [draftKey, type?.sections.length]);
  useEffect(() => { if (!loaded) return; try { localStorage.setItem(draftKey, JSON.stringify({ answers, step })); } catch { /* storage unavailable */ } }, [answers, step, loaded, draftKey]);
  if (!type) return <CustomerScreen wide title="Project type not found" backHref="/build" backLabel="Websites & Bots"><EmptyState title="We could not find that project type." description="Choose one from the list."><Link className="button button-primary" href="/build">See project types<ArrowRight size={15} /></Link></EmptyState></CustomerScreen>;
  const sections = type.sections; const review = step >= sections.length; const section = sections[Math.min(step, sections.length - 1)];
  function go(next: number) { setStep(next); setErrors({}); setServerError(""); requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  function set(key: string, value: string | string[]) { setAnswers(a => ({ ...a, [key]: value })); setErrors(e => { if (!e[key]) return e; const { [key]: _drop, ...rest } = e; return rest; }); }
  function next() { const found = stepErrors(section, answers); if (Object.keys(found).length) { setErrors(found); requestAnimationFrame(() => document.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })); return; } go(step + 1); }
  async function submit() {
    const check = validateBrief(typeId, answers);
    if (!check.ok) { const index = sections.findIndex(s => s.fields.some(f => check.errors[f.key])); setErrors(check.errors); setStep(Math.max(0, index)); setServerError("Please complete the highlighted fields."); return; }
    if (!user) { openPanel("login"); return; }
    setBusy(true); setServerError("");
    try { const r = await api<{ request: PublicDevRequest }>("/api/dev/requests", { method: "POST", body: JSON.stringify({ type: typeId, answers: check.brief }) }); try { localStorage.removeItem(draftKey); } catch { /* ignore */ } router.push(`/build/requests/${r.request.id}?new=1`); }
    catch (e) { setServerError((e as Error).message); } finally { setBusy(false); }
  }
  const rows = review ? briefRows(typeId, answers) : [];
  return <CustomerScreen wide eyebrow={`NEW ${type.name.toUpperCase()} PROJECT`} title={review ? "Review your brief." : section.title} subtitle={review ? "Check everything, then send it. You can still message us after sending." : section.description || type.description} backHref="/build" backLabel="Websites & Bots">
    <div ref={top} className="dev-form">
      <div className="dev-progress" aria-label={`Step ${Math.min(step + 1, sections.length + 1)} of ${sections.length + 1}`}><div style={{ width: `${((Math.min(step, sections.length) + 1) / (sections.length + 1)) * 100}%` }} /></div>
      <div className="dev-step-tabs">{[...sections.map(s => s.title), "Review"].map((t, i) => <button key={t} type="button" className={i === step ? "selected" : i < step ? "done" : ""} disabled={i > step} onClick={() => go(i)}><b>{i < step ? <Check size={11} /> : i + 1}</b><span>{t}</span></button>)}</div>
      <InlineError message={serverError} />
      {!review && <>
        {section.note && <InfoBox tone="amber">{section.note}</InfoBox>}
        <div className="dev-fields">{section.fields.filter(f => isVisible(f, answers)).map(f => <FieldInput key={f.key} field={f} value={answers[f.key]} error={errors[f.key]} onChange={v => set(f.key, v)} />)}</div>
        <div className="dev-form-actions">{step > 0 ? <button className="button button-secondary" type="button" onClick={() => go(step - 1)}><ChevronLeft size={15} />Back</button> : <span />}<button className="button button-primary" type="button" onClick={next}>{step === sections.length - 1 ? "Review brief" : "Continue"}<ChevronRight size={15} /></button></div>
        <p className="dev-draft-note"><Clock3 size={12} />Your answers are saved on this device as you go.</p>
      </>}
      {review && <>
        {rows.map(s => <section key={s.title} className="dev-review-block"><h3>{s.title}</h3><dl>{s.rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl></section>)}
        <InfoBox tone="blue">Sending this request is free. We will review it and reply with a quote. You pay only if you accept it.</InfoBox>
        <div className="dev-form-actions"><button className="button button-secondary" type="button" onClick={() => go(sections.length - 1)}><ChevronLeft size={15} />Edit answers</button><button className="button button-primary" type="button" disabled={busy} onClick={submit}>{busy ? <><Spinner />Sending…</> : user ? <>Send my request<Send size={15} /></> : <>Sign in to send<ArrowRight size={15} /></>}</button></div>
      </>}
    </div>
  </CustomerScreen>;
}

// ---------------- My requests ----------------
export function MyRequests() {
  const { user, accountLoading, openPanel } = useStore(); const { price } = useMoney(); const [items, setItems] = useState<PublicDevRequest[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { if (accountLoading) return; if (!user) { setLoading(false); return; } api<{ requests: PublicDevRequest[] }>("/api/dev/requests").then(r => setItems(r.requests)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [user, accountLoading]);
  return <CustomerScreen wide eyebrow="WEBSITES & BOTS" title="My project requests." subtitle="Track quotes, chat with your developer, and receive your deliveries." backHref="/build" backLabel="Websites & Bots">
    <InlineError message={error} />
    {accountLoading || loading ? <Loading label="Finding your requests…" /> : !user ? <EmptyState title="Sign in to see your requests." description="Your briefs, quotes and deliveries are saved to your account."><button className="button button-primary" onClick={() => openPanel("login")}>Sign in<ArrowRight size={15} /></button></EmptyState> : items.length ? <div className="dev-request-list">{items.map(r => <Link key={r.id} href={`/build/requests/${r.id}`} className="dev-request-card"><div><span className="dev-ref">{r.reference}</span><h3>{r.title}</h3><p>{getDevType(r.type)?.name || "Project"} · {dateLabel(r.createdAt)}</p></div><div className="dev-request-side"><StatusPill status={r.status} />{r.quoteUsd ? <strong>{price(r.quoteUsd)}</strong> : <span>Awaiting quote</span>}<ChevronRight size={16} /></div></Link>)}</div> : <EmptyState title="No requests yet." description="Start a brief and we will get back to you with a quote."><Link className="button button-primary" href="/build">Start a project<ArrowRight size={15} /></Link></EmptyState>}
  </CustomerScreen>;
}

// ---------------- Request detail ----------------
export function RequestDetail({ id }: { id: string }) {
  const { user, accountLoading, openPanel, refreshAccount, notify } = useStore(); const { price, localPrice, currency, pricingReady, money } = useMoney(); const router = useRouter(); const params = useSearchParams();
  const [req, setReq] = useState<PublicDevRequest | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState(""); const [text, setText] = useState(""); const [agree, setAgree] = useState(false);
  const load = useCallback(async () => { const r = await api<{ request: PublicDevRequest }>(`/api/dev/requests/${id}`); setReq(r.request); setError(""); }, [id]);
  useEffect(() => { if (accountLoading) return; if (!user) { setLoading(false); return; } let stop = false; let timer: ReturnType<typeof setTimeout>;
    async function tick() { try { await load(); } catch (e) { if (!stop) setError((e as Error).message); } finally { if (!stop) { setLoading(false); timer = setTimeout(tick, 25000); } } }
    tick(); return () => { stop = true; clearTimeout(timer); }; }, [user?.id, accountLoading, load]);
  async function act(action: string, extra: Record<string, unknown> = {}, ok?: string) {
    setBusy(action); setError("");
    try { const r = await api<{ request: PublicDevRequest }>(`/api/dev/requests/${id}`, { method: "POST", body: JSON.stringify({ action, ...extra }) }); setReq(r.request); if (action === "accept") await refreshAccount(); if (action === "message") setText(""); if (ok) notify(ok); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  if (accountLoading || loading) return <CustomerScreen wide title="Your project" backHref="/build/requests" backLabel="My requests"><Loading label="Opening your project…" /></CustomerScreen>;
  if (!user || !req) return <CustomerScreen wide title="Your project" backHref="/build/requests" backLabel="My requests"><InlineError message={error} /><EmptyState title={user ? "We could not find that request." : "Sign in to see this request."} description={user ? "Check My requests and try again." : "Your project details are private to your account."}><button className="button button-primary" onClick={() => user ? router.push("/build/requests") : openPanel("login")}>{user ? "My requests" : "Sign in"}<ArrowRight size={15} /></button></EmptyState></CustomerScreen>;
  const info = devStatuses[req.status]; const index = devSteps.indexOf(req.status); const closed = ["completed", "declined", "cancelled"].includes(req.status);
  const usd = req.quoteUsd || 0; const local = localPrice(usd); const canPay = local != null && user.balance >= local;
  const rows = briefRows(req.type, req.brief); const isNew = params.get("new") === "1";
  return <CustomerScreen wide eyebrow={req.reference} title={req.title} subtitle={`${getDevType(req.type)?.name || "Project"} · started ${dateLabel(req.createdAt)}`} backHref="/build/requests" backLabel="My requests">
    <InlineError message={error} />
    {isNew && <InfoBox tone="green">Your request is in. We will review it and send a quote. You can message us below at any time.</InfoBox>}
    <div className="dev-status-card"><StatusPill status={req.status} /><p>{info?.hint}</p></div>
    {!closed || req.status === "completed" ? <ol className="dev-timeline">{devSteps.map((s, i) => <li key={s} className={i < index ? "done" : i === index ? "current" : ""}><b>{i < index ? <Check size={11} /> : i + 1}</b><span>{devStatuses[s].label}</span></li>)}</ol> : null}
    {req.status === "quoted" && usd > 0 && <section className="dev-card dev-quote"><h2>Your quote</h2><div className="dev-quote-price"><strong>{price(usd)}</strong>{req.quoteDays && <span><Calendar size={13} />About {req.quoteDays} day{req.quoteDays === 1 ? "" : "s"}</span>}</div>{req.quoteNote && <p>{req.quoteNote}</p>}
      <div className="review-wallet"><Wallet size={20} /><div><strong>Store wallet</strong><span>Available balance: {money(user.balance)}</span></div>{canPay ? <CheckCircle2 size={18} /> : <button onClick={() => openPanel("wallet")}>Add funds<ArrowRight size={13} /></button>}</div>
      <label className="checkbox-label"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I understand this is a custom project. The full amount is taken from my wallet now, and I can message the developer at any time.</span></label>
      <div className="dev-form-actions"><button className="button button-secondary" disabled={!!busy} onClick={() => confirm("Cancel this request?") && act("cancel", {}, "Request cancelled.")}>Cancel request</button><button className="button button-primary" disabled={!!busy || !agree || !canPay || !pricingReady} onClick={() => act("accept", { expectedUsd: usd, expectedAmount: local ?? undefined, expectedCurrency: currency }, "Quote accepted. Your project is underway.")}>{busy === "accept" ? <><Spinner />Paying…</> : <>Accept and pay {price(usd)}</>}</button></div></section>}
    {req.status === "delivered" && <section className="dev-card dev-delivery"><h2>Your delivery</h2>{req.deliveryNote && <p className="dev-pre">{req.deliveryNote}</p>}{req.deliverables.length > 0 && <ul className="dev-links">{req.deliverables.map(d => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer"><FileText size={14} />{d.label}<ExternalLink size={12} /></a></li>)}</ul>}<div className="dev-form-actions"><span className="dev-help">Need changes? Send a message below.</span><button className="button button-primary" disabled={!!busy} onClick={() => act("approve", {}, "Thank you! Your project is complete.")}>{busy === "approve" ? <Spinner /> : <CheckCircle2 size={15} />}Approve delivery</button></div></section>}
    {req.status === "completed" && req.deliverables.length > 0 && <section className="dev-card dev-delivery"><h2>Your files and links</h2>{req.deliveryNote && <p className="dev-pre">{req.deliveryNote}</p>}<ul className="dev-links">{req.deliverables.map(d => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer"><FileText size={14} />{d.label}<ExternalLink size={12} /></a></li>)}</ul></section>}
    {req.orderId && <p className="dev-order-link"><ShieldCheck size={13} />Paid from your wallet. <Link href={`/orders/${req.orderId}`}>View receipt<ArrowRight size={12} /></Link></p>}
    <section className="dev-card"><h2><MessageCircle size={17} />Conversation</h2><div className="dev-thread">{req.messages.length ? req.messages.map((m, i) => <div key={i} className={`dev-msg dev-msg-${m.from === "customer" ? "customer" : "team"}`}><span>{m.from === "customer" ? "You" : "Developer"} · {new Date(m.at).toLocaleString()}</span><p>{m.text}</p></div>) : <p className="dev-help">No messages yet. Ask a question or add details at any time.</p>}</div>
      {!closed && <div className="dev-compose"><textarea value={text} rows={3} maxLength={2000} placeholder="Write a message to your developer…" onChange={e => setText(e.target.value)} /><button className="button button-primary" disabled={!!busy || !text.trim()} onClick={() => act("message", { text })}>{busy === "message" ? <Spinner /> : <Send size={15} />}Send</button></div>}</section>
    <details className="dev-card dev-brief"><summary>Your brief ({rows.reduce((n, s) => n + s.rows.length, 0)} answers)</summary>{rows.map(s => <section key={s.title} className="dev-review-block"><h3>{s.title}</h3><dl>{s.rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl></section>)}</details>
    <p className="dev-support-link"><Headset size={13} />Something wrong? <Link href="/support">Contact support</Link></p>
  </CustomerScreen>;
}
