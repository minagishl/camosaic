import { invertPose } from "../geometry/affine";
import { drawScene, SceneView } from "../rendering/scenes";
import { MARKER_HUES, STAGE_WIDTH } from "../types";
import { drawMarkers } from "../vision/apriltag";
import type { Pose, Size, WireMessage } from "../types";

/** How long a display must be tracked and motionless before its tags are hidden. */
const STILL_MS = 1200;

export class CamosaicChild {
  slot = -1;
  hue: number = MARKER_HUES[0];
  stage: Size = { w: STAGE_WIDTH, h: 720 };
  readonly view = new SceneView();
  private inverse: Pose | null = null;
  private poseAt = 0;
  private rxAt = 0;
  private clockOffset = 0;
  private hasClock = false;
  connected = false;
  /** Hide the tags while the display has a live position and has not moved (needs motion reports). */
  autoHideMarkers = true;
  /** True once something reports motion; without it the tags always stay visible. */
  motionSupported = false;
  markersHidden = false;
  private motionAt = 0;
  private liveSince = 0;
  size: Size = { w: 360, h: 640 };
  onState?: () => void;
  private plasmaBuffer: HTMLCanvasElement | null = null;

  constructor(private readonly sendMessage: (message: WireMessage) => void) {}

  sendSize(): void { this.sendMessage({ t: "size", w: this.size.w, h: this.size.h }); }
  get lastReceivedAt(): number { return this.rxAt; }
  get now(): number { return Date.now() + this.clockOffset; }

  private setClock(parentNow: number): void {
    const offset = parentNow - Date.now();
    this.clockOffset = this.hasClock ? this.clockOffset + (offset - this.clockOffset) * 0.1 : offset;
    this.hasClock = true;
  }

  receive(message: WireMessage): void {
    this.rxAt = performance.now();
    switch (message.t) {
      case "hello":
        this.slot = message.slot; this.hue = message.hue; this.stage = message.stage;
        this.hasClock = false; this.setClock(message.now); this.connected = true; this.markersHidden = false; this.liveSince = 0; this.sendSize(); this.onState?.();
        break;
      case "scene": this.view.apply(message); break;
      case "stage": this.stage = message.stage; break;
      case "layout": this.view.layout = message.layout; break;
      case "pose": this.setClock(message.now); this.inverse = message.m ? invertPose(message.m) : null; this.poseAt = performance.now(); break;
    }
  }

  /** Feed motion samples (accelerometer, gyroscope, or anything that knows the display moved). */
  reportMotion(moving: boolean): void {
    this.motionSupported = true;
    if (moving) this.motionAt = performance.now();
  }

  private updateMarkersHidden(live: boolean, now: number): void {
    if (!live) this.liveSince = 0;
    else if (!this.liveSince) this.liveSince = now;
    const hidden = this.autoHideMarkers && this.motionSupported && live &&
      now - this.liveSince > STILL_MS && now - this.motionAt > STILL_MS;
    if (hidden === this.markersHidden) return;
    this.markersHidden = hidden;
    this.sendMessage({ t: "markers", visible: !hidden });
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, dpr = 1): void {
    const time = this.now, { w: stageW, h: stageH } = this.stage;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#05080b"; ctx.fillRect(0, 0, width, height);
    this.view.sync(time);
    const live = this.connected && this.inverse !== null && performance.now() - this.poseAt < 1500;
    ctx.save();
    if (live && this.inverse) ctx.transform(...this.inverse);
    else {
      const scale = Math.min(width / stageW, height / stageH);
      ctx.translate((width - stageW * scale) / 2, (height - stageH * scale) / 2);
      ctx.scale(scale, scale); ctx.globalAlpha = 0.3;
    }
    ctx.beginPath(); ctx.rect(0, 0, stageW, stageH); ctx.clip();
    this.plasmaBuffer ??= document.createElement("canvas");
    drawScene(ctx, stageW, stageH, this.view, time, this.plasmaBuffer);
    ctx.restore();
    if (!live) {
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "600 15px system-ui,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(this.connected ? "Detecting position" : "Not connected to host", width / 2, height / 2);
    }
    this.updateMarkersHidden(live, performance.now());
    if (this.slot >= 0 && !this.markersHidden) drawMarkers(ctx, this.slot, width, height);
  }

  dispose(): void {
    this.view.dispose();
    this.plasmaBuffer = null;
    this.onState = undefined;
    this.connected = false;
  }
}

export function createChild(send: (message: WireMessage) => void): CamosaicChild {
  return new CamosaicChild(send);
}
