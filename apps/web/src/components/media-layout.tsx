import { useEffect, useState } from "react";
import { DEFAULT_MEDIA_LAYOUT, type MediaLayout } from "camosaic";
import { Button, Slider } from "./ui";

const FITS = [
  { id: "cover", label: "Fill" },
  { id: "contain", label: "Fit" },
] as const;

/** Size, position and fit of the image or video on the shared stage. */
export function MediaLayoutControls({ layout, onChange }: { layout: MediaLayout; onChange(patch: Partial<MediaLayout>): void }) {
  // Keep a local copy so sliders follow the pointer instead of waiting for the host to re-render.
  const [local, setLocal] = useState(layout);
  useEffect(() => { setLocal(layout); }, [layout]);
  const update = (patch: Partial<MediaLayout>) => { setLocal((current) => ({ ...current, ...patch })); onChange(patch); };
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const unchanged = JSON.stringify(local) === JSON.stringify(DEFAULT_MEDIA_LAYOUT);

  return <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-zinc-800/30 p-3">
    <div role="radiogroup" aria-label="Fit" className="grid grid-cols-2 gap-1.5">
      {FITS.map((fit) => <button
        key={fit.id}
        role="radio"
        aria-checked={local.fit === fit.id}
        onClick={() => update({ fit: fit.id })}
        className={`h-8 cursor-pointer rounded-lg border text-xs font-medium transition ${local.fit === fit.id ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-white/10 bg-zinc-800 text-zinc-300 hover:border-white/20 hover:brightness-110"}`}
      >{fit.label}</button>)}
    </div>
    <Slider label="Size" min={0.1} max={4} step={0.05} value={local.scale} format={percent} onChange={(scale) => update({ scale })} />
    <Slider label="Horizontal" min={-1} max={1} step={0.01} value={local.x} format={percent} onChange={(x) => update({ x })} />
    <Slider label="Vertical" min={-1} max={1} step={0.01} value={local.y} format={percent} onChange={(y) => update({ y })} />
    <Button disabled={unchanged} onClick={() => update({ ...DEFAULT_MEDIA_LAYOUT })}>Reset layout</Button>
  </div>;
}
