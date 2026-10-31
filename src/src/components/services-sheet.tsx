"use client";
import Link from "next/link";
import { BookOpen, BriefcaseBusiness, Code2, Crown, Gamepad2, Gift, Globe2, Mail, Phone, GraduationCap, Music2, Package, Palette, Server, Smartphone, Sparkles, Tv, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { categoryHref, type StoreCategory } from "@/lib/categories";
import { useStore } from "./app-provider";
import { Sheet } from "./sheet";

const icons: Record<string, LucideIcon> = { sim: Smartphone, social: Users, server: Server, crown: Crown, netflix: Tv, gift: Gift, package: Package, code: Code2, book: BookOpen, gamepad: Gamepad2, music: Music2, globe: Globe2, sparkles: Sparkles, briefcase: BriefcaseBusiness, graduation: GraduationCap, palette: Palette };
export function categoryIcon(category: Pick<StoreCategory, "icon">): LucideIcon { return icons[category.icon] || Package; }
const shortNames: Record<string, string> = { numbers: "SMS numbers", social: "Social accounts", proxies: "Proxies", premium: "Premium apps", subscriptions: "Subscriptions", digital: "Digital products", build: "Websites & bots" };

// "Everything pays from your wallet balance." — one place to jump to any service.
export function ServicesSheet({ onClose }: { onClose: () => void }) {
  const { categories } = useStore();
  const tiles = categories.flatMap((c, i) => {
    const tile = { key: c.id, href: categoryHref(c), label: shortNames[c.id] || c.name, Icon: categoryIcon(c) };
    // Boost isn't a store category; it sits right after virtual numbers.
    return i === 0 ? [tile, { key: "boost", href: "/boost", label: "Boost", Icon: TrendingUp }, { key: "gift", href: "/gift", label: "Send a gift", Icon: Gift }, { key: "mail", href: "/mail", label: "Temp mail", Icon: Mail }, { key: "temp-numbers", href: "/temp-numbers", label: "Temp numbers", Icon: Phone }] : [tile];
  });
  const list = categories.length ? tiles : [{ key: "numbers", href: "/numbers", label: "SMS numbers", Icon: Smartphone }, { key: "boost", href: "/boost", label: "Boost", Icon: TrendingUp }, { key: "gift", href: "/gift", label: "Send a gift", Icon: Gift }, { key: "mail", href: "/mail", label: "Temp mail", Icon: Mail }, { key: "temp-numbers", href: "/temp-numbers", label: "Temp numbers", Icon: Phone }];
  return <Sheet title="Services" subtitle="Everything pays from your wallet balance." onClose={onClose} className="services-sheet" footer={<Link className="sheet-link" href="/services" onClick={onClose}>Browse all services</Link>}>
    <span className="sheet-label">SERVICES</span>
    <div className="services-tiles">{list.map(({ key, href, label, Icon }) => <Link key={key} href={href} className="services-tile" onClick={onClose}><span className="services-tile-icon"><Icon size={24} strokeWidth={1.8} /></span><span>{label}</span></Link>)}</div>
  </Sheet>;
}
