import type {Metadata} from "next";
import {notFound,permanentRedirect} from "next/navigation";
import {getArticle} from "@/lib/news";
import {articleHref,articleSection,articleSummary} from "@/lib/content-types";
import {ArticlePage} from "@/components/news-pages";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const post=await getArticle(slug);return post?{title:post.title,description:articleSummary(post)}:{title:"Post unavailable",robots:{index:false}};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const post=await getArticle(slug);if(!post)notFound();if(articleSection(post)!=="news"||(post.slug&&post.slug!==slug))permanentRedirect(articleHref(post));return <ArticlePage post={post}/>;}
