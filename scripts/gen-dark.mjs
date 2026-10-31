// Generates src/app/dark.generated.css: a dark counterpart for every colour rule in the app's stylesheets.
// Re-run `npm run dark` after you change colours in any .css file. Hand-tuned exceptions live in src/app/dark.css.
import { readFileSync, writeFileSync } from "node:fs";
const files = ["globals","readability","payments","screens","media","product-forms","pwa","rentals","dev","ai","flows","boost","engagement"].map(n => `src/app/${n}.css`);
const SCOPE = '[data-theme="dark"]';
const SKIP_AT = /^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style)/i;
// ---- tiny CSS tree parser (handles comments, strings, url(...), nested at-rules) ----
function parse(src) {
  let i = 0; const n = src.length;
  function block() {
    const nodes = [];
    while (i < n) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src[i] === "}") { i++; return nodes; }
      if (src.startsWith("/*", i)) { i = src.indexOf("*/", i + 2); i = i < 0 ? n : i + 2; continue; }
      let start = i, depth = 0, q = null;
      for (; i < n; i++) { const c = src[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === "(") depth++; else if (c === ")") depth--; else if (depth <= 0 && (c === "{" || c === ";" || c === "}")) break; }
      const prelude = src.slice(start, i).trim();
      if (src[i] === ";") { i++; continue; }
      if (src[i] === "}") { return nodes; }
      if (src[i] !== "{") break; i++;
      if (prelude.startsWith("@")) { if (SKIP_AT.test(prelude)) { skipBlock(); continue; } nodes.push({ at: prelude, children: block() }); continue; }
      const bodyStart = i; skipBlock(); nodes.push({ selector: prelude, body: src.slice(bodyStart, i - 1) });
    }
    return nodes;
  }
  function skipBlock() { let depth = 1, q = null; while (i < n && depth) { const c = src[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === "{") depth++; else if (c === "}") depth--; i++; } }
  return block();
}
function splitTop(text, sep) { const out = []; let depth = 0, q = null, last = 0; for (let k = 0; k < text.length; k++) { const c = text[k]; if (q) { if (c === "\\") k++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--; else if (c === sep && depth === 0) { out.push(text.slice(last, k)); last = k + 1; } } out.push(text.slice(last)); return out.map(s => s.trim()).filter(Boolean); }
// ---- colour maths ----
function hexToRgb(h) { h = h.slice(1); if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join(""); const v = parseInt(h.slice(0, 6), 16); return { r: v >> 16 & 255, g: v >> 8 & 255, b: v & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }; }
function rgbToHsl({ r, g, b }) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2; if (max !== min) { const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min); h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return { h, s, l }; }
function hslToRgb({ h, s, l }) { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }; }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function out({ r, g, b }, a) { const h = v => v.toString(16).padStart(2, "0"); return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(Math.round(a * 255)) : ""}`; }
function mapColor(rgb, role) {
  const { h, s, l } = rgbToHsl(rgb); const a = rgb.a; let L = l, S = s;
  const accent = s > .35 && l > .28 && l < (role === "bg" ? .82 : .68);
  if (role === "bg") {
    if (l >= .8) { L = .075 + (1 - l) * .6; S = s * .55; }
    else if (l < .3) { L = .48; S = Math.max(s, .55); }
    else if (accent) { /* brand and status colours stay */ }
    else { L = clamp(1 - l, .12, .5) * .8; }
  } else if (role === "border") {
    if (l >= .55 && !accent) { L = .17 + (1 - l) * .65; S = s * .6; }
    else if (l < .3) { L = clamp(1 - l, .6, .85); S = s * .6; }
  } else { // text, icons
    if (l >= .8) { /* light text sits on a coloured or dark surface and stays light */ }
    else if (l < .45 && !accent) { L = clamp(1 - l, .88, .97); S = s * .5; }
    else if (accent) { L = clamp(l + .14, .62, .78); }
    else if (l < .8) { L = clamp(1.14 - l, .52, .8); S = s * .8; }
    else { L = clamp(1 - l + .1, .3, .6); }
  }
  let H = h; if (s < .12 && !(role === "text" && l >= .93)) { H = 220; S = Math.max(S, .22); }
  return out(hslToRgb({ h: H, s: clamp(S, 0, 1), l: clamp(L, 0, 1) }), a);
}
const NAMED = { white: "#ffffff", black: "#000000" };
const COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/g;
function toRgb(token) {
  const t = token.toLowerCase(); if (NAMED[t]) return hexToRgb(NAMED[t]); if (t[0] === "#") return hexToRgb(t);
  const m = t.match(/^(rgba?|hsla?)\(([^)]*)\)$/); if (!m) return null; const parts = m[2].split(/[\s,\/]+/).filter(Boolean).map(p => p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p));
  if (m[1].startsWith("rgb")) { const a = parts[3] ?? 1; return parts.length >= 3 ? { r: parts[0], g: parts[1], b: parts[2], a } : null; }
  const rgb = hslToRgb({ h: parts[0], s: parts[1] > 1 ? parts[1] / 100 : parts[1], l: parts[2] > 1 ? parts[2] / 100 : parts[2] }); return { ...rgb, a: parts[3] ?? 1 };
}
const roleOf = prop => /^(background|background-color|background-image)$/.test(prop) ? "bg" : /^(border|border-(top|right|bottom|left|block|inline)(-[a-z]+)?(-color)?|border-color|outline|outline-color|column-rule)$/.test(prop) ? "border" : /^(color|fill|stroke|text-decoration-color|caret-color|accent-color|-webkit-text-fill-color)$/.test(prop) ? "text" : null;
const NAVY = { bg: "#2f5fe6", text: "#e7edfb", border: "#3a4a6b" };
function convertValue(value, role) { let changed = false; value = value.replace(/var\(--navy\)/g, () => { changed = true; return "@@NAVY@@"; }); const next0 = value.replace(COLOR, tok => { const rgb = toRgb(tok); if (!rgb) return tok; changed = true; return mapColor(rgb, role); }); const next = next0.replaceAll("@@NAVY@@", NAVY[role]); return changed ? next : null; }
// ---- emit ----
function scopeSelector(sel) {
  return splitTop(sel, ",").map(s => { if (/^(html|:root)\b/.test(s)) return s.replace(/^(html|:root)/, `$1${SCOPE}`); return `html${SCOPE} ${s}`; }).join(",");
}
function emitRule(node) {
  if (/^@/.test(node.selector || "")) return "";
  const decls = splitTop(node.body, ";"); const kept = [];
  let hasConverted = false;
  for (const d of decls) {
    const idx = d.indexOf(":"); if (idx < 0) continue; const prop = d.slice(0, idx).trim().toLowerCase(); let value = d.slice(idx + 1).trim(); const important = /!important\s*$/i.test(value); const base = value.replace(/\s*!important\s*$/i, "");
    const role = roleOf(prop); if (!role || prop.startsWith("--")) continue;
    const converted = convertValue(base, role);
    if (converted) hasConverted = true;
    kept.push(`${prop}:${converted ?? base}${important ? "!important" : ""}`);
  }
  return hasConverted ? `${scopeSelector(node.selector)}{${kept.join(";")}}\n` : "";
}
function emitNodes(nodes) {
  let css = "";
  for (const node of nodes) {
    if (node.children) { const inner = emitNodes(node.children); if (inner) css += `${node.at}{\n${inner}}\n`; }
    else css += emitRule(node);
  }
  return css;
}
let result = "/* AUTO-GENERATED by scripts/gen-dark.mjs — do not edit. Run `npm run dark` after changing colours. */\n";
for (const file of files) { let src; try { src = readFileSync(file, "utf8"); } catch { continue; } src = src.replace(/@import[^;]*;/g, ""); const css = emitNodes(parse(src)); if (css) result += `/* ${file.split("/").pop()} */\n${css}`; }
writeFileSync("src/app/dark.generated.css", result); console.log(`dark.generated.css: ${(result.length / 1024).toFixed(0)} KB`);
