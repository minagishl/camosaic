import { useEffect, useRef, useState } from "react";
import { IconPlayerPlay, IconPlus, IconTrash } from "@tabler/icons-react";
import { MARKER_HUES, type SceneType } from "camosaic";
import {
  Button, DeviceSwatch, Disclosure, ImagePicker, IconButton, Input, Panel, Readout, SceneGrid, Section, Slider, Switch, Workspace, stageClass,
} from "../../components/ui";
import { MediaLayoutControls } from "../../components/media-layout";
import { TestLabModel, type SelfTestResult, type VirtualDevice } from "./test-lab-model";

const scenes: Array<{ id: SceneType; label: string }> = [
  { id: "grid", label: "Grid" }, { id: "gradient", label: "Gradient" }, { id: "plasma", label: "Plasma" },
  { id: "clock", label: "Clock" }, { id: "image", label: "Image" }, { id: "video", label: "Video URL" },
];

const testTones = {
  muted: "",
  good: "border-emerald-900 text-emerald-300",
  bad: "border-red-900 text-red-300",
} as const;

/** Maps a pointer position to the 1280×720 scene, accounting for object-contain letterboxing. */
function scenePoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / 1280, rect.height / 720);
  return {
    x: (clientX - rect.left - (rect.width - 1280 * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - 720 * scale) / 2) / scale,
  };
}

function resultText(result: SelfTestResult): string {
  const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(2) : "—";
  return [
    `Result: ${result.pass ? "PASS" : "FAIL"}`,
    `Detection rate: ${(result.rate * 100).toFixed(1)}% (${result.hits}/${result.total})`,
    `Position error: avg ${fmt(result.position[0])}px / max ${fmt(result.position[1])}px`,
    `Angle error: avg ${fmt(result.angle[0])}° / max ${fmt(result.angle[1])}°`,
    `Scale error: avg ${fmt(result.scale[0] * 100)}% / max ${fmt(result.scale[1] * 100)}%`,
    ].join("\n");
}

export function LabRoute() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<TestLabModel | null>(null);
  const dragRef = useRef<{ device: VirtualDevice; dx: number; dy: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readout, setReadout] = useState("…");
  const [testResult, setTestResult] = useState("Not run");
  const [testTone, setTestTone] = useState<"muted" | "good" | "bad">("muted");
  const [sceneVideoUrl, setSceneVideoUrl] = useState("");
  const [sceneError, setSceneError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lab: TestLabModel;
    try { lab = new TestLabModel(canvas); }
    catch (error) {
      setReadout(error instanceof Error ? error.message : "Could not initialize canvas.");
      return;
    }
    modelRef.current = lab;
    lab.onchange = () => setRevision((value) => value + 1);
    setReady(true);
    let raf = 0;
    let lastReadout = 0;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      lab.tick();
      if (time - lastReadout > 300) {
        lastReadout = time;
        setReadout(lab.devices.map((device) => {
          const error = lab.compare(device);
          const candidates = lab.host.peers.get(device.slot)?.cand.length ?? 0;
          if (lab.host.peers.get(device.slot)?.markersHidden) return `#${device.slot + 1}  Still · tags hidden`;
          return error
            ? `#${device.slot + 1}  Tracking  position ${error.position.toFixed(2)}px  angle ${error.angle.toFixed(2)}°`
            : `#${device.slot + 1}  Not detected · ${candidates} marker candidates`;
        }).join("\n") || "No virtual devices.");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      lab.dispose();
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const lab = modelRef.current;
      if (!lab) return;
      const { x, y } = scenePoint(canvas, event.clientX, event.clientY);
      const hit = lab.hit(x, y);
      const device = hit?.device ?? lab.selected;
      if (!device) return;
      event.preventDefault();
      device.rotation += event.deltaY * 0.002;
      setRevision((value) => value + 1);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [ready]);

  const lab = modelRef.current;
  void revision;
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => scenePoint(event.currentTarget, event.clientX, event.clientY);
  const sceneChange = (scene: SceneType) => {
    lab?.host.setScene({ scene });
    setSceneError("");
  };
  const addImage = async (file?: File) => {
    if (!file || !lab) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / bitmap.width);
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = Math.round(bitmap.width * scale);
      imageCanvas.height = Math.round(bitmap.height * scale);
      const context = imageCanvas.getContext("2d");
      if (!context) throw new Error("Could not process image.");
      context.drawImage(bitmap, 0, 0, imageCanvas.width, imageCanvas.height);
      bitmap.close();
      lab.host.setScene({ scene: "image", image: imageCanvas.toDataURL("image/jpeg", 0.82) });
      setSceneError("");
    } catch (error) { setSceneError(error instanceof Error ? error.message : "Could not read image."); }
  };
  const runTest = () => {
    if (!lab?.devices.length) {
      setTestResult("Add a device first.");
      setTestTone("muted");
      return;
    }
    setTestResult("Running…");
    setTestTone("muted");
    window.setTimeout(() => {
      const result = lab.selfTest(40);
      setTestResult(resultText(result));
      setTestTone(result.pass ? "good" : "bad");
      setRevision((value) => value + 1);
    }, 20);
  };

  return <Workspace
      stage={<canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className={`${stageClass} cursor-crosshair touch-none`}
        aria-label="Virtual camera scene"
        onPointerDown={(event) => {
          const model = modelRef.current;
          if (!model) return;
          const p = point(event);
          const hit = model.hit(p.x, p.y);
          if (!hit) return;
          model.selected = hit.device;
          dragRef.current = hit;
          model.devices.push(model.devices.splice(model.devices.indexOf(hit.device), 1)[0]);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || !modelRef.current) return;
          const p = point(event);
          drag.device.x = Math.max(0, Math.min(1280, p.x - drag.dx));
          drag.device.y = Math.max(0, Math.min(720, p.y - drag.dy));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
      />}
    >
      <Panel>
        <Section title="Scene">
          <SceneGrid scenes={scenes} selected={lab?.host.scene.scene} onSelect={sceneChange} />
          {lab?.host.scene.scene === "image" && <ImagePicker onFile={(file) => void addImage(file)} />}
          {lab && (lab.host.scene.scene === "image" || lab.host.scene.scene === "video") && <MediaLayoutControls layout={lab.host.scene.layout} onChange={(patch) => lab.host.setLayout(patch)} />}
          {lab?.host.scene.scene === "video" && <div className="flex min-w-0 items-center gap-2">
            <Input type="url" aria-label="Video URL" placeholder="https://example.com/video.mp4" value={sceneVideoUrl} onChange={(event) => setSceneVideoUrl(event.target.value)} />
            <Button onClick={() => lab.host.setScene({ scene: "video", videoUrl: sceneVideoUrl.trim() })}>Apply</Button>
          </div>}
          {sceneError && <p className="text-xs text-red-300">{sceneError}</p>}
        </Section>
        <Section title={`Devices · ${lab?.devices.length ?? 0}/5`}>
          <div className="grid gap-2">
            {lab?.devices.map((device) => <div className="grid gap-1 rounded-lg border border-white/10 bg-zinc-800/30 p-3" key={device.slot}>
              <div className="flex items-center gap-2 text-xs text-zinc-200">
                <DeviceSwatch hue={MARKER_HUES[device.slot]} />
                <strong className="font-medium">Device {device.slot + 1}</strong>
                <IconButton className="ml-auto" title={`Remove device ${device.slot + 1}`} onClick={() => lab.removeDevice(device)}><IconTrash size={14} stroke={1.75} /></IconButton>
              </div>
              <Slider label="Rotation" min={0} max={360} step={1} value={Math.round(((device.rotation * 180 / Math.PI) % 360 + 360) % 360)} format={(n) => `${n}°`} onChange={(value) => { device.rotation = value * Math.PI / 180; setRevision((n) => n + 1); }} />
              <Slider label="Scale" min={0.4} max={1.1} step={0.01} value={device.scale} format={(n) => n.toFixed(2)} onChange={(scale) => { device.scale = scale; setRevision((n) => n + 1); }} />
            </div>)}
          </div>
          <Button onClick={() => lab?.addDevice()} disabled={!lab || lab.devices.length >= 5}><IconPlus size={14} stroke={1.75} /> Add device</Button>
          <Switch label="Noise" checked={lab?.noise ?? false} onChange={(noise) => { if (lab) lab.noise = noise; setRevision((n) => n + 1); }} />
          <Switch label="Keep last position when lost" checked={lab?.host.options.keepPose ?? false} onChange={(keep) => { if (lab) lab.host.options.keepPose = keep; setRevision((n) => n + 1); }} />
          <Switch label="Show candidates" checked={lab?.showCandidates ?? true} onChange={(show) => { if (lab) lab.showCandidates = show; setRevision((n) => n + 1); }} />
        </Section>
        <Section title="Self-test">
          <Button variant="primary" onClick={runTest} disabled={!ready}><IconPlayerPlay size={14} stroke={1.75} /> Run self-test</Button>
          <Readout aria-label="Self-test result" className={testTones[testTone]}>{testResult}</Readout>
        </Section>
        <Section title="Errors">
          <Readout aria-label="Tracking errors">{readout}</Readout>
        </Section>
        <Disclosure title="Tuning">
          {lab && <>
            <Slider label="Pose smoothing" min={0.1} max={1} step={0.05} value={lab.host.options.smooth} format={(n) => n.toFixed(2)} onChange={(smooth) => { lab.host.options.smooth = smooth; }} />
            <Slider label="Loss hold" min={100} max={2000} step={50} value={lab.host.options.holdMs} format={(n) => `${n}ms`} onChange={(holdMs) => { lab.host.options.holdMs = holdMs; }} />
          </>}
        </Disclosure>
      </Panel>
  </Workspace>;
}
