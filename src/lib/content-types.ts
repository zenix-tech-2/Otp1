export type MediaType = "image" | "video" | "audio" | "document";
export type ArticleMedia = { id: string; type: MediaType; url: string; name: string; mimeType: string; size: number; alt: string; caption: string };
export type Article = { id: string; slug: string | null; title: string; excerpt: string; body: string; kind: string; active: boolean; coverId: string | null; media: ArticleMedia[]; createdAt: string | Date; updatedAt: string | Date };
export function articleSection(article: Pick<Article,"kind">) { return article.kind === "news" ? "news" : "updates"; }
export function articleHref(article: Pick<Article,"id"|"slug"|"kind">) { return `/${articleSection(article)}/${encodeURIComponent(article.slug || article.id)}`; }
export function articleSummary(article: Pick<Article,"excerpt"|"body">) { return article.excerpt || article.body.replace(/\s+/g," ").slice(0,190) + (article.body.length > 190 ? "…" : ""); }
export function articleCover(article: Pick<Article,"media"|"coverId">) { return article.media.find(m=>m.id===article.coverId && m.type === "image") || article.media.find(m=>m.type === "image"); }
