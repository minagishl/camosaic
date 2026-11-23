import { useEffect, useRef, useState } from "react";
import { DEFAULT_MEDIA_LAYOUT, MARKER_HUES, applyPose, mediaRect, type MediaLayout, type Pose, type SceneState, type Size } from "camosaic";
import { Button, Slider } from "./ui";

const FITS = [
  { id: "cover", label: "Fill" },
  { id: "contain", label: "Fit" },
] as const;

export interface PreviewDevice {
  slot: number;
  pose: Pose | null;
  size: Size;
}

const PREVIEW_WIDTH = 480;

/** A miniature of the shared stage: where the media lands, and where the connected displays are. */
function StagePreview({ layout, scene, stage, getDevices }: { layout: MediaLayout; scene: SceneState; stage: Size; getDevices(): PreviewDevice[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<{ element: CanvasImageSource; width: number; height: number } | null>(null);
  const live = useRef({ layout, stage, getDevices });
  live.current = { layout, stage, getDevices };
  const source = scene.scene === "image" ? scene.image : scene.videoUrl;

  useEffect(() => {
    mediaRef.current = null;
    if (!source) return;
    if (scene.scene === "image") {
      const image = new Image();
      image.onload = () => { mediaRef.current = { element: image, width: image.naturalWidth, height: image.naturalHeight }; };
      image.src = source;
      return () => { image.onload = null; };
    }
    // A paused video is enough for a still of its first frame.
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
      mediaRef.current = { element: video, width: video.videoWidth, height: video.videoHeight };
    };
    video.src = source;
    return () => { video.onloadeddata = null; video.removeAttribute("src"); video.load(); };
  }, [scene.scene, source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { layout: current, stage: size, getDevices: devices } = live.current;
      const height = Math.round(PREVIEW_WIDTH * size.h / size.w);
      if (canvas.width !== PREVIEW_WIDTH || canvas.height !== height) { canvas.width = PREVIEW_WIDTH; canvas.height = height; }
      const k = PREVIEW_WIDTH / size.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#09090b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const media = mediaRef.current;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.clip();
      if (media && media.width && media.height) {
        const rect = mediaRect(media.width, media.height, size.w, size.h, current);
        ctx.drawImage(media.element, rect.x * k, rect.y * k, rect.w * k, rect.h * k);
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = "#3b82f6";
        ctx.strokeRect(rect.x * k, rect.y * k, rect.w * k, rect.h * k);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = "#52525b"; ctx.font = "12px system-ui,sans-serif"; ctx.textAlign = "center";
        ctx.fillText(source ? "Loading…" : "Nothing to place yet", canvas.width / 2, canvas.height / 2);
      }
      for (const device of devices()) {
        if (!device.pose) continue;
        const { w, h } = device.size;
        const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => applyPose(device.pose!, x, y));
        ctx.beginPath();
        corners.forEach((point, index) => index ? ctx.lineTo(point.x * k, point.y * k) : ctx.moveTo(point.x * k, point.y * k));
        ctx.closePath();
        ctx.fillStyle = `hsla(${MARKER_HUES[device.slot]},100%,50%,0.12)`; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = `hsl(${MARKER_HUES[device.slot]},100%,55%)`; ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.font = "700 11px system-ui,sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`#${device.slot + 1}`, corners[0].x * k + 4, corners[0].y * k + 13);
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [source]);

  return <canvas
    ref={canvasRef}
    aria-label="Placement preview"
    className="block aspect-video w-full rounded-md border border-white/10 bg-zinc-950"
    style={{ aspectRatio: `${stage.w} / ${stage.h}` }}
  />;
}

/** Size, position and fit of the image or video on the shared stage. */
export function MediaLayoutControls({ layout, scene, stage, getDevices, onChange }: {
  layout: MediaLayout; scene: SceneState; stage: Size; getDevices(): PreviewDevice[]; onChange(patch: Partial<MediaLayout>): void;
}) {
  // Keep a local copy so sliders follow the pointer instead of waiting for the host to re-render.
  const [local, setLocal] = useState(layout);
  useEffect(() => { setLocal(layout); }, [layout]);
  const update = (patch: Partial<MediaLayout>) => { setLocal((current) => ({ ...current, ...patch })); onChange(patch); };
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const unchanged = JSON.stringify(local) === JSON.stringify(DEFAULT_MEDIA_LAYOUT);

  return <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-zinc-800/30 p-3">
    <StagePreview layout={local} scene={scene} stage={stage} getDevices={getDevices} />
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
