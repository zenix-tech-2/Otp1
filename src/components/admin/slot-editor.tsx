"use client";
import { useState, type KeyboardEvent } from "react";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import { buildAccountSlot, buildProxySlot, parseSlotLines, proxyProtocols, type AccountSlot, type ProxySlot, type SlotKind } from "@/lib/delivery";
import { InfoBox, InlineError } from "../ui";

export type Slot = ProxySlot | AccountSlot;

function mask(value: string) { return "•".repeat(Math.min(Math.max(value.length, 4), 10)); }
function describe(slot: Slot) {
  return slot.t === "proxy" ? `${slot.protocol.toUpperCase()} · ${slot.host}:${slot.port} · ${slot.username} · ${mask(slot.password)}` : `${slot.login} · ${mask(slot.password)}${slot.note ? ` · ${slot.note}` : ""}`;
}

export function SlotEditor({ kind, slots, onChange, available, sold }: { kind: SlotKind; slots: Slot[]; onChange: (slots: Slot[]) => void; available: number; sold?: number }) {
  const [protocol, setProtocol] = useState("http");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState("");
  const [note, setNote] = useState("");
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const proxy = kind === "proxy";

  function add(slot: Slot) { onChange([...slots, slot]); setError(""); }
  function addOne() {
    const result = proxy ? buildProxySlot({ protocol, host, port, username, password }) : buildAccountSlot({ login, password, note });
    if (!result.ok) { setError(result.error); return; }
    add(result.slot);
    if (proxy) { setHost(""); setPort(""); setUsername(""); setPassword(""); } else { setLogin(""); setPassword(""); setNote(""); }
  }
  function addBulk() {
    const { slots: parsed, errors } = parseSlotLines(bulk, kind);
    setBulkErrors(errors.slice(0, 5).concat(errors.length > 5 ? [`…and ${errors.length - 5} more lines need a look.`] : []));
    if (parsed.length) { onChange([...slots, ...parsed]); setBulk(""); }
    if (!parsed.length && !errors.length) setBulkErrors(["Paste at least one line first."]);
  }
  function enter(event: KeyboardEvent) { if (event.key === "Enter") { event.preventDefault(); addOne(); } }

  return <div className="slot-editor">
    <div className="slot-summary"><div><strong>{available + slots.length}</strong><span>slots in stock after saving</span></div><div><strong>{available}</strong><span>currently available</span></div><div><strong>{slots.length}</strong><span>new, not saved yet</span></div>{sold ? <div><strong>{sold}</strong><span>already sold</span></div> : null}</div>
    <div className="slot-form" onKeyDown={enter}>
      <h4>Add one slot</h4>
      {proxy ? <div className="form-grid">
        <label className="field-label">Protocol<select value={protocol} onChange={e => setProtocol(e.target.value)} aria-label="Proxy protocol">{proxyProtocols.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}</select></label>
        <label className="field-label">Server<input value={host} onChange={e => setHost(e.target.value)} placeholder="gate.example.com or 203.0.113.10" maxLength={253} autoComplete="off" /></label>
        <label className="field-label">Port<input value={port} onChange={e => setPort(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="8080" maxLength={5} autoComplete="off" /></label>
        <label className="field-label">Username<input value={username} onChange={e => setUsername(e.target.value)} placeholder="Proxy username" maxLength={200} autoComplete="off" /></label>
        <label className="field-label form-span-two">Password<input value={password} onChange={e => setPassword(e.target.value)} placeholder="Proxy password" maxLength={200} autoComplete="off" /></label>
      </div> : <div className="form-grid">
        <label className="field-label form-span-two">Username / email / phone<input value={login} onChange={e => setLogin(e.target.value)} placeholder="name@example.com, @username or +237…" maxLength={250} autoComplete="off" /></label>
        <label className="field-label">Password<input value={password} onChange={e => setPassword(e.target.value)} placeholder="Account password" maxLength={250} autoComplete="off" /></label>
        <label className="field-label">Extra details (optional)<input value={note} onChange={e => setNote(e.target.value)} placeholder="Recovery email, 2FA, profile or PIN" maxLength={500} autoComplete="off" /></label>
      </div>}
      <InlineError message={error} />
      <button type="button" className="button button-secondary" onClick={addOne}><Plus size={15} />Add slot</button>
    </div>
    <div className="slot-form">
      <h4>Or paste many at once</h4>
      <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={5} spellCheck={false} aria-label="Paste slots, one per line" placeholder={proxy ? "socks5://user:pass@gate.example.com:1080\nhost:port:username:password" : "name@example.com|password123\n@handle|password|recovery email"} />
      <span className="field-help">{proxy ? "One proxy per line: protocol://user:pass@host:port or host:port:username:password." : "One account per line: login|password or login|password|extra details. A colon also works: login:password."}</span>
      {bulkErrors.length > 0 && <div className="slot-errors" role="alert">{bulkErrors.map(e => <p key={e}>{e}</p>)}</div>}
      <button type="button" className="button button-secondary" onClick={addBulk}><ListPlus size={15} />Add from list</button>
    </div>
    {slots.length > 0 && <div className="slot-list"><h4>New slots to add ({slots.length})</h4>{slots.map((slot, index) => <div key={`${index}-${describe(slot)}`} className="slot-item"><span>{describe(slot)}</span><button type="button" aria-label="Remove slot" onClick={() => onChange(slots.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}</div>}
    <InfoBox>Each slot is delivered to one customer only. Stock goes up when you add slots and down with every purchase, so it always matches what you can really deliver.</InfoBox>
  </div>;
}
