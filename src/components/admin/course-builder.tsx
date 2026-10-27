"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, FilePlus2, Link2, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { COURSE_LIMITS, courseLessonCount, newId, type CourseChapter, type CourseDelivery, type CourseModule, type Lesson } from "@/lib/delivery";
import { uploadFile } from "@/lib/upload-client";
import { fileSize, type UploadProgress } from "@/lib/upload-policy";
import { InfoBox, InlineError } from "../ui";

const LESSON_FORMATS = ["mp4", "webm", "mp3", "m4a", "ogg", "wav"];
const move = <T,>(items: T[], index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const copy = items.slice();
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
};
export const emptyLesson = (): Lesson => ({ id: newId(), title: "", source: "upload", ref: "" });
export const emptyModule = (): CourseModule => ({ id: newId(), title: "", lessons: [emptyLesson()] });
export const emptyChapter = (): CourseChapter => ({ id: newId(), title: "", modules: [emptyModule()] });
export const emptyCourse = (): CourseDelivery => ({ t: "course", chapters: [emptyChapter()] });

function LessonRow({ lesson, index, total, onChange, onRemove, onMove, onBusy }: { lesson: Lesson; index: number; total: number; onChange: (lesson: Lesson) => void; onRemove: () => void; onMove: (delta: number) => void; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!LESSON_FORMATS.includes(ext)) { setError("Use an MP4 or WebM video (audio files also work)."); return; }
    setError(""); onBusy(true); abort.current = new AbortController();
    try {
      const asset = await uploadFile(file, "delivery", setProgress, abort.current.signal);
      onChange({ ...lesson, source: "upload", ref: asset.url, name: asset.name, size: asset.size, title: lesson.title || asset.name.replace(/\.[^.]+$/, "") });
    } catch (e) { setError((e as Error).message); }
    finally { onBusy(false); setProgress(null); abort.current = null; if (input.current) input.current.value = ""; }
  }

  return <div className="lesson-row">
    <div className="lesson-head"><span className="lesson-number">{index + 1}</span><input value={lesson.title} onChange={e => onChange({ ...lesson, title: e.target.value })} placeholder="Lesson title" maxLength={COURSE_LIMITS.title} aria-label={`Lesson ${index + 1} title`} />
      <div className="row-tools"><button type="button" aria-label="Move lesson up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={13} /></button><button type="button" aria-label="Move lesson down" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={13} /></button><button type="button" aria-label="Remove lesson" onClick={onRemove}><Trash2 size={13} /></button></div></div>
    <div className="lesson-source" role="group" aria-label="Lesson content">
      <button type="button" className={lesson.source === "upload" ? "selected" : ""} onClick={() => onChange({ ...lesson, source: "upload", ref: lesson.source === "upload" ? lesson.ref : "", name: undefined, size: undefined })}><UploadCloud size={12} />Upload video</button>
      <button type="button" className={lesson.source === "link" ? "selected" : ""} onClick={() => onChange({ ...lesson, source: "link", ref: lesson.source === "link" ? lesson.ref : "", name: undefined, size: undefined })}><Link2 size={12} />Video link</button>
    </div>
    {lesson.source === "link" ? <input value={lesson.ref} onChange={e => onChange({ ...lesson, ref: e.target.value })} placeholder="https://… (private video link)" maxLength={2000} inputMode="url" aria-label="Lesson video link" /> : <div className="lesson-upload">
      {progress ? <div className="file-upload-progress" role="status"><div><strong>{progress.stage === "verifying" ? "Verifying your video" : progress.stage === "preparing" ? "Preparing secure upload" : "Uploading"}</strong><span>{progress.percent}%</span></div><progress value={progress.percent} max={100} /><button type="button" onClick={() => abort.current?.abort()}>Cancel upload<X size={12} /></button></div>
        : <button type="button" className="button button-secondary button-small" onClick={() => input.current?.click()}>{lesson.ref ? <CheckCircle2 size={13} /> : <FilePlus2 size={13} />}{lesson.ref ? "Replace video" : "Choose video"}</button>}
      {lesson.ref && !progress && <small>{lesson.name || "Video attached"}{lesson.size ? ` · ${fileSize(lesson.size)}` : ""}</small>}
      <input ref={input} type="file" hidden accept=".mp4,.webm,.mp3,.m4a,.ogg,.wav" aria-label="Upload lesson video" onChange={e => upload(e.target.files?.[0])} />
    </div>}
    <InlineError message={error} />
  </div>;
}

export function CourseBuilder({ course, onChange, onBusy }: { course: CourseDelivery; onChange: (course: CourseDelivery) => void; onBusy: (busy: boolean) => void }) {
  const active = useRef(0);
  const track = (busy: boolean) => { active.current = Math.max(0, active.current + (busy ? 1 : -1)); onBusy(active.current > 0); };
  const setChapter = (ci: number, chapter: CourseChapter) => onChange({ ...course, chapters: course.chapters.map((c, i) => (i === ci ? chapter : c)) });
  const lessons = courseLessonCount(course);

  return <div className="course-builder">
    <div className="slot-summary"><div><strong>{course.chapters.length}</strong><span>chapters</span></div><div><strong>{course.chapters.reduce((n, c) => n + c.modules.length, 0)}</strong><span>modules</span></div><div><strong>{lessons}</strong><span>lessons</span></div></div>
    {course.chapters.map((chapter, ci) => <section key={chapter.id} className="chapter-card">
      <div className="chapter-head"><span className="chapter-tag">Chapter {ci + 1}</span><input value={chapter.title} onChange={e => setChapter(ci, { ...chapter, title: e.target.value })} placeholder="Chapter title, e.g. Getting started" maxLength={COURSE_LIMITS.title} aria-label={`Chapter ${ci + 1} title`} />
        <div className="row-tools"><button type="button" aria-label="Move chapter up" disabled={ci === 0} onClick={() => onChange({ ...course, chapters: move(course.chapters, ci, -1) })}><ArrowUp size={13} /></button><button type="button" aria-label="Move chapter down" disabled={ci === course.chapters.length - 1} onClick={() => onChange({ ...course, chapters: move(course.chapters, ci, 1) })}><ArrowDown size={13} /></button><button type="button" aria-label="Remove chapter" disabled={course.chapters.length === 1} onClick={() => onChange({ ...course, chapters: course.chapters.filter((_, i) => i !== ci) })}><Trash2 size={13} /></button></div></div>
      {chapter.modules.map((module, mi) => <div key={module.id} className="module-card">
        <div className="chapter-head"><span className="chapter-tag module">Module {mi + 1}</span><input value={module.title} onChange={e => setChapter(ci, { ...chapter, modules: chapter.modules.map((m, i) => (i === mi ? { ...m, title: e.target.value } : m)) })} placeholder="Module title" maxLength={COURSE_LIMITS.title} aria-label={`Module ${mi + 1} title`} />
          <div className="row-tools"><button type="button" aria-label="Move module up" disabled={mi === 0} onClick={() => setChapter(ci, { ...chapter, modules: move(chapter.modules, mi, -1) })}><ArrowUp size={13} /></button><button type="button" aria-label="Move module down" disabled={mi === chapter.modules.length - 1} onClick={() => setChapter(ci, { ...chapter, modules: move(chapter.modules, mi, 1) })}><ArrowDown size={13} /></button><button type="button" aria-label="Remove module" disabled={chapter.modules.length === 1} onClick={() => setChapter(ci, { ...chapter, modules: chapter.modules.filter((_, i) => i !== mi) })}><Trash2 size={13} /></button></div></div>
        {module.lessons.map((lesson, li) => <LessonRow key={lesson.id} lesson={lesson} index={li} total={module.lessons.length} onBusy={track}
          onChange={next => setChapter(ci, { ...chapter, modules: chapter.modules.map((m, i) => (i === mi ? { ...m, lessons: m.lessons.map((l, j) => (j === li ? next : l)) } : m)) })}
          onRemove={() => setChapter(ci, { ...chapter, modules: chapter.modules.map((m, i) => (i === mi ? { ...m, lessons: m.lessons.length > 1 ? m.lessons.filter((_, j) => j !== li) : m.lessons } : m)) })}
          onMove={delta => setChapter(ci, { ...chapter, modules: chapter.modules.map((m, i) => (i === mi ? { ...m, lessons: move(m.lessons, li, delta) } : m)) })} />)}
        <button type="button" className="add-row-button" onClick={() => setChapter(ci, { ...chapter, modules: chapter.modules.map((m, i) => (i === mi ? { ...m, lessons: [...m.lessons, emptyLesson()] } : m)) })}><Plus size={13} />Add lesson</button>
      </div>)}
      <button type="button" className="add-row-button" onClick={() => setChapter(ci, { ...chapter, modules: [...chapter.modules, emptyModule()] })}><Plus size={13} />Add module to this chapter</button>
    </section>)}
    <button type="button" className="button button-secondary" onClick={() => onChange({ ...course, chapters: [...course.chapters, emptyChapter()] })}><Plus size={15} />Add chapter</button>
    <InfoBox>Customers see this structure in their purchase and can watch each lesson or download it. Only buyers of this course can open the videos.</InfoBox>
  </div>;
}
