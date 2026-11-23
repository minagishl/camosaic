import type { Pose } from "../types";

export interface Point {
  x: number;
  y: number;
}

/** Maps child-screen pixels to shared-stage pixels. */
export function poseFrom(tl: Point, tr: Point, br: Point, w: number, h: number, c: number): Pose {
  const sx = w - 2 * c;
  const sy = h - 2 * c;
  const ux = (tr.x - tl.x) / sx;
  const uy = (tr.y - tl.y) / sx;
  const vx = (br.x - tr.x) / sy;
  const vy = (br.y - tr.y) / sy;
  return [ux, uy, vx, vy, tl.x - ux * c - vx * c, tl.y - uy * c - vy * c];
}

export function applyPose(m: Pose, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Maps shared-stage pixels to child-screen pixels; suitable for CanvasRenderingContext2D.transform. */
export function invertPose(m: Pose): Pose | null {
  const [ux, uy, vx, vy, ox, oy] = m;
  const det = ux * vy - vx * uy;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const a = vy / det;
  const c = -vx / det;
  const b = -uy / det;
  const d = ux / det;
  return [a, b, c, d, -(a * ox + c * oy), -(b * ox + d * oy)];
}

export function lerpPose(a: Pose, b: Pose, amount: number): Pose {
  return a.map((value, i) => value + (b[i] - value) * amount) as Pose;
}
