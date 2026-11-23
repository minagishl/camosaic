export const MARKER_HUES = [330, 50, 0, 90, 290] as const;
export const MAX_PEERS = MARKER_HUES.length;
export const STAGE_WIDTH = 1280;
export const DETECT_WIDTH = 1280;

export interface Size {
  w: number;
  h: number;
}

export type Pose = [number, number, number, number, number, number];
export type SceneType = "grid" | "gradient" | "plasma" | "clock" | "image" | "video";
export interface SceneState {
  scene: SceneType;
  videoUrl: string;
  image: string | null;
  epoch: number;
}
export interface TrackingOptions {
  smooth: number;
  holdMs: number;
  /** When true, a display keeps showing its last known position after tracking is lost, instead of falling back to the overview. */
  keepPose: boolean;
}
/** One detected AprilTag, in frame pixels. */
export interface TagHit {
  slot: number;
  /** 0 = top-left, 1 = top-right, 2 = bottom-right of the display. */
  corner: number;
  id: number;
  cx: number;
  cy: number;
  /** Edge length of the tag in frame pixels. */
  size: number;
}
export interface Link {
  kind: "local" | "bc" | "rtc";
  send(message: WireMessage): void;
  close?(): void;
  onmessage?: (message: WireMessage) => void;
}
export interface Peer {
  slot: number;
  link: Link;
  size: Size;
  pose: Pose | null;
  raw: Pose | null;
  cand: Array<{ x: number; y: number }>;
  /** The child hid its tags because it is standing still; keep its pose instead of treating it as lost. */
  markersHidden: boolean;
  lastHit: number;
  seenAt: number;
}
export type WireMessage =
  | { t: "join" | "ping" }
  | { t: "size"; w: number; h: number }
  | { t: "markers"; visible: boolean }
  | { t: "hello"; slot: number; hue: number; stage: Size; now: number }
  | { t: "stage"; stage: Size }
  | { t: "scene"; scene: SceneType; videoUrl: string; image: string | null; epoch: number }
  | { t: "pose"; m: Pose | null; now: number };
export interface ImageFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
  smooth: 0.6,
  holdMs: 500,
  keepPose: false,
};

/** Marker box size and the distance from the screen edge to each marker center. */
export const markerGeom = (w: number, h: number) => {
  const m = Math.min(w, h);
  return { size: m * 0.34, c: m * 0.2 };
};
