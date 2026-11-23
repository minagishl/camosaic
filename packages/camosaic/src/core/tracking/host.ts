import { applyPose, lerpPose, poseFrom } from "../geometry/affine";
import { detectTags } from "../vision/apriltag";
import { DEFAULT_TRACKING_OPTIONS, DETECT_WIDTH, MARKER_HUES, MAX_PEERS, markerGeom, STAGE_WIDTH } from "../types";
import type { ImageFrame, Link, Peer, Pose, TagHit, SceneState, Size, TrackingOptions, WireMessage } from "../types";

export class CamosaicHost {
  readonly peers = new Map<number, Peer>();
  stage: Size = { w: STAGE_WIDTH, h: Math.round(STAGE_WIDTH * 9 / 16) };
  scene: SceneState = { scene: "grid", videoUrl: "", image: null, epoch: Date.now() };
  readonly options: TrackingOptions = { ...DEFAULT_TRACKING_OPTIONS };
  private listeners = new Set<() => void>();

  on(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private send(peer: Peer, message: WireMessage): void {
    try { peer.link.send(message); } catch { /* Stale links are cleaned up by heartbeat. */ }
  }

  private greet(peer: Peer): void {
    this.send(peer, { t: "hello", slot: peer.slot, hue: MARKER_HUES[peer.slot], stage: this.stage, now: Date.now() });
    this.send(peer, this.sceneMessage());
  }

  sceneMessage(): Extract<WireMessage, { t: "scene" }> {
    return { t: "scene", ...this.scene };
  }

  addPeer(link: Link, size: Size = { w: 360, h: 640 }): number {
    let slot = 0;
    while (slot < MAX_PEERS && this.peers.has(slot)) slot++;
    if (slot >= MAX_PEERS) return -1;
    const peer: Peer = { slot, link, size, pose: null, raw: null, cand: [], markersHidden: false, lastHit: 0, seenAt: performance.now() };
    this.peers.set(slot, peer);
    this.greet(peer);
    this.emit();
    return slot;
  }

  removePeer(slot: number): void {
    const peer = this.peers.get(slot);
    if (!peer) return;
    try { peer.link.close?.(); } catch { /* Ignore already-closed connections. */ }
    this.peers.delete(slot);
    this.emit();
  }

  handle(slot: number, message: WireMessage): void {
    const peer = this.peers.get(slot);
    if (!peer) return;
    peer.seenAt = performance.now();
    if (message.t === "size" && Number.isFinite(message.w) && Number.isFinite(message.h) &&
      message.w > 0 && message.h > 0 && message.w <= 100_000 && message.h <= 100_000) {
      peer.size = { w: message.w, h: message.h };
      this.emit();
    } else if (message.t === "markers") {
      peer.markersHidden = !message.visible;
      // Give the tags a moment to be found again before a missing pose counts as lost.
      if (message.visible) peer.lastHit = performance.now();
      this.emit();
    } else if (message.t === "join") {
      peer.markersHidden = false;
      this.greet(peer);
    }
  }

  setStage(w: number, h: number): void {
    if (!(w > 0 && h > 0)) return;
    this.stage = { w, h };
    for (const peer of this.peers.values()) this.send(peer, { t: "stage", stage: this.stage });
    this.emit();
  }

  setScene(patch: Partial<SceneState>): void {
    this.scene = { ...this.scene, ...patch, epoch: Date.now() };
    for (const peer of this.peers.values()) this.send(peer, this.sceneMessage());
    this.emit();
  }

  heartbeat(now = performance.now()): void {
    for (const peer of [...this.peers.values()]) {
      if (peer.link.kind !== "local" && now - peer.seenAt > 9000) {
        this.removePeer(peer.slot);
        continue;
      }
      this.send(peer, { t: "pose", m: peer.pose, now: Date.now() });
    }
  }

  /**
   * Finds the AprilTags in a camera frame and updates every display's pose.
   * Pass `mirror` when the preview is mirrored; the frame itself must not be mirrored.
   */
  track(frame: ImageFrame, now = performance.now(), { mirror = false }: { mirror?: boolean } = {}): TagHit[] {
    const { width, height } = frame;
    const peers = [...this.peers.values()];
    const hits = peers.length ? detectTags(frame) : [];

    const sx = this.stage.w / width, sy = this.stage.h / height;
    const toStage = (hit: { cx: number; cy: number }) => ({ x: (mirror ? width - hit.cx : hit.cx) * sx, y: hit.cy * sy });
    for (const peer of peers) {
      if (peer.markersHidden) {
        // The tags are hidden on purpose (the display is standing still), so there is nothing to track.
        peer.raw = null;
        peer.cand = [];
        this.send(peer, { t: "pose", m: peer.pose, now: Date.now() });
        continue;
      }
      const own = hits.filter((hit) => hit.slot === peer.slot);
      peer.cand = own.map(toStage);
      const corners = [0, 1, 2].map((corner) => own.find((hit) => hit.corner === corner));
      if (corners[0] && corners[1] && corners[2]) {
        const [tl, tr, br] = corners.map((hit) => toStage(hit!));
        const raw = poseFrom(tl, tr, br, peer.size.w, peer.size.h, markerGeom(peer.size.w, peer.size.h).c);
        peer.raw = raw;
        peer.pose = peer.pose ? lerpPose(peer.pose, raw, this.options.smooth) : raw;
        peer.lastHit = now;
      } else {
        peer.raw = null;
        if (peer.pose && !this.options.keepPose && now - peer.lastHit > this.options.holdMs) peer.pose = null;
      }
      this.send(peer, { t: "pose", m: peer.pose, now: Date.now() });
    }
    this.emit();
    return hits;
  }

  /** Position estimate used by diagnostics and overlays. */
  centerPose(pose: Pose, size: Size) {
    return applyPose(pose, size.w / 2, size.h / 2);
  }

  dispose(): void {
    for (const slot of [...this.peers.keys()]) this.removePeer(slot);
    this.listeners.clear();
  }
}

export function createHost(): CamosaicHost {
  return new CamosaicHost();
}

export { DETECT_WIDTH };
