import { RequestDetail } from "@/components/dev-pages";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <RequestDetail id={id} />; }
