import { DEFAULT_MEDIA_LAYOUT } from "../types";
import type { MediaLayout, SceneState, SceneType } from "../types";

export class SceneView {
  scene: SceneType = "grid";
  epoch = 0;
  image: HTMLImageElement | null = null;
  private imageKey: string | null = null;
  video: HTMLVideoElement | null = null;
  videoUrl = "";
  layout: MediaLayout = { ...DEFAULT_MEDIA_LAYOUT };
  private lastSync = 0;

  apply(state: SceneState): void {
    this.scene = state.scene;
    this.epoch = state.epoch;
    this.layout = state.layout ?? { ...DEFAULT_MEDIA_LAYOUT };
    if (state.image && state.image !== this.imageKey) {
      this.imageKey = state.image;
      const image = new Image();
      image.src = state.image;
      this.image = image;
    }
    if (!state.image) {
      this.imageKey = null;
      this.image = null;
    }
    if (state.scene === "video" && state.videoUrl && state.videoUrl !== this.videoUrl) {
      this.videoUrl = state.videoUrl;
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = state.videoUrl;
      this.video = video;
    }
    this.lastSync = 0;
    this.resume();
  }

  resume(): void {
    if (!this.video) return;
    if (this.scene === "video") void this.video.play().catch(() => undefined);
    else this.video.pause();
  }

  sync(time: number): void {
    const video = this.video;
    if (this.scene !== "video" || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    if (time - this.lastSync < 2000) return;
    this.lastSync = time;
    const wanted = (((time - this.epoch) / 1000) % video.duration + video.duration) % video.duration;
    const difference = Math.abs(video.currentTime - wanted);
    if (Math.min(difference, video.duration - difference) > 0.4) video.currentTime = wanted;
  }

  dispose(): void {
    this.video?.pause();
    if (this.video) this.video.removeAttribute("src");
    this.video?.load();
    this.video = null;
    this.image = null;
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const plasmaLut = Array.from({ length: 256 }, (_, index) =>
  hslToRgb(185 + 65 * index / 255, 0.85, 0.1 + 0.55 * index / 255),
);

function placeMedia(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceW: number, sourceH: number, stageW: number, stageH: number, layout: MediaLayout): void {
  const fit = layout.fit === "contain" ? Math.min(stageW / sourceW, stageH / sourceH) : Math.max(stageW / sourceW, stageH / sourceH);
  const drawW = sourceW * fit * layout.scale, drawH = sourceH * fit * layout.scale;
  const cx = stageW / 2 + layout.x * stageW / 2, cy = stageH / 2 + layout.y * stageH / 2;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, stageW, stageH);
  ctx.drawImage(source, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

function centerText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, size = 48): void {
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Round to whole cells so the grid tiles the stage exactly instead of cutting off the last row or column.
  const cols = Math.max(1, Math.round(w / 160)), rows = Math.max(1, Math.round(h / 160));
  const cellW = w / cols, cellH = h / rows, radius = Math.min(cellW, cellH) * 0.36;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const hue = 178 + (col / Math.max(1, cols - 1)) * 40 + (row / Math.max(1, rows - 1)) * 32;
    const x = col * cellW, y = row * cellH;
    ctx.fillStyle = `hsl(${hue},70%,42%)`; ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.strokeRect(x, y, cellW, cellH);
    ctx.beginPath(); ctx.arc(x + cellW / 2, y + cellH / 2, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "700 56px system-ui,sans-serif";
    ctx.fillText(`${String.fromCharCode(65 + col)}${row + 1}`, x + cellW / 2, y + cellH / 2);
  }
}

function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const hue = 188 + 28 * (1 + Math.sin(time / 2500 + i * 1.7));
    gradient.addColorStop(i / 3, `hsl(${hue},80%,${30 + i * 6}%)`);
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const cx = w * (0.5 + 0.4 * Math.sin(time / 4000)), cy = h * (0.5 + 0.4 * Math.cos(time / 3300));
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.8);
  radial.addColorStop(0, "rgba(255,255,255,.45)"); radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial; ctx.fillRect(0, 0, w, h);
}

function drawPlasma(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, buffer: HTMLCanvasElement): void {
  if (buffer.width !== 128 || buffer.height !== 72) {
    buffer.width = 128;
    buffer.height = 72;
  }
  const pc = buffer.getContext("2d");
  if (!pc) return;
  const image = pc.createImageData(buffer.width, buffer.height), tt = time / 900;
  for (let y = 0; y < buffer.height; y++) for (let x = 0; x < buffer.width; x++) {
    const value = Math.sin(x * 0.09 + tt) + Math.sin(y * 0.11 - tt * 1.3) +
      Math.sin((x + y) * 0.06 + tt * 0.7) + Math.sin(Math.hypot(x - 64, y - 36) * 0.1 - tt);
    const color = plasmaLut[Math.max(0, Math.min(255, Math.floor(((value + 4) / 8) * 255)))];
    const p = (y * buffer.width + x) * 4;
    image.data[p] = color[0]; image.data[p + 1] = color[1]; image.data[p + 2] = color[2]; image.data[p + 3] = 255;
  }
  pc.putImageData(image, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(buffer, 0, 0, w, h);
}

function drawClock(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#06222b"); gradient.addColorStop(1, "#0b1f4a");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const date = new Date(time), pad = (n: number, length = 2) => String(n).padStart(length, "0");
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
  ctx.font = "700 220px ui-monospace,Menlo,Consolas,monospace";
  ctx.fillText(`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`, w / 2, h / 2 - 40);
  ctx.fillStyle = "#7fe3f0"; ctx.font = "600 84px ui-monospace,Menlo,Consolas,monospace";
  ctx.fillText(`.${pad(date.getMilliseconds(), 3)}`, w / 2, h / 2 + 130);
  ctx.fillRect(0, h - 24, w * date.getMilliseconds() / 1000, 24);
}

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, view: SceneView, time: number, plasmaBuffer: HTMLCanvasElement): void {
  switch (view.scene) {
    case "grid": drawGrid(ctx, w, h); break;
    case "gradient": drawGradient(ctx, w, h, time); break;
    case "plasma": drawPlasma(ctx, w, h, time, plasmaBuffer); break;
    case "clock": drawClock(ctx, w, h, time); break;
    case "image":
      if (view.image?.complete && view.image.naturalWidth) placeMedia(ctx, view.image, view.image.naturalWidth, view.image.naturalHeight, w, h, view.layout);
      else centerText(ctx, "No image selected", w, h);
      break;
    case "video":
      if (view.video && view.video.readyState >= 2 && view.video.videoWidth) placeMedia(ctx, view.video, view.video.videoWidth, view.video.videoHeight, w, h, view.layout);
      else centerText(ctx, view.videoUrl ? "Loading video" : "Video URL is not set", w, h);
      break;
  }
}
