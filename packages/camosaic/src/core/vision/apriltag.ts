import aruco from "js-aruco2/src/aruco.js";
import * as cvModule from "js-aruco2/src/cv.js";
import { MAX_PEERS } from "../types";
import type { ImageFrame, TagHit } from "../types";

const { AR } = aruco;
// js-aruco2 assigns `this.CV`, which bundlers expose either as a named or a default export.
const CV = ((cvModule as unknown as { CV?: unknown; default?: { CV?: unknown } }).CV ?? (cvModule as unknown as { default?: { CV?: unknown } }).default?.CV) as typeof import("js-aruco2/src/cv.js").default.CV;

/** Adaptive-threshold radius in pixels; it must exceed the tag border width or the border reads as hollow. */
const THRESHOLD_KERNEL = 10;

/** Corner order: 0 = top-left, 1 = top-right, 2 = bottom-right of the display. */
export const TAG_CORNERS = 3;
export const TAG_FAMILY = "APRILTAG_36h11";

/** Codes of AprilTag family tag36h11, ids 0-14 (three tags per display, five displays). */
const CODES = [
  0xd5d628584, 0xd97f18b49, 0xdd280910e, 0xe479e9c98, 0xebcbca822, 0xf31dab3ac, 0x56a5d085, 0x10652e1d4,
  0x22b1dfead, 0x265ad0472, 0x34fe91b86, 0x3ff962cd5, 0x43a25329a, 0x474b4385f, 0x4e9d243e9,
];
const BITS = 6;
/** Modules across a drawn tag: white margin, black border, 6x6 payload, black border, white margin. */
export const TAG_MODULES = BITS + 4;

AR.DICTIONARIES[TAG_FAMILY] = { nBits: BITS * BITS, tau: 11, codeList: CODES };

export function tagId(slot: number, corner: number): number {
  return slot * TAG_CORNERS + corner;
}

export function parseTagId(id: number): { slot: number; corner: number } | null {
  if (!Number.isInteger(id) || id < 0 || id >= MAX_PEERS * TAG_CORNERS) return null;
  return { slot: Math.floor(id / TAG_CORNERS), corner: id % TAG_CORNERS };
}

/** Payload bits of a tag, row-major, true = white. */
export function tagBits(id: number): boolean[] {
  const code = CODES[id];
  if (code === undefined) throw new RangeError(`Unknown tag id ${id}`);
  return code.toString(2).padStart(BITS * BITS, "0").split("").map((bit) => bit === "1");
}

interface Canvas2D {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Draws a tag centered on (cx, cy) inside a square box of `size` pixels (margin included). */
export function drawTag(ctx: Canvas2D, id: number, cx: number, cy: number, size: number): void {
  const bits = tagBits(id);
  const unit = size / TAG_MODULES;
  const left = cx - size / 2, top = cy - size / 2;
  const rect = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.round(left + x * unit), y0 = Math.round(top + y * unit);
    ctx.fillRect(x0, y0, Math.round(left + (x + w) * unit) - x0, Math.round(top + (y + h) * unit) - y0);
  };
  ctx.fillStyle = "#fff";
  rect(0, 0, TAG_MODULES, TAG_MODULES);
  ctx.fillStyle = "#000";
  rect(1, 1, BITS + 2, BITS + 2);
  ctx.fillStyle = "#fff";
  bits.forEach((white, index) => {
    if (white) rect(2 + (index % BITS), 2 + Math.floor(index / BITS), 1, 1);
  });
}

/** Draws the three corner tags of a display. */
export function drawMarkers(ctx: Canvas2D, slot: number, width: number, height: number): void {
  const m = Math.min(width, height);
  const size = m * 0.34, c = m * 0.2;
  [[c, c], [width - c, c], [width - c, height - c]].forEach(([x, y], corner) => drawTag(ctx, tagId(slot, corner), x, y, size));
}

let detector: InstanceType<typeof AR.Detector> | null = null;

/** Finds every Camosaic tag in a frame. */
export function detectTags(frame: ImageFrame): TagHit[] {
  if (!detector) {
    detector = new AR.Detector({ dictionaryName: TAG_FAMILY, maxHammingDistance: 6 });
    // js-aruco2 hardcodes a 2px kernel, which only finds large tags; run the same pipeline with a wider one.
    const raw = detector as unknown as Record<string, any>;
    raw.detect = function (image: ImageFrame) {
      CV.grayscale(image, this.grey);
      CV.adaptiveThreshold(this.grey, this.thres, THRESHOLD_KERNEL, 7);
      this.contours = CV.findContours(this.thres, this.binary);
      this.candidates = this.findCandidates(this.contours, image.width * 0.01, 0.05, 10);
      this.candidates = this.clockwiseCorners(this.candidates);
      this.candidates = this.notTooNear(this.candidates, 10);
      return this.findMarkers(this.grey, this.candidates, 49);
    };
  }
  const hits: TagHit[] = [];
  for (const marker of detector.detectImage(frame.width, frame.height, frame.data)) {
    const parsed = parseTagId(marker.id);
    if (!parsed || hits.some((hit) => hit.slot === parsed.slot && hit.corner === parsed.corner)) continue;
    const { corners } = marker;
    const cx = corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
    const cy = corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
    const size = (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) + Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)) / 2;
    hits.push({ ...parsed, id: marker.id, cx, cy, size });
  }
  return hits;
}
