import { HomePage } from "@/components/home-page";

// The entry route is the real store, never a cached database-starter page.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <HomePage />;
}
