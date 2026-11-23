import { Link, useRouterState } from "@tanstack/react-router";
import { IconBrandGithub, IconCheck, IconChevronDown, IconPhotoPlus } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clampSidebarWidth, maxSidebarWidth, SIDEBAR_MIN, useUiStore } from "../stores/ui-store";

const focusRing = "focus-visible:ring-2 focus-visible:ring-blue-500/65 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none";
const fadeIn = "transition-opacity duration-300 starting:opacity-0";
const buttonBase = `inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-sm transition select-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const buttonVariants = {
  default: "border-white/10 bg-zinc-800 text-zinc-200 hover:border-white/20 hover:brightness-110",
  primary: "border-blue-500 bg-blue-500 text-white hover:brightness-110",
  ghost: "border-transparent bg-transparent text-zinc-300 shadow-none hover:bg-zinc-800",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "default", className = ""): string {
  return `${buttonBase} ${buttonVariants[variant]} ${className}`.trim();
}

export function Button({ variant = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${className}`} {...props} />;
}

const fieldBase = "h-8 w-full min-w-0 rounded-lg border border-white/10 bg-zinc-800/60 px-2.5 text-xs text-zinc-100 transition-colors placeholder:text-zinc-600 hover:border-white/20 focus:border-blue-500/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className={`relative flex min-w-0 flex-1 ${className}`}>
    <select className={`${fieldBase} cursor-pointer appearance-none pr-8`} {...props}>{children}</select>
    <IconChevronDown size={14} stroke={2} aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-400" />
  </span>;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldBase} h-auto min-h-16 resize-y py-2 font-mono leading-snug wrap-anywhere ${className}`} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-zinc-400">{label}{children}</label>;
}

export function Muted({ children, className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-xs leading-5 text-neutral-500 ${className}`} {...props}>{children}</p>;
}

const links = [
  { to: "/host", label: "Host" },
  { to: "/child", label: "Child" },
  { to: "/lab", label: "Lab" },
] as const;
const indicatorPosition = ["left-0", "left-1/3", "left-2/3"] as const;

/** The shell remounts per route, so remember where the indicator was to animate from there. */
let lastActive: number | null = null;

function Nav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = Math.max(0, links.findIndex((link) => pathname.startsWith(link.to)));
  const [shown, setShown] = useState(lastActive ?? active);
  useEffect(() => { lastActive = shown; }, [shown]);
  useEffect(() => {
    // Two frames: the browser must paint the old position before the new one can transition.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(active)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [active]);

  return <header className="box-border flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3">
    <nav aria-label="Main navigation" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-800/60 p-0.5">
      <div className="relative flex">
        <span aria-hidden className={`absolute inset-y-0 w-1/3 rounded-md border border-white/10 bg-zinc-800 shadow-sm transition-[left] duration-300 ease-out ${indicatorPosition[shown]}`} />
        {links.map(({ to, label }, index) => <Link
          key={to}
          to={to}
          className={`relative z-10 flex min-w-0 flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-300 ${focusRing} ${index === shown ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-300"}`}
        >{label}</Link>)}
      </div>
    </nav>
    <a href="https://github.com/minagishl/camosaic" target="_blank" rel="noreferrer" title="github.com/minagishl/camosaic" className={buttonClass()}>
      <IconBrandGithub size={15} stroke={1.75} aria-hidden />
      <span>GitHub</span>
    </a>
  </header>;
}

function ResizeDivider() {
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  return <div
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize sidebar"
    aria-valuenow={sidebarWidth}
    aria-valuemin={SIDEBAR_MIN}
    aria-valuemax={maxSidebarWidth()}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: sidebarWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }}
    onPointerMove={(event) => {
      if (drag.current) setSidebarWidth(clampSidebarWidth(drag.current.startWidth - (event.clientX - drag.current.startX)));
    }}
    onPointerUp={end}
    onPointerCancel={end}
    className="group relative z-30 hidden w-0 shrink-0 touch-none select-none lg:block"
  >
    <div className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 transition-[width,background-color] duration-150 group-hover:w-0.5 group-hover:bg-blue-500/70" />
    </div>
  </div>;
}

/** Full-viewport app shell: a stage that fills the screen and a resizable sidebar with the controls. */
export function Workspace({ stage, children }: { stage: ReactNode; children: ReactNode }) {
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  return <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row lg:overflow-hidden">
    <div className="aspect-video w-full shrink-0 bg-zinc-950 p-4 lg:aspect-auto lg:min-h-0 lg:min-w-0 lg:flex-1"><div className={`size-full ${fadeIn}`}>{stage}</div></div>
    <ResizeDivider />
    <aside
      className="flex w-full shrink-0 flex-col border-t border-white/10 bg-zinc-900 lg:h-full lg:min-h-0 lg:w-(--sidebar-width) lg:border-t-0"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <Nav />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4"><div className={fadeIn}>{children}</div></div>
    </aside>
  </div>;
}

export function Panel({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t border-white/10 px-1 py-4 first:border-t-0 first:pt-1">
    <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
    <div className="mt-3 flex flex-col gap-2">{children}</div>
  </section>;
}

export function Disclosure({ title, children, className = "", defaultOpen = false }: { title: string; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <section className={`border-t border-white/10 px-1 ${className}`}>
    <h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`group flex w-full cursor-pointer items-center justify-between gap-2 rounded-md py-4 text-left text-sm font-semibold text-zinc-100 ${focusRing}`}
      >
        {title}
        <IconChevronDown size={15} stroke={2} aria-hidden className={`text-zinc-400 transition duration-200 group-hover:text-zinc-200 ${open ? "rotate-180" : ""}`} />
      </button>
    </h2>
    {open && <div id={id} className="flex flex-col gap-2 pb-4 transition duration-200 starting:-translate-y-1 starting:opacity-0">{children}</div>}
  </section>;
}

const badgeTones = {
  muted: "bg-zinc-800 text-zinc-400",
  good: "bg-emerald-500/15 text-emerald-300",
  warn: "bg-amber-500/15 text-amber-300",
  bad: "bg-red-500/15 text-red-300",
} as const;

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badgeTones[tone]}`}>{children}</span>;
}

/** Custom slider: the native input stays for keyboard and screen readers, pointer input is handled on the track. */
export function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format?: (value: number) => string; onChange(value: number): void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const fromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const snapped = Math.round((min + ratio * (max - min)) / step) * step;
    const decimals = (String(step).split(".")[1] ?? "").length;
    onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals)));
  };

  return <label className="block py-1">
    <span className="mb-2 flex items-baseline justify-between gap-2 text-xs text-zinc-400">
      {label}
      <span className="text-zinc-200 tabular-nums">{format?.(value) ?? value}</span>
    </span>
    <div
      ref={trackRef}
      className="relative mx-2 h-4 cursor-pointer touch-none"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event); }}
    >
      <input className="peer sr-only" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-700">
        <span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/65 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-900"
        style={{ left: `${pct}%` }}
      />
    </div>
  </label>;
}

export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean }) {
  return <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-md py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
  >
    <span className="text-xs leading-5 text-zinc-300">{label}</span>
    <span aria-hidden className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-zinc-600"}`}>
      <span className={`absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-3.5" : ""}`} />
    </span>
  </button>;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`group flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-2 text-left text-xs transition-colors hover:bg-white/5 ${checked ? "text-zinc-50" : "text-zinc-400"} ${focusRing}`}
  >
    <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded border text-zinc-900 ${checked ? "border-zinc-100 bg-zinc-100" : "border-white/20"}`}>
      {checked && <IconCheck size={11} stroke={3} />}
    </span>
    {label}
  </button>;
}

export function Readout({ children, className = "", ...props }: HTMLAttributes<HTMLPreElement>) {
  return <pre className={`min-h-10 rounded-lg border border-white/10 bg-zinc-800/60 p-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-zinc-300 ${className}`} {...props}>{children}</pre>;
}

export function DeviceSwatch({ hue }: { hue: number }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: `hsl(${hue},100%,50%)` }} />;
}

export function SceneGrid({ scenes, selected, onSelect }: { scenes: ReadonlyArray<{ id: string; label: string }>; selected?: string; onSelect(id: never): void }) {
  return <div role="radiogroup" aria-label="Scene" className="grid grid-cols-3 gap-1.5">
    {scenes.map((scene) => <button
      key={scene.id}
      role="radio"
      aria-checked={selected === scene.id}
      className={`h-8 cursor-pointer rounded-lg border text-xs font-medium transition ${focusRing} ${selected === scene.id ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-white/10 bg-zinc-800 text-zinc-300 hover:border-white/20 hover:brightness-110"}`}
      onClick={() => onSelect(scene.id as never)}
    >{scene.label}</button>)}
  </div>;
}

export const stageClass = "size-full object-contain";

/** Click-or-drop image picker that shows a thumbnail and the file name once something is chosen. */
export function ImagePicker({ onFile, label = "Choose image" }: { onFile(file: File): void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (next?: File | null) => {
    if (!next || !next.type.startsWith("image/")) return;
    setFile(next);
    onFile(next);
  };
  const isFileDrag = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

  return <div
    onDragOver={(event) => { if (isFileDrag(event)) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={(event) => { if (!isFileDrag(event)) return; event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}
  >
    <input ref={inputRef} className="sr-only" type="file" accept="image/*" aria-label={label} tabIndex={-1} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors ${focusRing} ${dragging ? "border-blue-500 bg-blue-500/10" : "border-white/15 bg-zinc-800/30 hover:border-white/30 hover:bg-zinc-800/60"}`}
    >
      {file && preview
        ? <img src={preview} alt="" className="size-10 shrink-0 rounded-md border border-white/10 object-cover" />
        : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-800 text-zinc-400"><IconPhotoPlus size={18} stroke={1.75} aria-hidden /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-zinc-200">{file ? file.name : label}</span>
        <span className="block text-xs text-neutral-500">{file ? "Click or drop to replace" : "Click or drop an image here"}</span>
      </span>
    </button>
  </div>;
}
