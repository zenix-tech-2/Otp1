import { DevOrderForm } from "@/components/dev-pages";
export default async function Page({ params }: { params: Promise<{ type: string }> }) { const { type } = await params; return <DevOrderForm typeId={type} />; }
