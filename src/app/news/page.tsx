import {NewsListing} from "@/components/news-pages";
import {listArticles} from "@/lib/news";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;const page=Math.min(10000,Math.max(1,Number(query.page)||1));const q=typeof query.q==='string'?query.q.slice(0,100):"";const data=await listArticles("news",Math.floor(page),q);return <NewsListing section="news" {...data}/>;}
