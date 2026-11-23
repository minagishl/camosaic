import { describe, expect, it } from "vitest";
import {
  applyPose, createChild, createHost, detectTags, drawTag, encodeSignal, invertPose, markerGeom, parseTagId,
  poseFrom, tagBits, tagId,
} from "../src/core";
import { attachDataChannel } from "../src/core/transport/chunks";
import { deserializeMessage, serializeMessage } from "../src/core/transport/messages";
import type { ImageFrame, WireMessage } from "../src/core/types";

/** A software canvas that records filled rectangles into an RGBA frame. */
function frameContext(frame: ImageFrame) {
  const rgb = { "#fff": 255, "#000": 0 } as Record<string, number>;
  return {
    fillStyle: "#fff" as unknown,
    fillRect(x: number, y: number, w: number, h: number) {
      const value = rgb[String(this.fillStyle)] ?? 0;
      for (let row = Math.max(0, y); row < Math.min(frame.height, y + h); row++) {
        for (let col = Math.max(0, x); col < Math.min(frame.width, x + w); col++) {
          const p = (row * frame.width + col) * 4;
          frame.data[p] = frame.data[p + 1] = frame.data[p + 2] = value;
        }
      }
    },
  };
}

/** A dark frame holding the three AprilTags of a 300x520 display for `slot`. */
function syntheticFrame(slot = 0, offsetX = 0, width = 500, height = 600): ImageFrame {
  const data = new Uint8ClampedArray(width * height * 4).fill(20);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const frame = { data, width, height };
  const ctx = frameContext(frame);
  const { size, c } = markerGeom(300, 520);
  const left = 100 + offsetX, top = 20;
  [[c, c], [300 - c, c], [300 - c, 520 - c]].forEach(([x, y], corner) => drawTag(ctx, tagId(slot, corner), left + x, top + y, size));
  return frame;
}

class FakeDataChannel extends EventTarget {
  readyState = "open";
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = "closed"; }
}

describe("vision", () => {
  it("maps tag ids to display slots and corners", () => {
    expect(parseTagId(tagId(3, 2))).toEqual({ slot: 3, corner: 2 });
    expect(parseTagId(15)).toBeNull();
    expect(parseTagId(-1)).toBeNull();
    expect(tagBits(0)).toHaveLength(36);
  });

  it("detects the three AprilTags with their slot, corner and position", () => {
    const hits = detectTags(syntheticFrame(2));
    expect(hits.map((hit) => [hit.slot, hit.corner]).sort()).toEqual([[2, 0], [2, 1], [2, 2]]);
    const { c } = markerGeom(300, 520);
    const tl = hits.find((hit) => hit.corner === 0)!, tr = hits.find((hit) => hit.corner === 1)!, br = hits.find((hit) => hit.corner === 2)!;
    expect(Math.abs(tl.cx - (100 + c))).toBeLessThan(1);
    expect(Math.abs(tl.cy - (20 + c))).toBeLessThan(1);
    expect(tr.cx).toBeGreaterThan(tl.cx);
    expect(br.cy).toBeGreaterThan(tr.cy);
  });

  it("detects several displays in one frame", () => {
    const frame = syntheticFrame(0, 0, 900, 600);
    const other = syntheticFrame(1, 380, 900, 600);
    for (let i = 0; i < frame.data.length; i += 4) if (other.data[i] !== 20) frame.data[i] = frame.data[i + 1] = frame.data[i + 2] = other.data[i];
    const hits = detectTags(frame);
    expect(hits.filter((hit) => hit.slot === 0)).toHaveLength(3);
    expect(hits.filter((hit) => hit.slot === 1)).toHaveLength(3);
  });
});

describe("geometry and tracking", () => {
  it("maps screen coordinates to the stage and inverts the affine pose", () => {
    const pose = poseFrom({ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 230 }, 100, 200, 0);
    const stage = applyPose(pose, 47, 91);
    expect(stage.x).toBeCloseTo(67);
    expect(stage.y).toBeCloseTo(121);
    const inverse = invertPose(pose);
    expect(inverse).not.toBeNull();
    expect(applyPose(inverse!, stage.x, stage.y).x).toBeCloseTo(47);
    expect(applyPose(inverse!, stage.x, stage.y).y).toBeCloseTo(91);
    expect(invertPose([1, 0, 1, 0, 0, 0])).toBeNull();
  });

  it("smooths poses and preserves a detected pose only during the configured loss window", () => {
    const host = createHost();
    const slot = host.addPeer({ kind: "local", send: () => undefined }, { w: 300, h: 520 });
    host.options.smooth = 0.5;
    host.track(syntheticFrame(0), 100);
    const first = host.peers.get(slot)!.pose!;
    host.track(syntheticFrame(0, 20), 200);
    const smoothed = host.peers.get(slot)!.pose!;
    expect(smoothed[4]).toBeCloseTo((first[4] + host.peers.get(slot)!.raw![4]) / 2);
    const empty = { data: new Uint8ClampedArray(500 * 600 * 4), width: 500, height: 600 };
    host.track(empty, 300);
    expect(host.peers.get(slot)!.pose).not.toBeNull();
    host.track(empty, 800);
    expect(host.peers.get(slot)!.pose).toBeNull();
    host.dispose();
  });
});

describe("keeping the last position", () => {
  it("keeps the last pose after the loss window only when keepPose is set", () => {
    const host = createHost();
    const slot = host.addPeer({ kind: "local", send: () => undefined }, { w: 300, h: 520 });
    const empty = { data: new Uint8ClampedArray(500 * 600 * 4), width: 500, height: 600 };
    host.options.keepPose = true;
    host.track(syntheticFrame(0), 100);
    const pose = host.peers.get(slot)!.pose!;
    host.track(empty, 5000);
    expect(host.peers.get(slot)!.pose).toEqual(pose);
    expect(host.peers.get(slot)!.raw).toBeNull();
    host.options.keepPose = false;
    host.track(empty, 6000);
    expect(host.peers.get(slot)!.pose).toBeNull();
    host.dispose();
  });
});

describe("hidden tags", () => {
  it("keeps a display's pose while it has hidden its tags, then resumes the loss window when they return", () => {
    const host = createHost();
    const slot = host.addPeer({ kind: "local", send: () => undefined }, { w: 300, h: 520 });
    const empty = { data: new Uint8ClampedArray(500 * 600 * 4), width: 500, height: 600 };
    host.track(syntheticFrame(0), 100);
    const pose = host.peers.get(slot)!.pose!;
    host.handle(slot, { t: "markers", visible: false });
    host.track(empty, 5000);
    expect(host.peers.get(slot)!.markersHidden).toBe(true);
    expect(host.peers.get(slot)!.pose).toEqual(pose);
    host.handle(slot, { t: "markers", visible: true });
    host.track(empty, performance.now() + 100);
    expect(host.peers.get(slot)!.pose).not.toBeNull();
    host.track(empty, performance.now() + 5000);
    expect(host.peers.get(slot)!.pose).toBeNull();
    host.dispose();
  });

  it("validates the markers message", () => {
    expect(deserializeMessage(serializeMessage({ t: "markers", visible: false }))).toEqual({ t: "markers", visible: false });
    expect(() => deserializeMessage('{"t":"markers","visible":"no"}')).toThrow();
  });
});

describe("communication and clock synchronization", () => {
  it("validates message serialization", () => {
    const message: WireMessage = { t: "scene", scene: "grid", videoUrl: "", image: null, epoch: 100 };
    expect(deserializeMessage(serializeMessage(message))).toEqual(message);
    expect(() => deserializeMessage('{"t":"pose","m":[1],"now":0}')).toThrow();
  });

  it("reassembles chunks sent over a data channel", () => {
    const sender = new FakeDataChannel() as unknown as RTCDataChannel;
    const receiver = new FakeDataChannel() as unknown as RTCDataChannel;
    const send = attachDataChannel(sender);
    const receive = attachDataChannel(receiver);
    const image = "x".repeat(25000);
    let reconstructed: WireMessage | undefined;
    receive.onmessage = (message) => { reconstructed = message; };
    send.send({ t: "scene", scene: "image", videoUrl: "", image, epoch: 123 });
    expect((sender as unknown as FakeDataChannel).sent.length).toBeGreaterThan(1);
    for (const part of (sender as unknown as FakeDataChannel).sent) {
      receiver.dispatchEvent(new MessageEvent("message", { data: part }));
    }
    expect(reconstructed).toEqual({ t: "scene", scene: "image", videoUrl: "", image, epoch: 123 });
  });

  it("estimates the host clock from received messages", () => {
    const child = createChild(() => undefined);
    const parentTime = Date.now() + 1800;
    child.receive({ t: "hello", slot: 1, hue: 50, stage: { w: 1280, h: 720 }, now: parentTime });
    expect(child.connected).toBe(true);
    expect(child.slot).toBe(1);
    expect(Math.abs(child.now - parentTime)).toBeLessThan(25);
    child.dispose();
  });

  it("round-trips a WebRTC signaling description", async () => {
    const description: RTCSessionDescriptionInit = { type: "offer", sdp: "v=0\r\no=- test session\r\n" };
    const { decodeSignal, encodeSignal } = await import("../src/core/transport/signaling");
    expect(await decodeSignal(await encodeSignal(description))).toEqual(description);
  });
});
