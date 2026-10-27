import type { Metadata } from "next";
import { BoostFlow } from "@/components/boost-pages";
export const metadata: Metadata = { title: "Start a boost" };
export default function Page() { return <BoostFlow />; }
