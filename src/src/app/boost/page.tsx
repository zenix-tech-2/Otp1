import type { Metadata } from "next";
import { BoostPage } from "@/components/boost-pages";
export const metadata: Metadata = { title: "Boost your socials", description: "Followers, likes and views for your social accounts. Paste a link, pick a quantity and pay from your wallet." };
export default function Page() { return <BoostPage />; }
