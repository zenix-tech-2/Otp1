import type { Metadata } from "next";
import { NotesView } from "@/components/pwa-pages";
export const metadata: Metadata = { title: "Quick notes", description: "Private notes saved on this device only.", robots: { index: false, follow: false } };
export default function Page() { return <NotesView />; }
