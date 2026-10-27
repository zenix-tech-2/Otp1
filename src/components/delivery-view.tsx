"use client";
import { useState } from "react";
import { ArrowDownToLine, Check, Copy, Eye, EyeOff, ExternalLink, PlayCircle } from "lucide-react";
import { parseDelivery, proxyLine, proxyUrl, type AccountSlot, type CourseDelivery, type LinkDelivery, type ProxySlot } from "@/lib/delivery";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  }
  return <button type="button" className="copy-chip" onClick={copy} aria-label={`Copy ${label}`}>{done ? <Check size={13} /> : <Copy size={13} />}</button>;
}

function Row({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return <div className="delivery-row"><span>{label}</span><strong>{shown ? value : "•".repeat(Math.min(value.length, 12))}</strong><div className="delivery-row-actions">{secret && <button type="button" className="copy-chip" onClick={() => setShown(!shown)} aria-label={shown ? `Hide ${label}` : `Show ${label}`}>{shown ? <EyeOff size={13} /> : <Eye size={13} />}</button>}<CopyButton value={value} label={label} /></div></div>;
}

function ProxyView({ slot }: { slot: ProxySlot }) {
  return <div className="delivery-card"><Row label="Protocol" value={slot.protocol.toUpperCase()} /><Row label="Server" value={slot.host} /><Row label="Port" value={slot.port} /><Row label="Username" value={slot.username} /><Row label="Password" value={slot.password} secret /><Row label="Ready-to-use link" value={proxyUrl(slot)} secret /><Row label="host:port:user:pass" value={proxyLine(slot)} secret /></div>;
}

function AccountView({ slot }: { slot: AccountSlot }) {
  return <div className="delivery-card"><Row label="Username / email / phone" value={slot.login} /><Row label="Password" value={slot.password} secret />{slot.note && <p className="delivery-note">{slot.note}</p>}</div>;
}

function LinkView({ link }: { link: LinkDelivery }) {
  return <div className="delivery-card">{link.note && <p className="delivery-note">{link.note}</p>}<a className="button button-primary" href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{link.label || "Open your access link"}</a><Row label="Link" value={link.url} /></div>;
}

function CourseView({ orderId, course }: { orderId: string; course: CourseDelivery }) {
  const [playing, setPlaying] = useState("");
  return <div className="course-view">{course.chapters.map((chapter, ci) => <details key={chapter.id} open={ci === 0} className="course-chapter"><summary>Chapter {ci + 1} · {chapter.title}</summary>{chapter.modules.map((module, mi) => <div key={module.id} className="course-module"><h4>Module {mi + 1} · {module.title}</h4>{module.lessons.map((lesson, li) => {
    const uploadId = lesson.source === "upload" ? lesson.ref.slice(7) : "";
    const src = `/api/orders/${orderId}/download?lesson=${uploadId}&inline=1`;
    return <div key={lesson.id} className="course-lesson"><div><span>{li + 1}</span><strong>{lesson.title}</strong></div>{lesson.source === "link" ? <a className="button button-secondary button-small" href={lesson.ref} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />Open</a> : <div className="course-lesson-actions"><button type="button" className="button button-secondary button-small" onClick={() => setPlaying(playing === lesson.id ? "" : lesson.id)}><PlayCircle size={13} />{playing === lesson.id ? "Close" : "Watch"}</button><a className="button button-secondary button-small" href={`/api/orders/${orderId}/download?lesson=${uploadId}`}><ArrowDownToLine size={13} />Download</a></div>}{playing === lesson.id && lesson.source === "upload" && <video className="course-player" src={src} controls playsInline preload="metadata" />}</div>;
  })}</div>)}</details>)}</div>;
}

/** Renders whatever a completed product order delivered: a file, structured details or plain instructions. */
export function DeliveryView({ orderId, fulfillment, fileName }: { orderId: string; fulfillment: string; fileName?: string }) {
  if (fulfillment.startsWith("supabase:") || fulfillment.startsWith("upload:")) return <a className="button button-primary" href={`/api/orders/${orderId}/download`}><ArrowDownToLine size={16} />Download {fileName || "your product"}</a>;
  const delivery = parseDelivery(fulfillment);
  if (delivery?.t === "proxy") return <ProxyView slot={delivery} />;
  if (delivery?.t === "account") return <AccountView slot={delivery} />;
  if (delivery?.t === "link") return <LinkView link={delivery} />;
  if (delivery?.t === "course") return <CourseView orderId={orderId} course={delivery} />;
  return <p className="delivery-plain">{fulfillment}</p>;
}
