import {
  applyPose, createChild, createHost, DETECT_WIDTH, invertPose, MARKER_HUES,
  type CamosaicChild, type CamosaicHost,
} from "camosaic";

export interface VirtualDevice {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  slot: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  child: CamosaicChild;
  lastPose: [number, number, number, number];
}
export interface DeviceError { position: number; angle: number; scale: number }
export interface SelfTestResult {
  total: number;
  hits: number;
  rate: number;
  position: [number, number];
  angle: [number, number];
  scale: [number, number];
  pass: boolean;
}

export class TestLabModel {
  readonly host: CamosaicHost;
  readonly devices: VirtualDevice[] = [];
  readonly canvas: HTMLCanvasElement;
  noise = false;
  showCandidates = true;
  selected: VirtualDevice | null = null;
  private readonly context: CanvasRenderingContext2D;
  private readonly processCanvas = document.createElement("canvas");
  private readonly processContext: CanvasRenderingContext2D;
  private readonly noisePattern: CanvasPattern | null;
  private lastTick = 0;
  private readonly plasmaBuffer = document.createElement("canvas");
  onchange?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const processContext = this.processCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !processContext) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.processContext = processContext;
    this.host = createHost();
    this.host.setStage(1280, 720);
    this.processCanvas.width = DETECT_WIDTH;
    this.processCanvas.height = Math.round(DETECT_WIDTH * 9 / 16);
    this.noisePattern = this.createNoisePattern();
    this.addDevice();
    this.addDevice();
  }

  private createNoisePattern(): CanvasPattern | null {
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = noiseCanvas.height = 128;
    const context = noiseCanvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.floor(Math.random() * 255);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return this.context.createPattern(noiseCanvas, "repeat");
  }

  addDevice(): VirtualDevice | null {
    const width = 300, height = 520;
    const device = {
      canvas: document.createElement("canvas"), width, height, slot: -1,
      x: 360 + this.devices.length * 400, y: 360, rotation: 0.2, scale: 0.8, lastPose: [0, 0, 0, 0],
    } as VirtualDevice;
    device.canvas.width = width;
    device.canvas.height = height;
    device.child = createChild((message) => {
      if (device.slot >= 0) this.host.handle(device.slot, message);
    });
    device.child.size = { w: width, h: height };
    device.slot = this.host.addPeer({
      kind: "local",
      send: (message) => device.child.receive(message),
    }, { w: width, h: height });
    if (device.slot < 0) return null;
    this.devices.push(device);
    this.onchange?.();
    return device;
  }

  removeDevice(device: VirtualDevice): void {
    this.host.removePeer(device.slot);
    const index = this.devices.indexOf(device);
    if (index >= 0) this.devices.splice(index, 1);
    if (this.selected === device) this.selected = null;
    device.child.dispose();
    this.onchange?.();
  }

  truth(device: VirtualDevice): [number, number, number, number, number, number] {
    const ux = device.scale * Math.cos(device.rotation), uy = device.scale * Math.sin(device.rotation);
    const vx = -uy, vy = ux;
    return [ux, uy, vx, vy,
      device.x - ux * device.width / 2 - vx * device.height / 2,
      device.y - uy * device.width / 2 - vy * device.height / 2];
  }

  compose(): void {
    const ctx = this.context;
    for (const device of this.devices) {
      // A virtual display "senses" its own movement, like a phone's accelerometer would.
      const pose: VirtualDevice["lastPose"] = [device.x, device.y, device.rotation, device.scale];
      device.child.reportMotion(pose.some((value, index) => value !== device.lastPose[index]));
      device.lastPose = pose;
      const deviceContext = device.canvas.getContext("2d");
      if (deviceContext) device.child.render(deviceContext, device.width, device.height, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none"; ctx.fillStyle = "#2b2622"; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = "#18191c"; ctx.fillRect(140, 50, 1000, 620);
    if (this.noise) ctx.filter = "blur(1.2px)";
    for (const device of this.devices) {
      ctx.save(); ctx.translate(device.x, device.y); ctx.rotate(device.rotation); ctx.scale(device.scale, device.scale);
      ctx.translate(-device.width / 2, -device.height / 2);
      ctx.fillStyle = "#050505"; ctx.fillRect(-14, -14, device.width + 28, device.height + 28);
      ctx.drawImage(device.canvas, 0, 0); ctx.restore();
    }
    ctx.filter = "none";
    if (this.noise && this.noisePattern) {
      ctx.save(); ctx.globalAlpha = 0.12;
      ctx.translate(Math.random() * 128, Math.random() * 128);
      ctx.fillStyle = this.noisePattern; ctx.fillRect(-128, -128, 1536, 976); ctx.restore();
    }
  }

  detect() {
    this.processContext.drawImage(this.canvas, 0, 0, this.processCanvas.width, this.processCanvas.height);
    return this.host.track(this.processContext.getImageData(0, 0, this.processCanvas.width, this.processCanvas.height), performance.now());
  }

  tick(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastTick < 33) return;
    this.lastTick = now;
    this.compose();
    this.detect();
    this.drawOverlay();
  }

  drawOverlay(): void {
    const ctx = this.context;
    for (const peer of this.host.peers.values()) {
      const color = `hsl(${MARKER_HUES[peer.slot]},100%,55%)`;
      if (this.showCandidates) {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        for (const point of peer.cand) { ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2); ctx.stroke(); }
      }
      const pose = peer.raw ?? (peer.markersHidden ? peer.pose : null);
      if (!pose) continue;
      const { w, h } = peer.size;
      const points = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => applyPose(pose, x, y));
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = color; ctx.font = "700 28px system-ui,sans-serif"; ctx.fillText(`#${peer.slot + 1}`, points[0].x + 8, points[0].y + 30);
    }
  }

  compare(device: VirtualDevice): DeviceError | null {
    const peer = this.host.peers.get(device.slot);
    if (!peer?.raw) return null;
    const truth = this.truth(device);
    const actual = applyPose(peer.raw, device.width / 2, device.height / 2);
    const expected = applyPose(truth, device.width / 2, device.height / 2);
    let angle = Math.atan2(peer.raw[1], peer.raw[0]) - device.rotation;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    return {
      position: Math.hypot(actual.x - expected.x, actual.y - expected.y),
      angle: Math.abs(angle * 180 / Math.PI),
      scale: Math.abs(Math.hypot(peer.raw[0], peer.raw[1]) / device.scale - 1),
    };
  }

  hit(x: number, y: number): { device: VirtualDevice; dx: number; dy: number } | null {
    for (let i = this.devices.length - 1; i >= 0; i--) {
      const device = this.devices[i];
      const inverse = invertPose(this.truth(device));
      if (!inverse) continue;
      const point = applyPose(inverse, x, y);
      if (point.x >= 0 && point.x <= device.width && point.y >= 0 && point.y <= device.height) {
        return { device, dx: x - device.x, dy: y - device.y };
      }
    }
    return null;
  }

  randomize(): void {
    const placed: VirtualDevice[] = [];
    for (const device of this.devices) {
      let attempts = 0;
      do {
        device.x = 280 + Math.random() * 720;
        device.y = 300 + Math.random() * 120;
        attempts++;
      } while (attempts < 300 && placed.some((item) => Math.hypot(item.x - device.x, item.y - device.y) < 560));
      device.rotation = Math.random() * Math.PI * 2;
      device.scale = 0.7 + Math.random() * 0.25;
      placed.push(device);
    }
  }

  selfTest(trials: number): SelfTestResult {
    const saved = this.devices.map(({ x, y, rotation, scale }) => ({ x, y, rotation, scale }));
    const oldSmooth = this.host.options.smooth, oldHold = this.host.options.holdMs;
    this.host.options.smooth = 1;
    const positions: number[] = [], angles: number[] = [], scales: number[] = [];
    let total = 0, hits = 0;
    for (let trial = 0; trial < trials; trial++) {
      this.randomize(); this.compose(); this.detect(); this.compose(); this.detect();
      for (const device of this.devices) {
        total++;
        const result = this.compare(device);
        if (!result) continue;
        hits++; positions.push(result.position); angles.push(result.angle); scales.push(result.scale);
      }
    }
    this.devices.forEach((device, index) => Object.assign(device, saved[index]));
    this.host.options.smooth = oldSmooth;
    this.host.options.holdMs = oldHold;
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
    const maximum = (values: number[]) => values.length ? Math.max(...values) : Number.NaN;
    const rate = total ? hits / total : 0;
    return {
      total, hits, rate,
      position: [average(positions), maximum(positions)],
      angle: [average(angles), maximum(angles)],
      scale: [average(scales), maximum(scales)],
      pass: rate >= 0.95 && maximum(positions) < 8 && maximum(angles) < 3,
    };
  }

  dispose(): void {
    this.host.dispose();
    for (const device of this.devices) device.child.dispose();
    this.devices.length = 0;
  }
}
