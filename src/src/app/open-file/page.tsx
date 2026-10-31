import type { Metadata } from "next";
import { OpenFileView } from "@/components/pwa-pages";
export const metadata: Metadata = { title: "Open a file", robots: { index: false, follow: false } };
export default function Page() { return <OpenFileView />; }
