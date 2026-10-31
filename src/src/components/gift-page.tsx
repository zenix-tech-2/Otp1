"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Gift, Package, Search, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import type { Order } from "@/db/schema";
import { GIFT_MESSAGE_MAX } from "@/lib/gift-core";
import { api, useMoney, useStore } from "./app-provider";
import { CustomerScreen } from "./customer-screen";
import { NumberPicker, type NumberPick } from "./gift-numbers";
import { BrandIcon, EmptyState, InfoBox, InlineError, Spinner } from "./ui";

type Mode = "product" | "number";
/** The one place where gifting starts: pick a friend, pick a product or a number, pay from your wallet. Checkout itself stays gift-free. */
export function GiftPage() {
  const { products, categories, user, accountLoading, openPanel, refreshAccount, refreshCatalog, notify } = useStore(); const { money, price, localPrice, currency, pricingReady } = useMoney();
  const router = useRouter(); const params = useSearchParams(); const key = useRef(crypto.randomUUID());
  const [mode, setMode] = useState<Mode>(params.get("type") === "number" ? "number" : "product");
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [to, setTo] = useState<{ email: string; name: string } | null>(null); const [lookupBusy, setLookupBusy] = useState(false); const [lookupError, setLookupError] = useState("");
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState<string | null>(params.get("product")); const [numberPick, setNumberPick] = useState<NumberPick | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const available = useMemo(() => products.filter(p => p.stock > 0), [products]);
  const shown = useMemo(() => { const q = query.trim().toLowerCase(); return q ? available.filter(p => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q)) : available; }, [available, query]);
  const product = mode === "product" ? available.find(p => p.id === selected) || null : null;
  const usd = mode === "product" ? product?.price ?? null : numberPick?.priceUsd ?? null; const chosen = usd != null; const amount = usd != null ? localPrice(usd) : null;
  const recipientOk = to !== null && to.email === email.trim().toLowerCase(); const canAfford = amount != null && (user?.balance || 0) >= amount;
  function changeMode(next: Mode) { if (next === mode) return; setMode(next); setError(""); key.current = crypto.randomUUID(); }
  async function lookup() { setLookupBusy(true); setLookupError(""); setTo(null); try { const e = email.trim().toLowerCase(); const r = await api<{ name: string }>("/api/gifts", { method: "POST", body: JSON.stringify({ email: e }) }); setTo({ email: e, name: r.name }); } catch (e) { setLookupError((e as Error).message); } finally { setLookupBusy(false); } }
  async function send() {
    if (!to || usd == null) return; setBusy(true); setError(""); const gift = { email: to.email, message: message.trim() };
    try {
      if (mode === "product" && product) {
        const result = await api<{ order: Order }>("/api/orders", { method: "POST", body: JSON.stringify({ productId: product.id, expectedPrice: product.price, expectedAmount: amount ?? undefined, expectedCurrency: currency, idempotencyKey: key.current, gift }) });
        await Promise.all([refreshAccount(), refreshCatalog()]); notify(`Your gift to ${to.name} is on its way.`); router.push(`/orders/${result.order.id}`);
      } else if (numberPick) {
        const base = { service: numberPick.service.code, country: numberPick.country.id, countryName: numberPick.country.name, expectedPrice: numberPick.priceUsd, expectedAmount: amount ?? undefined, expectedCurrency: currency, idempotencyKey: key.current, gift };
        const rental = numberPick.kind === "rental";
        const result = await api<{ gift?: { orderId: string; toName: string }; warning?: string }>(rental ? "/api/sms/rentals" : "/api/sms/activations", { method: "POST", body: JSON.stringify(rental ? { ...base, hours: numberPick.hours } : base) });
        await refreshAccount(); if (result.warning) notify(result.warning, "error"); else notify(`Your number gift to ${to.name} is on its way.`);
        router.push(result.gift ? `/orders/${result.gift.orderId}` : "/orders");
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const aside = <><div className="screen-aside-art"><Gift size={52}/><span>✦</span></div><h2>Make someone’s day.</h2><p>Send a product or a phone number straight to a friend’s Store OTP account. You pay from your wallet, they get the delivery.</p><div className="screen-assurance"><ShieldCheck size={19}/><div><strong>Private by design</strong><span>We only show their first name and last initial, and you never see their number or codes.</span></div></div></>;
  if (accountLoading) return <CustomerScreen title="Send a gift" eyebrow="GIFTING" screen="gift" backHref="/" backLabel="Back to home" aside={aside}><div className="loading-state"><Spinner size={26}/></div></CustomerScreen>;
  if (!user) return <CustomerScreen title="Send a gift" subtitle="Sign in to send a gift to a friend." eyebrow="GIFTING" screen="gift" backHref="/" backLabel="Back to home" aside={aside}><EmptyState title="Sign in to start gifting" description="You’ll need an account and a little wallet balance to send a gift." icon={<Gift size={32}/>}><button className="button button-primary" onClick={() => openPanel("login")}>Sign in<ArrowRight size={16}/></button></EmptyState></CustomerScreen>;
  return <CustomerScreen title="Send a gift" subtitle="Pick a friend, pick a gift, and we’ll deliver it to their account." eyebrow="GIFTING" screen="gift" backHref="/" backLabel="Back to home" aside={aside}>
    <div className="gift-seg" role="radiogroup" aria-label="What would you like to gift?"><button type="button" role="radio" aria-checked={mode === "product"} className={mode === "product" ? "on" : ""} onClick={() => changeMode("product")}><Package size={16}/>Products</button><button type="button" role="radio" aria-checked={mode === "number"} className={mode === "number" ? "on" : ""} onClick={() => changeMode("number")}><Smartphone size={16}/>Numbers</button></div>
    <section className="gift-step"><h3><span>1</span>Who’s it for?</h3>
      <input type="email" aria-label="Recipient email" placeholder="Friend’s Store OTP email" value={email} autoComplete="off" onChange={e => { setEmail(e.target.value); setLookupError(""); }} onBlur={() => { if (email.trim() && !to && !lookupBusy) lookup(); }}/>
      {recipientOk ? <span className="extras-ok"><CheckCircle2 size={15}/>Sending to {to!.name}</span> : <button type="button" className="button button-secondary button-small" disabled={lookupBusy || !email.includes("@")} onClick={lookup}>{lookupBusy ? <Spinner size={14}/> : "Check recipient"}</button>}
      <InlineError message={lookupError}/>
      <textarea aria-label="Gift message" placeholder="Add a short message (optional)" maxLength={GIFT_MESSAGE_MAX} value={message} onChange={e => setMessage(e.target.value)}/></section>
    <section className="gift-step"><h3><span>2</span>{mode === "product" ? "Choose a gift" : "Choose a number"}</h3>
      {mode === "product" ? <>
        <label className="gift-search"><Search size={16}/><input aria-label="Search products" placeholder="Search products" value={query} onChange={e => setQuery(e.target.value)}/></label>
        {!shown.length ? <p className="extras-hint">{available.length ? "Nothing matches that search." : "No products are available to gift right now."}</p> : <div className="gift-products" role="listbox" aria-label="Products">{shown.map(p => <button type="button" role="option" aria-selected={p.id === selected} key={p.id} className={`gift-product ${p.id === selected ? "selected" : ""}`} onClick={() => { key.current = crypto.randomUUID(); setSelected(p.id); }}><BrandIcon brand={p.brand} size={40} logo={p.imageUrl || undefined}/><span><strong>{p.name}</strong><small>{categories.find(c => c.id === p.category)?.name || p.category}</small></span><b>{price(p.price)}</b></button>)}</div>}</> :
        <NumberPicker pick={numberPick} onPick={p => { key.current = crypto.randomUUID(); setNumberPick(p); }}/>}</section>
    <section className="gift-step"><h3><span>3</span>Review &amp; send</h3>
      {chosen ? <div className="checkout-summary"><div><span>Gift</span><strong>{mode === "product" ? product?.name : `${numberPick?.label}`}</strong></div>{mode === "number" && <div><span>Type</span><strong>{numberPick?.detail}</strong></div>}<div><span>To</span><strong>{recipientOk ? to!.name : "—"}</strong></div><div className="checkout-total"><span>Your total</span><strong>{price(usd!)}</strong></div></div> : <p className="extras-hint">{mode === "product" ? "Choose a product above to see your total." : "Choose a service and country above to see your total."}</p>}
      <div className="checkout-wallet"><Wallet size={18}/><span>Pay with store wallet</span><strong>{money(user.balance)}</strong></div>
      {chosen && !canAfford && <InfoBox tone="amber">Your wallet needs a little more credit. <button className="text-link-button" onClick={() => openPanel("wallet")}>Top up your wallet<ArrowRight size={12}/></button></InfoBox>}
      {mode === "number" && chosen && <p className="extras-hint">If the number never delivers, the amount returns to your wallet automatically.</p>}
      <InlineError message={error}/>
      <button className="button button-primary button-full" disabled={busy || !chosen || !recipientOk || !canAfford || !pricingReady} onClick={send}>{busy ? <Spinner/> : <><Gift size={17}/>Confirm gift purchase<ArrowRight size={17}/></>}</button>
      <p className="secure-caption"><ShieldCheck size={13}/>They’ll get a notification{mode === "product" ? " and the delivery in their purchases" : " and the number in My numbers"}. <Link href="/orders">See my purchases</Link></p></section>
  </CustomerScreen>;
}
