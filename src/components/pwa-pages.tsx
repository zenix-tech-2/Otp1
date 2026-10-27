"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LaunchParams = { files: FileSystemFileHandle[] };
type LaunchQueueWindow = Window & { launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void } };
type OpenedFile = { name: string; size: number; lines: string[]; error?: string };

const MAX_BYTES = 1024 * 1024;

/* ---------- /open-file : PWA file_handlers (.txt, .csv) ---------- */
export function OpenFileView() {
  const [files, setFiles] = useState<OpenedFile[]>([]);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    const queue = (window as LaunchQueueWindow).launchQueue;
    if (!queue) { queueMicrotask(() => setSupported(false)); return; }
    queue.setConsumer(async params => {
      const opened: OpenedFile[] = [];
      for (const handle of params.files || []) {
        try {
          const file = await handle.getFile();
          if (file.size > MAX_BYTES) { opened.push({ name: file.name, size: file.size, lines: [], error: "This file is larger than 1 MB." }); continue; }
          const text = await file.text();
          opened.push({ name: file.name, size: file.size, lines: text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 200) });
        } catch { opened.push({ name: handle.name, size: 0, lines: [], error: "This file could not be read." }); }
      }
      setFiles(opened);
    });
  }, []);
  return (
    <main className="site-main inner-main pwa-page" data-screen="open-file">
      <span className="eyebrow">OPENED WITH DIGISMS PRO</span>
      <h1>Your file</h1>
      <p className="pwa-sub">Files are read on this device only. Nothing is uploaded. Tap a line to search the store or find a number.</p>
      {!supported && <div className="pwa-card">This browser can’t hand files to installed apps. Install Digisms Pro from Chrome or Edge on a computer, then right-click a .txt or .csv file and choose “Open with”.</div>}
      {supported && !files.length && <div className="pwa-card">No file yet. Use “Open with → Digisms Pro” on a .txt or .csv file.</div>}
      {files.map(file => (
        <section className="pwa-card" key={file.name}>
          <h2>{file.name}</h2>
          <small>{(file.size / 1024).toFixed(1)} KB · {file.lines.length} line{file.lines.length === 1 ? "" : "s"} shown</small>
          {file.error && <p className="pwa-error">{file.error}</p>}
          <ul className="pwa-lines">{file.lines.map((line, i) => { const q = encodeURIComponent(line.split(",")[0].slice(0, 60)); return <li key={i}><span>{line.slice(0, 140)}</span><Link href={`/store?q=${q}`}>Store</Link><Link href={`/numbers?q=${q}`}>Numbers</Link></li>; })}</ul>
        </section>
      ))}
    </main>
  );
}

/* ---------- /notes : PWA note_taking (stored only in this browser) ---------- */
type Note = { id: string; text: string; at: number };
const KEY = "digisms-pro-notes";
function readNotes(): Note[] { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(n => n && typeof n.text === "string").slice(0, 200) : []; } catch { return []; } }
export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { queueMicrotask(() => setNotes(readNotes())); if (new URLSearchParams(window.location.search).get("new")) box.current?.focus(); }, []);
  function save(next: Note[]) { setNotes(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ } }
  function add() { const value = text.trim(); if (!value) return; save([{ id: crypto.randomUUID(), text: value.slice(0, 2000), at: Date.now() }, ...notes]); setText(""); }
  return (
    <main className="site-main inner-main pwa-page" data-screen="notes">
      <span className="eyebrow">QUICK NOTES</span>
      <h1>Jot it down.</h1>
      <p className="pwa-sub">Saved on this device only. Don’t store passwords, OTP codes or payment details here.</p>
      <div className="pwa-card">
        <textarea ref={box} value={text} onChange={e => setText(e.target.value)} placeholder="A number, an order reference, a reminder…" rows={4} maxLength={2000} aria-label="New note" />
        <button className="button button-primary" onClick={add} disabled={!text.trim()}>Save note</button>
      </div>
      {notes.map(note => (
        <article className="pwa-card" key={note.id}><p>{note.text}</p><small>{new Date(note.at).toLocaleString()}</small><button className="button button-secondary" onClick={() => save(notes.filter(n => n.id !== note.id))}>Delete</button></article>
      ))}
    </main>
  );
}
