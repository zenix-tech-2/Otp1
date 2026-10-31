// "Account age" for social-account listings is plain text ("2 years", "18 months", "since 2019").
/** Best-effort age in months, used for sorting. Unknown text returns 0. */
export function ageMonths(text: string | undefined | null): number {
  if (!text) return 0; const t = text.toLowerCase().trim();
  const since = t.match(/(?:since|from|created|est\.?)\s*(?:[a-z]{3,9}\s+)?((?:19|20)\d{2})/); if (since) return Math.max(0, (new Date().getFullYear() - Number(since[1])) * 12);
  let months = 0; const re = /(\d+(?:\.\d+)?)\s*(y(?:ea)?rs?|yr?s?|mo(?:nth)?s?|m|w(?:ee)?ks?|d(?:ay)?s?)\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { const n = parseFloat(m[1]); const u = m[2]; months += u.startsWith("y") ? n * 12 : u.startsWith("w") ? n / 4.345 : u.startsWith("d") ? n / 30 : n; }
  return Math.round(months);
}
export function ageLabel(text: string | undefined | null) { const t = (text || "").trim(); return t ? t.slice(0, 30) : ""; }
