"use client";
import { peekPurchase, seedPurchase } from "@/lib/purchase-seed";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Clock3, Copy, History, MessageCircle, RefreshCw, Search, ShieldCheck, Smartphone, Sparkles, Timer, Wallet, X } from "lucide-react";
import type { Rental } from "@/db/schema";
import type { RentCountry, Service } from "@/lib/numberotp";
import { dateLabel, flagEmoji, serviceBrands } from "@/lib/catalog";
import { api, useMoney, useStore } from "./app-provider";
import { BrandIcon, EmptyState, InfoBox, InlineError, Loading, Spinner, StatusBadge } from "./ui";

const popularCodes = ["wa", "tg", "go", "ig", "fb", "lf", "dr", "tw", "am", "wx", "ds", "nf"];
export function rentLabel(hours: number) { return hours < 24 ? `${hours} hours` : hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hours`; }
function remainingLabel(ms: number) {
  if (ms <= 0) return "Ended";
  const totalMinutes = Math.floor(ms / 60000); const days = Math.floor(totalMinutes / 1440); const hours = Math.floor((totalMinutes % 1440) / 60); const minutes = totalMinutes % 60;
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// Long-term rentals: service → country → duration & review → rented number with live message history.
export function RentalsFlow() {
  const { price, localPrice, currency, pricingReady, money } = useMoney();
  const { user, demo, openPanel, refreshAccount, notify } = useStore();
  const params = useSearchParams(); const router = useRouter();
  const serviceId = params.get("service"); const countryId = params.get("country"); const rentalId = params.get("rental");
  const [services, setServices] = useState<Service[]>([]); const [servicesLoading, setServicesLoading] = useState(true);
  const [countries, setCountries] = useState<RentCountry[]>([]); const [countriesLoading, setCountriesLoading] = useState(false);
  const [error, setError] = useState(""); const [search, setSearch] = useState(""); const [allServices, setAllServices] = useState(false);
  const [hours, setHours] = useState<number | null>(null); const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const service = services.find(s => s.code === serviceId); const country = countries.find(c => c.id === countryId);
  const option = country?.options.find(o => o.hours === hours) || null;

  const loadServices = useCallback(() => { setServicesLoading(true); setError(""); api<{ services: Service[] }>("/api/sms/catalog").then(r => setServices(r.services)).catch(e => setError(e.message)).finally(() => setServicesLoading(false)); }, []);
  useEffect(loadServices, [loadServices]);
  useEffect(() => { setSearch(""); setError(""); setAccepted(false); requestKey.current = crypto.randomUUID(); }, [serviceId, countryId]);
  useEffect(() => {
    if (!serviceId || rentalId) return; let cancelled = false; setCountriesLoading(true);
    api<{ countries: RentCountry[] }>(`/api/sms/rentals/catalog?service=${encodeURIComponent(serviceId)}`).then(r => { if (!cancelled) setCountries(r.countries); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setCountriesLoading(false); });
    return () => { cancelled = true; };
  }, [serviceId, rentalId]);
  useEffect(() => { if (country && (hours == null || !country.options.some(o => o.hours === hours && o.count > 0))) setHours(country.options.find(o => o.count > 0)?.hours ?? null); }, [country, hours]);

  const filteredServices = useMemo(() => services.filter(s => (!search && !allServices ? popularCodes.includes(s.code) : true) && s.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (search || allServices ? a.name.localeCompare(b.name) : popularCodes.indexOf(a.code) - popularCodes.indexOf(b.code))), [services, search, allServices]);
  const filteredCountries = useMemo(() => countries.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => ({ ...c, from: Math.min(...c.options.filter(o => o.count > 0).map(o => o.price), Infinity) })), [countries, search]);

  async function rent() {
    if (!service || !country || !option) return; if (!user) { openPanel("login"); return; } setBusy(true); setError("");
    try {
      const result = await api<{ rental: Rental; warning?: string }>("/api/sms/rentals", { method: "POST", body: JSON.stringify({ service: service.code, country: country.id, countryName: country.name, hours: option.hours, expectedPrice: option.price, expectedAmount: localPrice(option.price) ?? undefined, expectedCurrency: currency, idempotencyKey: requestKey.current }) });
      seedPurchase("rental", result.rental); refreshAccount().catch(() => {}); if (result.warning) notify(result.warning, "error"); router.push(`/numbers?tab=rentals&rental=${result.rental.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (rentalId) return <RentalDetail id={rentalId} />;
  const step = countryId && serviceId ? 3 : serviceId ? 2 : 1;
  const canAfford = !!user && !!option && localPrice(option.price) != null && user.balance >= (localPrice(option.price) || 0);
  return <section className="number-workspace rental-workspace"><InlineError message={error} />
    {step === 1 && <>
      <div className="workspace-heading"><div><h2>Some connections deserve a longer stay.</h2><p>Rent a number for hours or days. It receives unlimited messages while the rental lasts.</p></div><span className="workspace-count">{services.length} services</span></div>
      <label className="catalog-search service-search"><Search size={17} /><input aria-label="Search rental services" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WhatsApp, Google, Telegram…" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}</label>
      <div className="service-list-tabs"><button className={!allServices ? "selected" : ""} onClick={() => { setAllServices(false); setSearch(""); }}><Sparkles size={13} />Popular services</button><button className={allServices ? "selected" : ""} onClick={() => setAllServices(true)}>All services</button></div>
      {servicesLoading ? <Loading label="Gathering your favorite platforms…" /> : filteredServices.length ? <div className="sms-service-grid">{filteredServices.slice(0, 96).map(s => <button key={s.code} className="sms-service-card" onClick={() => router.push(`/numbers?tab=rentals&service=${encodeURIComponent(s.code)}`)}><BrandIcon brand={s.brand} logo={s.logo} size={36} /><div><strong>{s.name}</strong><span>Long-term rental</span></div><ChevronRight size={14} /></button>)}</div> : <EmptyState title="No service found." description="Try a different platform name, or browse all available services."><button className="button button-secondary" onClick={() => { setSearch(""); setAllServices(true); loadServices(); }}>Browse all services</button></EmptyState>}
    </>}
    {step === 2 && <>
      <button className="back-link" onClick={() => router.push("/numbers?tab=rentals")}><ArrowLeft size={14} />Change service</button>
      <div className="workspace-heading"><div><h2>Where should your number be from?</h2><p>Choose a country. You’ll pick how long to keep it next.</p></div>{service && <BrandIcon brand={service.brand} logo={service.logo} size={40} />}</div>
      <div className="selected-service-strip"><span><CheckCircle2 size={14} />Your service</span><strong>{service?.name || "Loading service…"}</strong><span>Long-term rental</span></div>
      <label className="catalog-search"><Search size={16} /><input aria-label="Search countries" placeholder="Find a country…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {countriesLoading ? <Loading label="Checking rental availability…" /> : filteredCountries.length ? <div className="country-list"><div className="country-list-heading"><span>Country</span><span>Durations</span><span>From</span><span /></div>{filteredCountries.map(c => { const open = c.options.some(o => o.count > 0); return <button className="country-row" key={c.id} disabled={!open} onClick={() => router.push(`/numbers?tab=rentals&service=${serviceId}&country=${c.id}`)}><span className="country-name"><span className="country-flag">{flagEmoji(c.iso)}</span><span>{c.name}</span></span><span className="country-availability"><span className={open ? "available-dot" : "unavailable-dot"} />{open ? `${c.options.filter(o => o.count > 0).length} options` : "Sold out"}</span><strong>{open ? price(c.from) : "—"}</strong><ChevronRight size={15} /></button>; })}</div> : <EmptyState title="No rentals available for this service." description="Rentals are not offered for every service. Try another service, or use a one-time number instead."><Link className="button button-secondary" href="/numbers">One-time SMS<ArrowRight size={14} /></Link></EmptyState>}
    </>}
    {step === 3 && <>{countriesLoading || servicesLoading ? <Loading label="Getting your rental ready…" /> : !country || !service ? <EmptyState title="Let’s try another rental." description="This country or service is no longer available."><Link className="button button-primary" href="/numbers?tab=rentals">Choose a service<ArrowRight size={15} /></Link></EmptyState> : <>
      <button className="back-link" onClick={() => router.push(`/numbers?tab=rentals&service=${serviceId}`)}><ArrowLeft size={14} />Change country</button>
      <div className="workspace-heading"><div><h2>How long do you need it?</h2><p>Longer rentals cost more, and the number keeps every message you receive.</p></div><ShieldCheck className="review-shield" size={35} /></div>
      <div className="sms-review-service"><BrandIcon brand={service.brand} size={56} /><div><h3>{service.name}</h3><p>{flagEmoji(country.iso)} {country.name} · Long-term rental</p></div></div>
      <div className="rental-durations" role="radiogroup" aria-label="Rental duration">{country.options.map(o => <button key={o.hours} role="radio" aria-checked={o.hours === hours} disabled={o.count <= 0} className={o.hours === hours ? "selected" : ""} onClick={() => setHours(o.hours)}><strong>{rentLabel(o.hours)}</strong><span>{o.count > 0 ? price(o.price) : "Sold out"}</span></button>)}</div>
      {option && <><div className="sms-review-details"><div><span>Number type</span><strong>Private rented number</strong></div><div><span>Rental period</span><strong>{rentLabel(option.hours)}</strong></div><div><span>Messages</span><strong>Unlimited while active</strong></div><div><span>Additional fees</span><strong>{money(0)}</strong></div><div className="sms-review-total"><span>Your total</span><strong>{price(option.price)}</strong></div></div>
        <div className="review-wallet"><Wallet size={20} /><div><strong>Store wallet</strong><span>{user ? `Available balance: ${money(user.balance)}` : "Sign in to use your wallet"}</span></div>{canAfford ? <CheckCircle2 size={18} /> : <button onClick={() => openPanel(user ? "wallet" : "login")}>{user ? "Add funds" : "Sign in"}<ArrowRight size={13} /></button>}</div>
        <InfoBox tone="amber">Rentals are paid for the full period and can’t be refunded once the number is issued. If the number can’t be issued, your wallet is refunded automatically.</InfoBox>
        <label className="checkbox-label"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>I’ll use this number responsibly, for a service I’m authorized to access, and I understand the rental is not refundable.</span></label>
        <button className="button button-primary button-full number-buy-button" disabled={busy || !accepted || !pricingReady || (!!user && !canAfford)} onClick={rent}>{busy ? <><Spinner />Renting your number…</> : <><Smartphone size={17} />{demo ? "Try a sandbox rental" : "Rent this number"}<strong>{price(option.price)}</strong><ArrowRight size={17} /></>}</button>
        <p className="secure-caption"><ShieldCheck size={13} />{demo ? "No real SMS or payment. Just a preview of the experience." : "Your messages are saved here for the whole rental."}</p></>}
    </>}</>}
  </section>;
}

function RentalDetail({ id }: { id: string }) {
  const { money } = useMoney(); const { user, accountLoading, openPanel, refreshAccount, notify } = useStore(); const router = useRouter();
  const [rental, setRental] = useState<Rental | null>(() => peekPurchase<Rental>("rental", id)); const [loading, setLoading] = useState(() => !peekPurchase<Rental>("rental", id)); const [error, setError] = useState(""); const [tick, setTick] = useState(Date.now()); const [checking, setChecking] = useState(false); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { const r = await api<{ rental: Rental }>(`/api/sms/rentals/${id}`); setRental(r.rental); setError(""); return r.rental; }, [id]);
  useEffect(() => {
    if (!user) return; let cancelled = false; let timer: ReturnType<typeof setTimeout>; const seeded = peekPurchase<Rental>("rental", id); if (seeded) { setRental(cur => cur?.id === seeded.id ? cur : seeded); setLoading(false); } else setLoading(true);
    async function poll() { try { const r = await refresh(); if (cancelled) return; if (r.status === "active") timer = setTimeout(poll, 8000); else refreshAccount().catch(() => {}); } catch (e) { if (!cancelled) { setError((e as Error).message); timer = setTimeout(poll, 15000); } } finally { if (!cancelled) setLoading(false); } }
    poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [id, user?.id, refresh, refreshAccount]);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); notify(`${label} copied.`); } catch { notify("Copy isn’t available in this browser. Select and copy the text instead.", "error"); } }
  async function check() { setChecking(true); try { const r = await refresh(); if (r.status === "active" && !r.messages.length) notify("No message just yet. We’re still listening."); } catch (e) { setError((e as Error).message); } finally { setChecking(false); } }
  async function sample() { setBusy(true); try { const r = await api<{ rental: Rental }>(`/api/sms/rentals/${id}`, { method: "POST", body: "{}" }); setRental(r.rental); } catch (e) { notify((e as Error).message, "error"); } finally { setBusy(false); } }
  if (accountLoading || loading) return <section className="number-workspace"><Loading label="Finding your rented number…" /></section>;
  if (!user || !rental) return <section className="number-workspace"><InlineError message={error} /><EmptyState title="We couldn’t find that rental." description={user ? "Please check My numbers or try again." : "Sign in to see your rented number and messages."}><button className="button button-primary" onClick={() => user ? router.push("/numbers?tab=active") : openPanel("login")}>{user ? "My numbers" : "Sign in"}<ArrowRight size={15} /></button></EmptyState></section>;
  const left = new Date(rental.expiresAt).getTime() - tick; const active = rental.status === "active" && left > 0; const messages = [...rental.messages].reverse();
  return <section className="number-workspace rental-workspace"><InlineError message={error} />
    <div className="workspace-heading"><div><h2>{active ? "Your rented number is ready." : rental.status === "reconciliation" ? "We’re checking your rental." : "This rental has ended."}</h2><p>{active ? "Use it on your chosen platform. Every message appears here." : rental.status === "reconciliation" ? "Your rental is saved while we confirm it with the provider." : "Your messages are saved in My numbers."}</p></div><StatusBadge status={active ? "active" : rental.status === "active" ? "expired" : rental.status} /></div>
    <div className="activation-service"><BrandIcon brand={serviceBrands[rental.service] || "generic"} size={39} /><div><strong>{rental.serviceName}</strong><span>{rental.countryName} · {rentLabel(rental.durationHours)} · {rental.giftFromName ? "Gift" : money(rental.price, rental.currency)}</span></div>{rental.isDemo && <span className="mini-tag">Sandbox rental</span>}</div>
    {rental.phone && <div className="phone-display"><span>YOUR RENTED NUMBER</span><div><strong>{rental.phone}</strong><button aria-label="Copy phone number" onClick={() => copy(rental.phone!, "Number")}><Copy size={19} /><span>Copy</span></button></div><p><ShieldCheck size={12} />Only you can see the messages for this number.</p></div>}
    {rental.status !== "reconciliation" && <div className="rental-timer"><Timer size={17} /><span>{active ? "Time remaining" : "Rental period"}</span><strong>{remainingLabel(left)}</strong><small>Ends {new Date(rental.expiresAt).toLocaleString()}</small></div>}
    {active && <div className="activation-actions"><button className="button button-secondary" onClick={check} disabled={checking}>{checking ? <Spinner size={15} /> : <RefreshCw size={15} />}{checking ? "Listening…" : "Check messages"}</button>{rental.isDemo && <button className="button button-ghost" onClick={sample} disabled={busy}>Send a sample message</button>}</div>}
    {rental.status === "reconciliation" && <InfoBox tone="amber">The provider response needs verification. Your wallet debit is saved. Please don’t rent again; contact support with order #{rental.orderId.slice(0, 8).toUpperCase()} so we can reconcile it safely.</InfoBox>}
    {rental.giftFromName && <InfoBox tone="green">🎁 A gift from {rental.giftFromName}.{rental.giftMessage ? ` “${rental.giftMessage}”` : ""}</InfoBox>}{rental.status === "refunded" && <InfoBox tone="green">{rental.giftFromName ? "This rental couldn’t be issued, so the sender was refunded." : <>This rental couldn’t be issued, so {money(rental.price, rental.currency)} was returned to your wallet.</>}</InfoBox>}
    <div className="rental-messages"><h3><MessageCircle size={17} />Messages{messages.length ? ` (${messages.length})` : ""}</h3>{messages.length ? messages.map((m, i) => <article className="rental-message" key={`${m.receivedAt}-${i}`}>{m.code && <div className="rental-code"><strong>{m.code}</strong><button className="button copy-code-button" onClick={() => copy(m.code, "Verification code")}><Copy size={14} />Copy code</button></div>}<p>{m.text}</p><small>{new Date(m.receivedAt).toLocaleString()}</small></article>) : <p className="rental-empty">{active ? "Nothing yet. Request an SMS on the platform and it will show up here." : "No messages arrived during this rental."}</p>}</div>
    <div className="activation-done-actions"><Link className="button button-primary" href="/numbers?tab=rentals">Rent another number<ArrowRight size={16} /></Link><Link className="button button-secondary" href="/numbers?tab=active">My numbers<History size={15} /></Link></div>
    <div className="activation-saved"><CheckCircle2 size={13} />It’s safe to leave this screen. Your rental is saved in My numbers.</div>
  </section>;
}

// Shown under one-time numbers on the "My numbers" tab.
export function MyRentals() {
  const { user } = useStore(); const [items, setItems] = useState<Rental[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { if (!user) { setLoading(false); return; } api<{ rentals: Rental[] }>("/api/sms/rentals").then(r => setItems(r.rentals)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [user]);
  if (!user || (!loading && !items.length && !error)) return null;
  return <div className="my-rentals"><h3 className="my-rentals-title"><Clock3 size={17} />Rented numbers</h3><InlineError message={error} />{loading ? <Loading label="Finding your rentals…" /> : <div className="active-numbers-grid">{items.map(r => { const live = r.status === "active" && new Date(r.expiresAt).getTime() > Date.now(); return <Link href={`/numbers?tab=rentals&rental=${r.id}`} className="active-number-card" key={r.id}><div className="active-number-top"><BrandIcon brand={serviceBrands[r.service] || "generic"} size={40} /><div><h3>{r.serviceName}</h3><p>{r.countryName} · {rentLabel(r.durationHours)}</p></div><StatusBadge status={live ? "active" : r.status === "active" ? "expired" : r.status} /></div><strong className="active-number-phone">{r.phone || "Confirming your rental…"}</strong><div className="active-number-footer"><span>{dateLabel(r.createdAt)}{r.isDemo ? " · Sandbox" : ""}</span><span>{r.messages.length ? `${r.messages.length} message${r.messages.length === 1 ? "" : "s"}` : "View rental"}<ArrowRight size={14} /></span></div></Link>; })}</div>}</div>;
}
