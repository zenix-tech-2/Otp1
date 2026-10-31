"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Inbox, Menu, MessageSquare, Phone, RefreshCw, ShieldAlert } from "lucide-react";
import { api, useStore } from "./app-provider";
import { Spinner } from "./ui";
import type { FreeCountry, FreeMessage, FreeNumber, NumberProviderOption } from "@/lib/tempnumbers-core";

type Tab = "numbers" | "inbox";
type Picked = { provider: string; country: string; countryName: string; number: FreeNumber };
async function copyText(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

/** Free, public temporary numbers: pick a country, pick a number, read its messages live. */
export function TempNumbersPage() {
  const { user, accountLoading, openPanel, notify } = useStore();
  const [providers, setProviders] = useState<NumberProviderOption[]>([]); const [provider, setProvider] = useState(""); const [countries, setCountries] = useState<FreeCountry[] | null>(null); const [country, setCountry] = useState(""); const [numbers, setNumbers] = useState<FreeNumber[] | null>(null);
  const [tab, setTab] = useState<Tab>("numbers"); const [pickOpen, setPickOpen] = useState(false); const [picked, setPicked] = useState<Picked | null>(null); const [messages, setMessages] = useState<FreeMessage[] | null>(null); const [limit, setLimit] = useState(30);
  const [error, setError] = useState(""); const [listError, setListError] = useState(""); const [refreshing, setRefreshing] = useState(false); const [copied, setCopied] = useState(""); const seen = useRef(new Set<string>());
  const countryName = countries?.find(c => c.id === country)?.name || "";

  const loadCountries = useCallback(async (p?: string) => {
    setCountries(null); setError("");
    try { const r = await api<{ providers: NumberProviderOption[]; provider: string; countries: FreeCountry[] }>(`/api/tempnumbers/countries${p ? `?provider=${p}` : ""}`); setProviders(r.providers); setProvider(r.provider); setCountries(r.countries); setCountry(c => (c && r.countries.some(x => x.id === c) ? c : r.countries[0]?.id || "")); }
    catch (e) { setError((e as Error).message); setCountries([]); }
  }, []);
  useEffect(() => { if (accountLoading || !user) return; loadCountries(); }, [user?.id, accountLoading, loadCountries]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!provider || !country) { setNumbers(null); return; } let cancelled = false; setNumbers(null);
    api<{ numbers: FreeNumber[] }>(`/api/tempnumbers/numbers?provider=${provider}&country=${country}`).then(r => { if (!cancelled) { setNumbers(r.numbers); setError(""); } }).catch(e => { if (!cancelled) { setError((e as Error).message); setNumbers([]); } });
    return () => { cancelled = true; };
  }, [provider, country]);

  const refresh = useCallback(async (quiet = false) => {
    if (!picked) return; if (!quiet) setRefreshing(true);
    try { const r = await api<{ messages: FreeMessage[] }>(`/api/tempnumbers/messages?provider=${picked.provider}&country=${picked.country}&number=${picked.number.local}&limit=${limit}`); setMessages(r.messages); setListError(""); }
    catch (e) { setListError((e as Error).message); } finally { setRefreshing(false); }
  }, [picked, limit]);
  useEffect(() => { setMessages(null); setListError(""); seen.current = new Set(); }, [picked]);
  useEffect(() => { if (!picked || tab !== "inbox") return; refresh(true); const t = setInterval(() => { if (document.visibilityState === "visible") refresh(true); }, 8000); return () => clearInterval(t); }, [picked, tab, refresh]);
  useEffect(() => { if (!messages) return; if (seen.current.size && messages.some(m => !seen.current.has(m.id))) notify("New message arrived."); seen.current = new Set(messages.map(m => m.id)); }, [messages, notify]);

  async function doCopy(text: string, key: string) { if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied(""), 1600); } else notify("Couldn’t copy. Select and copy it manually.", "error"); }
  function choose(n: FreeNumber) { setPicked({ provider, country, countryName, number: n }); setLimit(30); setTab("inbox"); }

  const bar = (title: string, right?: ReactNode) => <header className="tm-bar"><button className="tm-round" aria-label="Open menu" onClick={() => openPanel("menu")}><Menu size={22}/></button><h1>{title}</h1>{right || <span className="tm-round-space"/>}</header>;
  const shell = (title: string, body: ReactNode, right?: ReactNode, tabs = true) => <div className="tm-app"><div className="tm-frame-col">{bar(title, right)}<div className="tm-scroll">{body}</div>{tabs && <nav className="tm-tabs tn-tabs" aria-label="Temp numbers sections">{([["numbers", "Numbers", Phone], ["inbox", "Inbox", Inbox]] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); setPickOpen(false); }}><span className="tm-tab-icon"><Icon size={26}/></span>{label}</button>)}</nav>}</div></div>;

  if (accountLoading) return shell("Temp Numbers", <div className="tm-center"><Spinner size={28}/></div>, undefined, false);
  if (!user) return shell("Temp Numbers", <div className="tm-center tm-signin"><span className="tm-signin-art"><Phone size={34}/></span><h2>Sign in to use free numbers</h2><p>Pick a temporary number and read its messages live.</p><button className="tm-green" onClick={() => openPanel("login")}>Sign in</button><Link href="/" className="tm-link">Back to home</Link></div>, undefined, false);

  const warning = <p className="tm-sheet-note tn-warning"><ShieldAlert size={14}/>These numbers are shared and public. Anyone can read their messages, so don’t use them for banking or accounts you need to keep.</p>;
  const numbersScreen = <div className="tm-pad">{error && <p className="tm-error" role="alert">{error}</p>}
    {providers.length > 1 && <div className="tn-versions" role="radiogroup" aria-label="Number version">{providers.map(p => <button key={p.id} role="radio" aria-checked={p.id === provider} className={p.id === provider ? "on" : ""} onClick={() => { setProvider(p.id); setPicked(null); loadCountries(p.id); }}>{p.label}</button>)}</div>}
    <div className="tm-picker"><button className="tm-select" aria-haspopup="listbox" aria-expanded={pickOpen} disabled={!countries?.length} onClick={() => setPickOpen(o => !o)}><span>{countries === null ? "Loading countries…" : countryName || "No countries available"}</span><ChevronDown size={22} className={pickOpen ? "flip" : ""}/></button>
      {pickOpen && countries && <><div className="tm-pick-scrim" onClick={() => setPickOpen(false)}/><ul className="tm-options" role="listbox">{countries.map(c => <li key={c.id}><button role="option" aria-selected={c.id === country} className={c.id === country ? "on" : ""} onClick={() => { setCountry(c.id); setPickOpen(false); }}><span>{c.name}</span></button></li>)}</ul></>}</div>
    {warning}
    {numbers === null && country ? <div className="tm-center"><Spinner size={26}/></div> : numbers && !numbers.length ? <div className="tm-dashed">No free numbers are available for this country right now. Try another country.</div> :
      <ul className="tm-addr-list">{numbers?.map(n => <li key={n.local} className={picked?.number.local === n.local && picked.country === country ? "on" : ""}><button className="tm-addr-main" onClick={() => choose(n)}><strong>{n.number}</strong><small>{countryName}{n.ago ? ` · added ${n.ago}` : ""}</small></button><button className="tm-addr-open" aria-label={`Open inbox for ${n.number}`} onClick={() => choose(n)}><MessageSquare size={19}/></button></li>)}</ul>}</div>;

  const inboxScreen = !picked ? <div className="tm-pad"><div className="tm-dashed">Pick a number first, then its messages will appear here.</div><button className="tm-soft tn-soft" onClick={() => setTab("numbers")}><Phone size={20}/>Choose a number</button></div> :
    <div className="tm-pad"><div className="tn-card"><span className="tn-card-label">{picked.countryName}</span><p className="tn-number">{picked.number.number}</p><button className="tm-green" onClick={() => doCopy(picked.number.number, "num")}>{copied === "num" ? <><Check size={20}/>Copied</> : <><Copy size={20}/>Copy number</>}</button></div>
      {warning}{listError && <p className="tm-error" role="alert">{listError}</p>}
      {messages === null && !listError ? <div className="tm-center"><Spinner size={26}/></div> : messages && !messages.length ? <div className="tm-dashed">No messages yet. Use the number on a sign-up page and the text will show up here by itself.</div> :
        <ul className="tm-msgs">{messages?.map(m => <li key={m.id} className="tn-msg"><span className="tm-avatar"><MessageSquare size={18}/></span><span className="tm-msg-main"><span className="tm-msg-top"><strong>{m.from ? `From ${m.from}` : "Unknown sender"}</strong><time>{m.ago}</time></span><span className="tn-text">{m.text}</span>{m.code && <button className="tn-code" onClick={() => doCopy(m.code!, m.id)}>{copied === m.id ? <><Check size={14}/>Copied</> : <><Copy size={14}/>Code {m.code}</>}</button>}</span></li>)}</ul>}
      {messages && messages.length >= limit && limit < 100 && <button className="tm-soft tn-soft" onClick={() => setLimit(100)}>Show more</button>}</div>;

  if (tab === "inbox") return shell("Inbox", inboxScreen, <button className="tm-round" aria-label="Refresh messages" onClick={() => refresh()} disabled={refreshing || !picked}><RefreshCw size={20} className={refreshing ? "spin" : ""}/></button>);
  return shell("Temp Numbers", numbersScreen);
}
