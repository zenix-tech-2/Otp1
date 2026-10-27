"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Heart, Hourglass, Package, Search, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, X, Zap } from "lucide-react";
import type { PublicProduct } from "@/db/schema";
import { categoryHref, productHref, type StoreCategory } from "@/lib/categories";
import { flagFor } from "@/lib/countries";
import { useMoney, useStore } from "./app-provider";
import { Sheet } from "./sheet";
import { ageLabel, ageMonths } from "@/lib/account-age";
import { categoryIcon } from "./services-sheet";
import { BrandIcon, EmptyState } from "./ui";

const PAGE_SIZE = 24;
const SAVED_KEY = "digisms:saved-products";
const sorts = [["featured", "Featured first"], ["price-low", "Price: low to high"], ["price-high", "Price: high to low"], ["name", "Name: A to Z"], ["age", "Oldest accounts first"]] as const;
const isInstant = (p: Pick<PublicProduct, "metadata">) => p.metadata.deliveryMode !== "manual";
function metaLine(p: PublicProduct, categoryName: string) {
  if (p.metadata.country) return `${flagFor(p.metadata.countryCode)} ${p.metadata.country}${p.metadata.plan ? ` · ${p.metadata.plan}` : p.metadata.platform ? ` · ${p.metadata.platform}` : ""}`;
  if (p.metadata.duration) return `${p.metadata.plan || "Premium access"} · ${p.metadata.duration}`;
  return p.metadata.format || p.metadata.bandwidth || p.metadata.platform || categoryName;
}
// Saved (♥) products live in this browser only.
function useSaved() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => { try { const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); if (Array.isArray(raw)) setSaved(raw.filter((x): x is string => typeof x === "string")); } catch { /* storage unavailable */ } }, []);
  const toggle = useCallback((id: string) => setSaved(current => { const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]; try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } return next; }), []);
  return { saved, toggle };
}

export function StorePage({ categoryId = "all", categorySlug }: { categoryId?: string; categorySlug?: string }) {
  const { products, categories } = useStore(); const router = useRouter(); const params = useSearchParams();
  const category = categoryId; const query = params.get("q") || ""; const sort = params.get("sort") || "featured";
  const [search, setSearch] = useState(query); const [page, setPage] = useState(1); const [filterOpen, setFilterOpen] = useState(false); const [inStockOnly, setInStockOnly] = useState(false); const [savedOnly, setSavedOnly] = useState(false); const [quick, setQuick] = useState<PublicProduct | null>(null);
  const { saved, toggle } = useSaved();
  useEffect(() => setSearch(query), [query]);
  useEffect(() => setPage(1), [category, query, sort, inStockOnly, savedOnly]);
  function update(key: string, value: string) {
    const q = new URLSearchParams(params.toString()); q.delete("category"); let path = categorySlug ? `/store/${categorySlug}` : "/store";
    if (key === "category") { const selected = categories.find(c => c.id === value); path = value === "all" ? "/store" : selected ? categoryHref(selected) : "/store"; }
    else if (value && value !== "featured") q.set(key, value); else q.delete(key);
    router.push(path + (q.size ? `?${q}` : ""), { scroll: false });
  }
  const selected = categories.find(c => c.id === category); const categoryName = (id: string) => categories.find(c => c.id === id)?.name || "Digital essential";
  const filtered = useMemo(() => products.filter(p => (category === "all" || p.category === category) && (!query || `${p.name} ${p.description} ${p.brand}`.toLowerCase().includes(query.toLowerCase())) && (!inStockOnly || p.stock > 0) && (!savedOnly || saved.includes(p.id))).sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : sort === "name" ? a.name.localeCompare(b.name) : sort === "age" ? ageMonths(b.metadata.accountAge) - ageMonths(a.metadata.accountAge) : Number(!!b.badge) - Number(!!a.badge)), [products, category, query, sort, inStockOnly, savedOnly, saved]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); const current = Math.min(page, pages); const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const activeFilters = Number(sort !== "featured") + Number(inStockOnly) + Number(savedOnly);
  const premium = !!selected && (selected.formType === "premium" || selected.slug === "premium");
  return <main className="site-main inner-main mk-main" data-screen="marketplace">
    <header className="mk-head"><div><span className="mk-count">{filtered.length.toLocaleString("en")} live {filtered.length === 1 ? "listing" : "listings"}</span><h1>{selected?.name || "Marketplace"}</h1></div><Link className="mk-purchases" href="/orders"><Package size={17} />Purchases</Link></header>
    <div className="mk-searchbar"><form className="mk-search" role="search" onSubmit={e => { e.preventDefault(); update("q", search.trim()); }}><Search size={18} /><input aria-label="Search products" placeholder="Search Instagram, Netflix, VPN…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); update("q", ""); }}><X size={15} /></button>}</form>
      <button className="mk-filter" aria-label={activeFilters ? `Sort and filter, ${activeFilters} active` : "Sort and filter"} aria-haspopup="dialog" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={20} />{activeFilters > 0 && <span className="mk-filter-badge">{activeFilters}</span>}</button></div>
    <div className="mk-tabs" role="tablist" aria-label="Categories"><button role="tab" aria-selected={category === "all"} className={category === "all" ? "selected" : ""} onClick={() => update("category", "all")}><Sparkles size={16} />All</button>{categories.filter(c => c.kind === "products").map(c => { const Icon = categoryIcon(c); return <button role="tab" aria-selected={category === c.id} key={c.id} className={category === c.id ? "selected" : ""} onClick={() => update("category", c.id)}><Icon size={16} />{c.name}</button>; })}</div>
    {premium && <PremiumHero category={selected!} />}
    {query && <p className="mk-query">Results for <strong>“{query}”</strong></p>}
    {filtered.length ? premium ? <><span className="mk-label">CHOOSE A SUBSCRIPTION</span><div className="pm-list">{visible.map(p => <PremiumCard key={p.id} product={p} />)}</div></>
      : <div className="mk-grid">{visible.map(p => <MarketCard key={p.id} product={p} categoryName={categoryName(p.category)} saved={saved.includes(p.id)} onSave={() => toggle(p.id)} onBuy={() => setQuick(p)} />)}</div>
      : <EmptyState title="Nothing here just yet." description={savedOnly ? "You haven’t saved anything yet. Tap the heart on a product to keep it here." : "Try another search or category. Your next favorite might be one click away."}><button className="button button-primary" onClick={() => { setSavedOnly(false); setInStockOnly(false); router.push("/store"); }}>Explore all products<ArrowRight size={15} /></button></EmptyState>}
    {pages > 1 && <Pager page={current} pages={pages} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    <Link className="numbers-crosslink" href={query ? `/numbers?q=${encodeURIComponent(query)}` : "/numbers"}><span className="crosslink-icon"><Smartphone size={25} /></span><div><h3>Just need a verification code?</h3><p>Keep your personal number private. Explore our virtual numbers.</p></div><span className="text-link">Get a number<ArrowRight size={16} /></span></Link>
    {filterOpen && <Sheet title="Sort & filter" subtitle="Find exactly what you need." onClose={() => setFilterOpen(false)} className="mk-filter-sheet" footer={<div className="mk-filter-actions"><button className="button button-secondary" onClick={() => { update("sort", "featured"); setInStockOnly(false); setSavedOnly(false); }}>Reset</button><button className="button button-primary" onClick={() => setFilterOpen(false)}>Show {filtered.length} {filtered.length === 1 ? "listing" : "listings"}</button></div>}>
      <span className="sheet-label">SORT BY</span><div className="mk-options" role="radiogroup" aria-label="Sort products">{sorts.filter(([value]) => value !== "age" || products.some(p => p.metadata.accountAge)).map(([value, label]) => <button key={value} role="radio" aria-checked={sort === value} className={sort === value ? "selected" : ""} onClick={() => update("sort", value)}>{label}{sort === value && <Check size={16} />}</button>)}</div>
      <span className="sheet-label">SHOW</span><div className="mk-toggles"><label><input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} /><span>In stock only</span></label><label><input type="checkbox" checked={savedOnly} onChange={e => setSavedOnly(e.target.checked)} /><span>Saved only</span></label></div>
    </Sheet>}
    {quick && <ProductSheet product={quick} onClose={() => setQuick(null)} />}
  </main>;
}

function MarketCard({ product, categoryName, saved, onSave, onBuy }: { product: PublicProduct; categoryName: string; saved: boolean; onSave: () => void; onBuy: () => void }) {
  const { price } = useMoney(); const out = product.stock <= 0; const discounted = !!product.comparePrice && product.comparePrice > product.price;
  return <article className={`mk-card ${out ? "is-out" : ""}`}><div className="mk-card-top"><Link href={productHref(product.id)} className="mk-card-icon" aria-label={`View ${product.name}`}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <BrandIcon brand={product.brand} size={36} />}</Link>{isInstant(product) && <span className="mk-bolt" title="Instant delivery"><Zap size={12} />Instant</span>}<button className={`mk-heart ${saved ? "saved" : ""}`} aria-pressed={saved} aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`} onClick={onSave}><Heart size={18} fill={saved ? "currentColor" : "none"} /></button></div>
    <Link href={productHref(product.id)} className="mk-card-title"><h3>{product.name}</h3><p>{metaLine(product, categoryName)}</p>{product.metadata.accountAge && <span className="age-pill"><Hourglass size={11} />{ageLabel(product.metadata.accountAge)} old</span>}</Link>
    <div className="mk-card-price"><strong>{price(product.price)}</strong>{discounted && <del>{price(product.comparePrice!)}</del>}</div>
    <div className="mk-card-foot"><span className={`mk-stock ${out ? "out" : ""}`}><i />{out ? "Sold out" : product.metadata.deliveryMode === "inventory" ? `${product.stock} in stock` : "In stock"}</span>{product.badge && <span className="mk-badge">{product.badge}</span>}</div>
    <button className="mk-buy" disabled={out} onClick={onBuy}>{out ? "Sold out" : "Buy"}</button></article>;
}

function ProductSheet({ product, onClose }: { product: PublicProduct; onClose: () => void }) {
  const { price, money, localPrice, pricingReady } = useMoney(); const { user, settings, openPanel } = useStore(); const router = useRouter(); const [more, setMore] = useState(false);
  const local = localPrice(product.price); const afford = !!user && local != null && user.balance >= local; const long = product.description.length > 140; const out = product.stock <= 0;
  return <Sheet title={product.name} onClose={onClose} className="mk-sheet" footer={<>
    <div className="mk-pay"><span>You pay <i>·</i> 1 item</span><strong>{price(product.price)}</strong></div>
    <div className="mk-wallet"><span className="mk-wallet-avatar">{(user?.name || "?").charAt(0).toUpperCase()}</span><span>{user ? "Paying from wallet" : "Sign in to pay from your wallet"}</span><strong>{user ? money(user.balance) : ""}</strong></div>
    {user && local != null && !afford && !out && <p className="mk-low">Your wallet needs a little more credit. <button onClick={() => { onClose(); openPanel("wallet"); }}>Add funds<ArrowRight size={12} /></button></p>}
    <button className="button button-primary button-full mk-sheet-buy" disabled={out || (!!user && (!pricingReady || !afford))} onClick={() => { onClose(); if (!user) openPanel("login"); else router.push(`${productHref(product.id)}/checkout`); }}>{out ? "Sold out" : !user ? "Sign in to buy" : "Buy now"}<ArrowRight size={17} /></button></>}>
    <div className="mk-sheet-icon">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <BrandIcon brand={product.brand} size={58} />}</div>
    <p className="mk-sheet-name">{product.name}</p><p className="mk-sheet-price">{price(product.price)}</p>
    <div className="mk-sheet-chips"><span className={out ? "out" : ""}><i />{out ? "Sold out" : (product.metadata.deliveryMode === "inventory" ? `${product.stock} available` : "In stock")}</span>{isInstant(product) ? <span><Zap size={13} />Instant delivery</span> : <span>Manual delivery</span>}{product.metadata.accountAge && <span><Hourglass size={13} />{ageLabel(product.metadata.accountAge)} old</span>}</div>
    <Link className="mk-seller" href="/store" onClick={onClose}><span className="mk-seller-avatar"><ShieldCheck size={22} /></span><span><strong>{settings.appName} <ShieldCheck size={14} /></strong><small>Official store · secure checkout</small></span><ChevronRight size={18} /></Link>
    <h3 className="mk-sheet-h">Description</h3><p className={`mk-sheet-desc ${more ? "open" : ""}`}>{product.description}</p>
    {long && <button className="mk-more" onClick={() => setMore(v => !v)}>{more ? "Show less" : "Show more"}<ChevronDown size={16} className={more ? "flip" : ""} /></button>}
    <Link className="mk-details-link" href={productHref(product.id)} onClick={onClose}>See full details<ArrowRight size={14} /></Link>
  </Sheet>;
}

function PremiumHero({ category }: { category: StoreCategory }) {
  return <section className="bz-hero pm-hero"><span className="bz-eyebrow">PREMIUM</span><h1>Premium for the apps <em>you already use.</em></h1><p>{category.detail} Pay from your wallet and get your delivery details right after checkout.</p><Link className="bz-cta" href="/orders">My purchases<ArrowRight size={18} /></Link></section>;
}
function PremiumCard({ product }: { product: PublicProduct }) {
  const { price } = useMoney();
  return <Link href={productHref(product.id)} className="pm-card"><span className="pm-card-icon">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <BrandIcon brand={product.brand} size={50} />}</span><ArrowRight className="pm-arrow" size={20} /><h3>{product.name}</h3><p>Starting at {price(product.price)}{product.metadata.duration ? ` · ${product.metadata.duration}` : ""} ({isInstant(product) ? "delivered instantly" : "delivered after review"})</p></Link>;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const nums: number[] = []; const start = Math.max(1, Math.min(page - 2, pages - 4)); for (let n = start; n <= Math.min(pages, start + 4); n++) nums.push(n);
  return <nav className="mk-pager" aria-label="Pagination"><button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button>{nums.map(n => <button key={n} className={n === page ? "current" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>)}<button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button></nav>;
}
