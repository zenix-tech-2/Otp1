"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Clock3, Globe2, History, Pencil, RefreshCw, Search, ShieldCheck, TrendingUp, Wallet, X, Zap } from "lucide-react";
import { brandAssets } from "@/lib/brand-assets";
import { PLATFORMS, SMM_PROVIDERS, isActiveStatus, isSmmProvider, platformInfo, priceFor, providerLabel, statusLabel, validLink, validQuantity, type PublicSmmOrder, type PublicSmmService, type SmmCategory, type SmmPlatform, type SmmProviderId } from "@/lib/smm-core";
import { dateLabel } from "@/lib/catalog";
import { api, useMoney, useStore } from "./app-provider";
import { BrandIcon, EmptyState, InlineError, Loading, Spinner } from "./ui";

const FLOW = "/boost/new";
const PROVIDER_KEY = "storeotp:boost-provider";
const FIRST_PLATFORMS = 24;

export function PlatformIcon({ id, size = 44 }: { id: string; size?: number }) {
  const info = platformInfo(id); const brand = id === "twitter" ? "x" : id;
  if (brandAssets[brand]) return <BrandIcon brand={brand} size={size} />;
  const style = { width: size, height: size, borderRadius: size * 0.28, background: info.color, fontSize: size * 0.42 };
  return <span className="bz-mono" style={style} aria-hidden="true">{id === "website" ? <Globe2 size={size * 0.5} /> : info.name.charAt(0)}</span>;
}
function platformIdByName(name: string) { return PLATFORMS.find(p => p.name === name)?.id || "other"; }

// Small fetch helper: returns null data while loading and resets whenever the URL changes (no flash of the previous list).
function useRemote<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: !!url }); const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) { setState({ data: null, error: "", loading: false }); return; }
    let cancelled = false; setState({ data: null, error: "", loading: true });
    api<T>(url).then(data => { if (!cancelled) setState({ data, error: "", loading: false }); }).catch(e => { if (!cancelled) setState({ data: null, error: (e as Error).message, loading: false }); });
    return () => { cancelled = true; };
  }, [url, nonce]);
  return { ...state, reload: useCallback(() => setNonce(n => n + 1), []) };
}
function host(link: string) { try { const u = new URL(link); return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : ""); } catch { return link; } }
const count = (n: number) => new Intl.NumberFormat("en").format(n);

// ============================== Landing: /boost ==============================
export function BoostPage() {
  const { user, accountLoading, openPanel, demo } = useStore(); const { money } = useMoney(); const params = useSearchParams(); const router = useRouter();
  const tab = params.get("tab") === "history" ? "history" : "running";
  const [orders, setOrders] = useState<PublicSmmOrder[] | null>(null); const [error, setError] = useState("");
  const load = useCallback(async () => { try { const r = await api<{ orders: PublicSmmOrder[] }>("/api/smm/orders"); setOrders(r.orders); setError(""); } catch (e) { setError((e as Error).message); setOrders(o => o ?? []); } }, []);
  const hasActive = !!orders?.some(o => isActiveStatus(o.status));
  useEffect(() => { if (!user) { setOrders(null); return; } load(); }, [user?.id, load]);
  useEffect(() => { // keep progress fresh while something is running
    if (!user || !hasActive) return; const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 12000); return () => clearInterval(timer);
  }, [user?.id, hasActive, load]);
  const running = (orders || []).filter(o => isActiveStatus(o.status) || o.status === "reconciliation"); const history = (orders || []).filter(o => !running.includes(o));
  const spent = (orders || []).filter(o => !["cancelled", "failed"].includes(o.status)).reduce((sum, o) => sum + o.price, 0);
  const shown = tab === "running" ? running : history;
  return <main className="site-main inner-main bz-main" data-screen="boost">
    <section className="bz-hero"><span className="bz-eyebrow">SOCIAL BOOST</span><h1>Grow your page, <em>not your to-do list.</em></h1><p>Followers, likes and views for Instagram, TikTok, YouTube, X and more. Paste a link, pick a quantity, and watch it start.</p>
      <Link className="bz-cta" href={FLOW}>Start a boost<ArrowRight size={18} /></Link>
      <p className="bz-hero-note"><ShieldCheck size={14} /><span>We never ask for your password. Pay from your wallet.{demo && <strong> Sandbox preview.</strong>}</span></p></section>
    <section className="bz-stats" aria-label="Your boosts"><div><span>Running</span><strong>{running.length}</strong></div><div><span>Completed</span><strong>{(orders || []).filter(o => ["completed", "partial"].includes(o.status)).length}</strong></div><div><span>Spent</span><strong>{money(spent)}</strong></div></section>
    <div className="bz-tabs" role="tablist"><button role="tab" aria-selected={tab === "running"} className={tab === "running" ? "selected" : ""} onClick={() => router.replace("/boost", { scroll: false })}>Running</button><button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "selected" : ""} onClick={() => router.replace("/boost?tab=history", { scroll: false })}>History</button></div>
    <InlineError message={error} />
    {accountLoading || (user && orders === null) ? <Loading label="Finding your boosts…" /> : !user ? <EmptyState icon={<TrendingUp size={30} />} title="Sign in to see your boosts." description="Your running and finished boosts are saved to your account."><button className="button button-primary" onClick={() => openPanel("login")}>Sign in<ArrowRight size={15} /></button></EmptyState>
      : shown.length ? <div className="bz-orders">{shown.map(o => <BoostOrderCard key={o.id} order={o} />)}</div>
      : <div className="bz-empty"><span className="bz-empty-icon">{tab === "running" ? <TrendingUp size={26} /> : <History size={26} />}</span><h3>{tab === "running" ? "Nothing running right now" : "No finished boosts yet"}</h3><p>{tab === "running" ? "Paste a link to your profile or post, choose a quantity, and it starts within minutes." : "Boosts you’ve completed will be listed here."}</p>{tab === "running" && <Link className="button button-primary" href={FLOW}>Start a boost<ArrowRight size={15} /></Link>}</div>}
  </main>;
}
export function BoostOrderCard({ order }: { order: PublicSmmOrder }) {
  const { money } = useMoney(); const delivered = Math.max(0, order.quantity - (order.remains ?? order.quantity)); const pct = Math.min(100, Math.round((delivered / order.quantity) * 100));
  const refunded = ["cancelled", "failed"].includes(order.status);
  return <article className="bz-order"><div className="bz-order-top"><PlatformIcon id={platformIdByName(order.platform)} size={42} /><div><h3>{order.serviceName}</h3><p>{host(order.link)}</p></div><span className={`status-badge status-${order.status}`}><span />{statusLabel(order.status)}</span></div>
    {!refunded && <div className="bz-progress-line" aria-label={`${pct}% delivered`}><span style={{ width: `${order.status === "completed" ? 100 : pct}%` }} /></div>}
    <div className="bz-order-meta"><span>{count(order.quantity)} ordered{!refunded && order.status !== "pending" ? ` · ${count(order.status === "completed" ? order.quantity : delivered)} delivered` : ""}</span><span>{order.provider}</span><strong>{money(order.price, order.currency)}</strong></div>
    {refunded && <p className="bz-order-note">This boost couldn’t be completed. Your payment was returned to your wallet.</p>}
    {order.status === "partial" && <p className="bz-order-note">Part of this order wasn’t delivered. The undelivered share was returned to your wallet.</p>}
    {order.status === "reconciliation" && <p className="bz-order-note">We’re confirming this order with the provider. Your payment is saved — please don’t order again.</p>}
    <small>{dateLabel(order.createdAt)}{order.isDemo ? " · Sandbox" : ""}</small></article>;
}

// ============================== Flow: /boost/new ==============================
export function BoostFlow() {
  const router = useRouter(); const params = useSearchParams(); const { user, accountLoading, openPanel, refreshAccount, notify, demo } = useStore(); const { money, price, localPrice, currency, pricingReady } = useMoney();
  const rawProvider = params.get("provider"); const provider: SmmProviderId = isSmmProvider(rawProvider) ? rawProvider : "v1";
  const platformId = params.get("platform") || ""; const catId = platformId ? params.get("category") || "" : ""; const serviceId = catId ? params.get("service") || "" : "";
  const step = serviceId ? 4 : catId ? 3 : platformId ? 2 : 1;
  const [search, setSearch] = useState(""); const [showAll, setShowAll] = useState(false); const [link, setLink] = useState("https://"); const [qty, setQty] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()); const top = useRef<HTMLDivElement>(null); const first = useRef(true);
  const go = useCallback((q: Record<string, string> = {}) => router.push(`${FLOW}?${new URLSearchParams({ provider, ...q })}`, { scroll: false }), [router, provider]);
  // Remember the provider a customer prefers.
  useEffect(() => {
    if (rawProvider) { try { if (isSmmProvider(rawProvider)) localStorage.setItem(PROVIDER_KEY, rawProvider); } catch { /* storage unavailable */ } return; }
    try { const saved = localStorage.getItem(PROVIDER_KEY); if (isSmmProvider(saved) && saved !== "v1") router.replace(`${FLOW}?provider=${saved}`, { scroll: false }); } catch { /* storage unavailable */ }
  }, [rawProvider, router]);
  useEffect(() => { setSearch(""); setShowAll(false); setError(""); if (first.current) { first.current = false; return; } top.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [step, provider, platformId, catId]);
  const api0 = `/api/smm/catalog?provider=${provider}`;
  const platforms = useRemote<{ platforms: SmmPlatform[] }>(step === 1 ? api0 : null);
  const categories = useRemote<{ categories: SmmCategory[] }>(platformId ? `${api0}&platform=${encodeURIComponent(platformId)}` : null);
  const services = useRemote<{ services: PublicSmmService[] }>(platformId && catId ? `${api0}&platform=${encodeURIComponent(platformId)}&category=${encodeURIComponent(catId)}` : null);
  const category = categories.data?.categories.find(c => c.id === catId); const service = services.data?.services.find(s => s.id === serviceId); const platform = platformInfo(platformId);
  const q = search.trim().toLowerCase();
  const platformList = useMemo(() => (platforms.data?.platforms || []).filter(p => !q || p.name.toLowerCase().includes(q)), [platforms.data, q]);
  const categoryList = useMemo(() => (categories.data?.categories || []).filter(c => !q || c.name.toLowerCase().includes(q)), [categories.data, q]);
  const serviceList = useMemo(() => (services.data?.services || []).filter(s => !q || s.name.toLowerCase().includes(q)), [services.data, q]);
  const visiblePlatforms = q || showAll ? platformList : platformList.slice(0, FIRST_PLATFORMS);
  const quantity = Number(qty); const qtyOk = !!service && validQuantity(service, quantity); const total = service && qtyOk ? priceFor(service.unit, quantity) : 0;
  const localTotal = qtyOk ? localPrice(total) : null; const linkOk = validLink(link.trim()); const canAfford = !!user && localTotal != null && user.balance >= localTotal;
  async function submit() {
    if (!service || !qtyOk || !linkOk) return; if (!user) { openPanel("login"); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ order: PublicSmmOrder; warning?: string }>("/api/smm/orders", { method: "POST", body: JSON.stringify({ provider, service: service.id, link: link.trim(), quantity, expectedPrice: total, expectedAmount: localTotal ?? undefined, expectedCurrency: currency, idempotencyKey: key.current }) });
      await refreshAccount().catch(() => {}); key.current = crypto.randomUUID();
      notify(result.warning || (demo ? "Your sandbox boost has started." : "Boost placed. It starts within minutes."), result.warning ? "error" : "success"); router.push("/boost");
    } catch (e) {
      setError((e as Error).message);
      // A definite answer from the server means the key is spent; only a lost response should be retried with the same key.
      if ((e as Error).message !== "The server is taking a moment. Please try again.") key.current = crypto.randomUUID();
    } finally { setBusy(false); }
  }
  const stepNames = ["Platform", "Category", "Service", "Details"];
  return <main className="site-main inner-main bz-main bz-flow" data-screen="boost-flow">
    <button className="bz-back" onClick={() => step === 1 ? router.push("/boost") : step === 2 ? go() : step === 3 ? go({ platform: platformId }) : go({ platform: platformId, category: catId })}><ArrowLeft size={16} />Back</button>
    <div ref={top} className="bz-scroll-anchor" />
    <span className="bz-eyebrow">SOCIAL BOOST</span><h1 className="bz-title">Start a boost</h1>
    <ol className="bz-progress" aria-label="Progress">{stepNames.map((name, i) => <li key={name} className={i + 1 < step ? "done" : i + 1 === step ? "current" : ""} aria-current={i + 1 === step ? "step" : undefined}><span className="bz-progress-bar" /><span className="bz-progress-label">{i + 1 < step ? <Check size={14} /> : `0${i + 1}`}<span className="bz-sr"> {name}</span></span></li>)}</ol>
    {step > 1 && <div className="bz-chips"><button className="bz-chip" onClick={() => go()}>{providerLabel(provider)} · {platform.name}<Pencil size={13} /></button>{category && step > 2 && <button className="bz-chip" onClick={() => go({ platform: platformId })}><span>{category.name}</span><Pencil size={13} /></button>}{service && step > 3 && <button className="bz-chip" onClick={() => go({ platform: platformId, category: catId })}><span>{service.name}</span><Pencil size={13} /></button>}</div>}

    {step === 1 && <section className="bz-panel"><h2>Choose a platform</h2><p className="bz-sub">Pick a provider and the platform you want to boost.</p>
      <div className="bz-providers" role="radiogroup" aria-label="Provider">{SMM_PROVIDERS.map(p => <button key={p.id} role="radio" aria-checked={provider === p.id} className={provider === p.id ? "selected" : ""} onClick={() => router.replace(`${FLOW}?provider=${p.id}`, { scroll: false })}><strong>{p.label}</strong><small>{p.tagline}</small><span className="bz-radio">{provider === p.id && <Check size={12} />}</span></button>)}</div>
      <label className="bz-search"><Search size={18} /><input aria-label="Search platform" placeholder="Search platform" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}</label>
      {platforms.loading ? <Loading label="Loading platforms…" /> : platforms.error ? <RemoteError message={platforms.error} onRetry={platforms.reload} other={provider} onSwitch={p => router.replace(`${FLOW}?provider=${p}`, { scroll: false })} /> : platformList.length ? <><div className="bz-platforms">{visiblePlatforms.map(p => <button key={p.id} onClick={() => go({ platform: p.id })}><PlatformIcon id={p.id} size={46} /><span>{p.name}</span><small>{count(p.count)} services</small></button>)}</div>
        {!q && !showAll && platformList.length > FIRST_PLATFORMS && <button className="bz-more" onClick={() => setShowAll(true)}>Show {platformList.length - FIRST_PLATFORMS} more platforms<ChevronDown size={16} /></button>}</>
        : <p className="bz-none">No platform matches “{search}”.</p>}</section>}

    {step === 2 && <section className="bz-panel"><h2>{platform.name} categories</h2><p className="bz-sub">Pick the category that matches what you want to boost.</p>
      <label className="bz-search"><Search size={18} /><input aria-label="Search categories" placeholder={`Search ${platform.name.toLowerCase()} categories`} value={search} onChange={e => setSearch(e.target.value)} /></label>
      {categories.loading ? <Loading label="Loading categories…" /> : categories.error ? <RemoteError message={categories.error} onRetry={categories.reload} /> : categoryList.length ? <div className="bz-list">{categoryList.map(c => <button key={c.id} onClick={() => go({ platform: platformId, category: c.id })}><span><strong>{c.name}</strong><small>{count(c.count)} {c.count === 1 ? "service" : "services"}</small></span><ChevronRight size={18} /></button>)}</div> : <p className="bz-none">{categories.data?.categories.length ? `No category matches “${search}”.` : `No ${platform.name} services on ${providerLabel(provider)} right now. Try the other provider.`}</p>}</section>}

    {step === 3 && <section className="bz-panel"><h2>Choose a service</h2><p className="bz-sub">{category ? `Services in ${category.name}` : "Pick the service that fits your goal."}</p>
      <label className="bz-search"><Search size={18} /><input aria-label="Search services" placeholder="Search choose a service" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {services.loading ? <Loading label="Loading services…" /> : services.error ? <RemoteError message={services.error} onRetry={services.reload} /> : serviceList.length ? <div className="bz-list bz-services">{serviceList.map(s => <button key={s.id} onClick={() => go({ platform: platformId, category: catId, service: s.id })}><PlatformIcon id={platformId} size={40} /><span><strong>{s.name}</strong><small>Min {count(s.min)} / Max {count(s.max)} · {price(s.per1000)} per 1,000{s.refill ? " · Refill" : ""}</small></span><ChevronRight size={18} /></button>)}</div> : <p className="bz-none">No service matches “{search}”.</p>}</section>}

    {step === 4 && (services.loading || categories.loading ? <Loading label="Getting your order ready…" /> : !service ? <EmptyState icon={<TrendingUp size={30} />} title="That service isn’t available any more." description="Pick another one to continue."><button className="button button-primary" onClick={() => go({ platform: platformId, category: catId })}>Choose a service<ArrowRight size={15} /></button></EmptyState> : <>
      <section className="bz-panel"><div className="bz-field"><span className="bz-num">1</span><div><h2>Where should it go?</h2><p className="bz-sub">The profile, post or video link you want boosted.</p></div></div><input className="bz-input" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Link to boost" placeholder="https://" value={link} onChange={e => setLink(e.target.value)} aria-invalid={link.trim().length > 8 && !linkOk} />{link.trim().length > 8 && !linkOk && <p className="bz-hint bz-hint-error">Enter a full public link that starts with https://</p>}</section>
      <section className="bz-panel"><div className="bz-field"><span className="bz-num">2</span><div><h2>How many?</h2><p className="bz-sub">Between {count(service.min)} and {count(service.max)}</p></div></div><input className="bz-input bz-mono-input" type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Quantity" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, "").slice(0, 9))} aria-invalid={!!qty && !qtyOk} />{!!qty && !qtyOk && <p className="bz-hint bz-hint-error">Choose a quantity between {count(service.min)} and {count(service.max)}.</p>}
        <div className="bz-quick">{[service.min, service.min * 2, service.min * 5, service.min * 10].filter((n, i, a) => n <= service.max && a.indexOf(n) === i).map(n => <button key={n} onClick={() => setQty(String(n))}>{count(n)}</button>)}</div></section>
      <section className="bz-panel bz-summary"><h2>Summary</h2>
        <div><span>Service</span><strong>{service.name}</strong></div><div><span>Provider</span><strong>{providerLabel(provider)}</strong></div><div><span>Quantity</span><strong>{qtyOk ? count(quantity) : "—"}</strong></div><div><span>Starts</span><strong>Within minutes</strong></div>
        <div className="bz-total"><span>Total</span><strong>{qtyOk ? price(total) : "$0"}</strong></div>
        <div className="bz-wallet"><Wallet size={18} /><span>Wallet balance</span><strong>{user ? money(user.balance) : "Sign in to use your wallet"}</strong></div>
        {qtyOk && user && !canAfford && localTotal != null && <p className="bz-hint bz-hint-error">Your wallet needs {money(localTotal - user.balance)} more. <button className="bz-link" onClick={() => openPanel("wallet")}>Add funds<ArrowRight size={12} /></button></p>}
        <InlineError message={error} />
        {service.refill && <p className="bz-hint"><ShieldCheck size={13} />This service includes refill if the count drops.</p>}
        <button className="button button-primary button-full bz-submit" disabled={busy || accountLoading || (!!user && (!qtyOk || !linkOk || !canAfford || !pricingReady)) || (!user && (!qtyOk || !linkOk))} onClick={submit}>{busy ? <><Spinner />Placing your boost…</> : !user ? <>Sign in to continue<ArrowRight size={17} /></> : <><Zap size={17} />{demo ? "Start sandbox boost" : "Place boost"}{qtyOk && <strong>{price(total)}</strong>}</>}</button>
        <p className="secure-caption"><Clock3 size={13} />{demo ? "No real money or real followers — just a preview." : "If the provider can’t deliver, the undelivered part is refunded to your wallet."}</p></section></>)}
  </main>;
}
function RemoteError({ message, onRetry, other, onSwitch }: { message: string; onRetry: () => void; other?: SmmProviderId; onSwitch?: (p: SmmProviderId) => void }) {
  const alt = other ? SMM_PROVIDERS.find(p => p.id !== other) : undefined;
  return <div className="bz-error"><InlineError message={message} /><div><button className="button button-secondary" onClick={onRetry}><RefreshCw size={14} />Try again</button>{alt && onSwitch && <button className="button button-ghost" onClick={() => onSwitch(alt.id)}>Use {alt.label} instead</button>}</div></div>;
}
