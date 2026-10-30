"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
export type ThemePref = "light" | "dark" | "system";
const KEY = "storeotp-theme";
// Runs in <head> before first paint so the page never flashes the wrong theme.
export const themeBootScript = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.themePref=p;r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#0b1220':'#1754f5');}catch(e){}})();`;
function resolve(pref: ThemePref) { return pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light"; }
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement; const theme = resolve(pref); root.dataset.theme = theme; root.dataset.themePref = pref; root.style.colorScheme = theme;
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute("content", theme === "dark" ? "#0b1220" : "#1754f5"));
  window.dispatchEvent(new CustomEvent("storeotp:theme", { detail: { pref, theme } }));
}
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system"); const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () => { const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })(); const next: ThemePref = saved === "light" || saved === "dark" ? saved : "system"; setPref(next); setTheme(resolve(next)); };
    read(); const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => { if (document.documentElement.dataset.themePref === "system") { applyTheme("system"); read(); } };
    const onChange = () => read(); media.addEventListener("change", onSystem); window.addEventListener("storeotp:theme", onChange); window.addEventListener("storage", onChange);
    return () => { media.removeEventListener("change", onSystem); window.removeEventListener("storeotp:theme", onChange); window.removeEventListener("storage", onChange); };
  }, []);
  const choose = (next: ThemePref) => { try { if (next === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch { /* private mode: applies for this visit only */ } applyTheme(next); };
  return { pref, theme, choose, toggle: () => choose(theme === "dark" ? "light" : "dark") };
}
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return <button type="button" className="icon-button theme-toggle" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={toggle}><span className="theme-toggle-icon" key={theme}>{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}</span></button>;
}
export function ThemePicker() {
  const { pref, choose } = useTheme();
  const options = [{ id: "light" as const, label: "Light", Icon: Sun }, { id: "dark" as const, label: "Dark", Icon: Moon }, { id: "system" as const, label: "Auto", Icon: Monitor }];
  return <div className="theme-picker" role="radiogroup" aria-label="Appearance">{options.map(({ id, label, Icon }) => <button key={id} role="radio" aria-checked={pref === id} className={pref === id ? "selected" : ""} onClick={() => choose(id)}><Icon size={17} /><span>{label}</span></button>)}</div>;
}
