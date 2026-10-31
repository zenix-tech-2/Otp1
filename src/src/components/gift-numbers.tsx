"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, MessageCircle, Search } from "lucide-react";
import type { Country, RentCountry, Service } from "@/lib/numberotp";
import { flagEmoji } from "@/lib/catalog";
import { rentLabel } from "@/lib/rent-label";
import { api, useMoney } from "./app-provider";
import { BrandIcon, InlineError, Loading } from "./ui";

export type NumberPick = { kind: "sms" | "rental"; service: Service; country: { id: string; name: string }; hours?: number; priceUsd: number; label: string; detail: string };
const popular = ["wa", "tg", "go", "ig", "fb", "lf", "dr", "tw", "am", "wx", "ds", "nf"];

/** Picks a number to give away: one-time code or rental, then service, country and (for rentals) how long. */
export function NumberPicker({ pick, onPick }: { pick: NumberPick | null; onPick: (p: NumberPick | null) => void }) {
  const { price } = useMoney();
  const [kind, setKind] = useState<"sms" | "rental">("sms"); const [services, setServices] = useState<Service[] | null>(null); const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [service, setService] = useState<Service | null>(null);
  const [countries, setCountries] = useState<(Country | RentCountry)[] | null>(null); const [countryQuery, setCountryQuery] = useState(""); const [rentCountryId, setRentCountryId] = useState<string | null>(null);
  useEffect(() => { api<{ services: Service[] }>("/api/sms/catalog").then(r => setServices(r.services)).catch(e => { setError((e as Error).message); setServices([]); }); }, []);
  useEffect(() => {
    if (!service) { setCountries(null); return; } let cancelled = false; setCountries(null); setError(""); setRentCountryId(null);
    const url = kind === "sms" ? `/api/sms/catalog?service=${encodeURIComponent(service.code)}` : `/api/sms/rentals/catalog?service=${encodeURIComponent(service.code)}`;
    api<{ countries: (Country | RentCountry)[] }>(url).then(r => { if (!cancelled) setCountries(r.countries); }).catch(e => { if (!cancelled) { setError((e as Error).message); setCountries([]); } });
    return () => { cancelled = true; };
  }, [service, kind]);
  const shownServices = useMemo(() => { const q = query.trim().toLowerCase(); const list = services || []; if (q) return list.filter(s => s.name.toLowerCase().includes(q)).slice(0, 60); return [...list.filter(s => popular.includes(s.code)).sort((a, b) => popular.indexOf(a.code) - popular.indexOf(b.code)), ...list.filter(s => !popular.includes(s.code))].slice(0, 40); }, [services, query]);
  const shownCountries = useMemo(() => { const q = countryQuery.trim().toLowerCase(); return (countries || []).filter(c => c.name.toLowerCase().includes(q)); }, [countries, countryQuery]);
  const rentCountry = kind === "rental" ? (countries as RentCountry[] | null)?.find(c => c.id === rentCountryId) || null : null;
  function switchKind(next: "sms" | "rental") { if (next === kind) return; setKind(next); setService(null); setQuery(""); setCountryQuery(""); onPick(null); }
  function chooseService(s: Service) { setService(s); setCountryQuery(""); onPick(null); }
  function back() { setService(null); setRentCountryId(null); onPick(null); }

  return <div className="gift-numbers">
    <div className="gift-seg gift-seg-sm" role="radiogroup" aria-label="Number type"><button type="button" role="radio" aria-checked={kind === "sms"} className={kind === "sms" ? "on" : ""} onClick={() => switchKind("sms")}><MessageCircle size={14}/>One-time code</button><button type="button" role="radio" aria-checked={kind === "rental"} className={kind === "rental" ? "on" : ""} onClick={() => switchKind("rental")}><Clock3 size={14}/>Rental</button></div>
    <p className="extras-hint">{kind === "sms" ? "A number that receives one verification code. If no code arrives, you’re refunded." : "A private number that receives unlimited messages for the time you choose."}</p>
    <InlineError message={error}/>
    {!service ? <>
      <label className="gift-search"><Search size={16}/><input aria-label="Search services" placeholder="Search apps and services" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {services === null ? <Loading label="Loading services…"/> : !shownServices.length ? <p className="extras-hint">No services match that search.</p> : <div className="gift-products" role="list">{shownServices.map(s => <button type="button" role="listitem" key={s.code} className="gift-product" onClick={() => chooseService(s)}><BrandIcon brand={s.brand} logo={s.logo} size={36}/><span><strong>{s.name}</strong></span></button>)}</div>}
    </> : <>
      <button type="button" className="gift-back" onClick={back}><ArrowLeft size={14}/>Change service</button>
      <div className="gift-picked"><BrandIcon brand={service.brand} logo={service.logo} size={34}/><strong>{service.name}</strong></div>
      <label className="gift-search"><Search size={16}/><input aria-label="Search countries" placeholder="Search countries" value={countryQuery} onChange={e => setCountryQuery(e.target.value)}/></label>
      {countries === null ? <Loading label="Checking availability…"/> : !shownCountries.length ? <p className="extras-hint">No countries available for this service right now.</p> : kind === "sms" ?
        <div className="gift-products" role="listbox" aria-label="Countries">{(shownCountries as Country[]).map(c => <button type="button" role="option" aria-selected={pick?.country.id === c.id} key={c.id} disabled={c.count <= 0} className={`gift-product ${pick?.country.id === c.id ? "selected" : ""}`} onClick={() => onPick({ kind: "sms", service, country: { id: c.id, name: c.name }, priceUsd: c.price, label: `${service.name} · ${c.name}`, detail: "One-time code" })}><span className="gift-flag">{flagEmoji(c.iso)}</span><span><strong>{c.name}</strong><small>{c.count > 0 ? "Available" : "Out of stock"}</small></span><b>{price(c.price)}</b></button>)}</div> :
        <div className="gift-products" role="listbox" aria-label="Countries">{(shownCountries as RentCountry[]).map(c => { const live = c.options.filter(o => o.count > 0); const from = live.length ? Math.min(...live.map(o => o.price)) : null; return <button type="button" role="option" aria-selected={rentCountryId === c.id} key={c.id} disabled={!live.length} className={`gift-product ${rentCountryId === c.id ? "selected" : ""}`} onClick={() => { setRentCountryId(c.id); onPick(null); }}><span className="gift-flag">{flagEmoji(c.iso)}</span><span><strong>{c.name}</strong><small>{live.length ? `${live.length} duration${live.length === 1 ? "" : "s"}` : "Unavailable"}</small></span>{from != null && <b>from {price(from)}</b>}</button>; })}</div>}
      {rentCountry && <div className="gift-durations" role="radiogroup" aria-label="Rental duration">{rentCountry.options.filter(o => o.count > 0).map(o => <button type="button" role="radio" aria-checked={pick?.hours === o.hours} key={o.hours} className={pick?.hours === o.hours ? "on" : ""} onClick={() => onPick({ kind: "rental", service, country: { id: rentCountry.id, name: rentCountry.name }, hours: o.hours, priceUsd: o.price, label: `${service.name} · ${rentCountry.name}`, detail: `${rentLabel(o.hours)} rental` })}><strong>{rentLabel(o.hours)}</strong><small>{price(o.price)}</small></button>)}</div>}
    </>}
  </div>;
}
