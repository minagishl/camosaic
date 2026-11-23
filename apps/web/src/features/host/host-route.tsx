import { useEffect, useRef, useState } from "react";
import { IconCopy, IconLink, IconTrash, IconVideo } from "@tabler/icons-react";
import {
  DETECT_WIDTH, MARKER_HUES, applyPose, useCamera, useCamosaic, useTrackingSnapshot,
  type SceneType,
} from "camosaic";
import {
  Badge, Button, DeviceSwatch, ImagePicker, Disclosure, Field, IconButton, Input, Muted, Panel, SceneGrid, Section, Select, Slider, Switch, Textarea, Workspace, buttonClass, stageClass,
} from "../../components/ui";
import { useUiStore } from "../../stores/ui-store";
import { MediaLayoutControls } from "../../components/media-layout";
import { joinQr } from "../../lib/qr";
import { useHostPairing } from "../../lib/pairing";

const scenes: Array<{ id: SceneType; label: string }> = [
  { id: "grid", label: "Grid" }, { id: "gradient", label: "Gradient" }, { id: "plasma", label: "Plasma" },
  { id: "clock", label: "Clock" }, { id: "image", label: "Image" }, { id: "video", label: "Video URL" },
];

function drawOverlay(ctx: CanvasRenderingContext2D, host: NonNullable<ReturnType<typeof useCamosaic>["host"]>, showCandidates: boolean) {
  for (const peer of host.peers.values()) {
    const color = `hsl(${MARKER_HUES[peer.slot]},100%,55%)`;
    if (showCandidates) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const point of peer.cand) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (!peer.raw) continue;
    const { w, h } = peer.size;
    const quad = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => applyPose(peer.raw!, x, y));
    ctx.beginPath();
    quad.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath(); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color; ctx.font = "700 28px system-ui,sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`#${peer.slot + 1}`, quad[0].x + 8, quad[0].y + 30);
  }
}

async function imageDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process this image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function HostRoute() {
  const { host } = useCamosaic("host");
  const pairing = useHostPairing(host);
  const camera = useCamera();
  const revision = useTrackingSnapshot(host, 250);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const processRef = useRef<HTMLCanvasElement>(null);
  const [cameraId, setCameraId] = useState("");
  const [copied, setCopied] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [sceneError, setSceneError] = useState("");
  const mirror = useUiStore((state) => state.mirror);
  const setMirror = useUiStore((state) => state.setMirror);
  const showCandidates = useUiStore((state) => state.showCandidates);
  const setShowCandidates = useUiStore((state) => state.setShowCandidates);
  const keepPose = useUiStore((state) => state.keepPose);
  const setKeepPose = useUiStore((state) => state.setKeepPose);

  useEffect(() => { if (host) host.options.keepPose = keepPose; }, [host, keepPose]);

  useEffect(() => {
    if (!host) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = camera.stream;
    if (camera.stream) {
      void video.play().catch(() => undefined);
      const setStage = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          host.setStage(1280, Math.round(1280 * video.videoHeight / video.videoWidth));
        }
      };
      video.addEventListener("loadedmetadata", setStage);
      setStage();
      return () => {
        video.removeEventListener("loadedmetadata", setStage);
        video.srcObject = null;
      };
    }
    return () => { video.srcObject = null; };
  }, [camera.stream, host]);

  useEffect(() => {
    if (!host) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const process = processRef.current;
    const processContext = process?.getContext("2d", { willReadFrequently: true });
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !process || !processContext || !context) return;
    let renderFrame = 0;
    let trackingFrame = 0;
    let videoFrame = 0;
    let stopped = false;
    let lastFallbackTrack = 0;
    let lastError = "";
    const frameVideo = video as unknown as {
      requestVideoFrameCallback?: (callback: (now: number) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const trackFrame = () => {
      if (!camera.stream || video.readyState < 2 || !video.videoWidth) return;
      const pw = DETECT_WIDTH;
      const ph = Math.max(1, Math.round(pw * video.videoHeight / video.videoWidth));
      if (process.width !== pw || process.height !== ph) { process.width = pw; process.height = ph; }
      processContext.drawImage(video, 0, 0, pw, ph);
      try { host.track(processContext.getImageData(0, 0, pw, ph), performance.now(), { mirror }); lastError = ""; }
      catch (error) { lastError = error instanceof Error ? error.message : "Frame processing failed"; }
    };
    const processVideoFrame = () => {
      if (stopped) return;
      trackFrame();
      videoFrame = frameVideo.requestVideoFrameCallback?.(processVideoFrame) ?? 0;
    };
    const processFallbackFrame = (time: number) => {
      if (stopped) return;
      if (time - lastFallbackTrack >= 33) {
        lastFallbackTrack = time;
        trackFrame();
      }
      trackingFrame = requestAnimationFrame(processFallbackFrame);
    };
    if (camera.stream) {
      if (frameVideo.requestVideoFrameCallback) videoFrame = frameVideo.requestVideoFrameCallback(processVideoFrame);
      else trackingFrame = requestAnimationFrame(processFallbackFrame);
    }
    const render = () => {
      renderFrame = requestAnimationFrame(render);
      const { w, h } = host.stage;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#050505"; context.fillRect(0, 0, w, h);
      if (camera.stream && video.readyState >= 2 && video.videoWidth > 0) {
        context.save();
        if (mirror) { context.translate(w, 0); context.scale(-1, 1); }
        context.drawImage(video, 0, 0, w, h);
        context.restore();
      } else {
        context.fillStyle = "rgba(255,255,255,.65)"; context.font = "500 19px system-ui,sans-serif";
        context.textAlign = "center"; context.textBaseline = "middle"; context.fillText("Start a camera to begin tracking", w / 2, h / 2);
      }
      drawOverlay(context, host, showCandidates);
      if (lastError) {
        context.fillStyle = "#fca5a5"; context.textAlign = "left"; context.font = "13px system-ui,sans-serif";
        context.fillText(lastError, 16, h - 18);
      }
    };
    renderFrame = requestAnimationFrame(render);
    return () => {
      stopped = true;
      cancelAnimationFrame(renderFrame);
      cancelAnimationFrame(trackingFrame);
      if (videoFrame) frameVideo.cancelVideoFrameCallback?.(videoFrame);
    };
  }, [camera.stream, host, mirror, showCandidates]);


  if (!host) return null;
  void revision;

  const setScene = (scene: SceneType) => {
    host.setScene({ scene });
  };

  const joinUrl = `${window.location.origin}/child?code=${pairing.code}`;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(joinUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { /* Clipboard may be unavailable; the code and QR are still shown. */ }
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    try {
      host.setScene({ scene: "image", image: await imageDataUrl(file) });
        setSceneError("");
    } catch (error) { setSceneError(error instanceof Error ? error.message : "Could not load image."); }
  };

  const peers = [...host.peers.values()].sort((a, b) => a.slot - b.slot);

  return <Workspace
    stage={<>
      <canvas ref={canvasRef} className={stageClass} aria-label="Camera tracking preview" />
      <video ref={videoRef} className="sr-only" muted playsInline />
      <canvas ref={processRef} className="sr-only" />
    </>}
  >
    <Panel>
      <Section title="Camera">
        <div className="flex min-w-0 items-center gap-2">
          <Select aria-label="Camera device" value={cameraId} onChange={(event) => { setCameraId(event.target.value); void camera.start(event.target.value); }}>
            <option value="">Default camera</option>
            {camera.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </Select>
          <Button variant={camera.stream ? "default" : "primary"} onClick={() => camera.stream ? camera.stop() : void camera.start(cameraId)}>
            {camera.stream ? "Stop" : "Start"}
          </Button>
        </div>
        {!camera.stream && <Muted>{camera.status}</Muted>}
        <Switch label="Mirror" checked={mirror} onChange={setMirror} />
      </Section>
      <Section title="Scene">
        <SceneGrid scenes={scenes} selected={host.scene.scene} onSelect={setScene} />
        {host.scene.scene === "image" && <ImagePicker onFile={(file) => void chooseImage(file)} />}
        {(host.scene.scene === "image" || host.scene.scene === "video") && <MediaLayoutControls layout={host.scene.layout} scene={host.scene} stage={host.stage} getDevices={() => [...host.peers.values()]} onChange={(patch) => host.setLayout(patch)} />}
        {host.scene.scene === "video" && <div className="flex min-w-0 items-center gap-2">
          <Input aria-label="Video URL" type="url" placeholder="https://example.com/video.mp4" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} />
          <Button onClick={() => { host.setScene({ scene: "video", videoUrl: videoUrl.trim() }); }}><IconVideo size={14} stroke={1.75} /> Apply</Button>
        </div>}
        {sceneError && <p className="text-xs text-red-300">{sceneError}</p>}
      </Section>
      <Section title={`Devices · ${peers.length}/5`}>
        {peers.map((peer) => <div className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-zinc-200 transition-colors hover:bg-white/5" key={peer.slot}>
          <DeviceSwatch hue={MARKER_HUES[peer.slot]} />
          <span className="flex-1">Child {peer.slot + 1}</span>
          <Badge tone={peer.pose ? "good" : "warn"}>{peer.markersHidden ? "Still" : peer.pose ? "Tracking" : "Not found"}</Badge>
          <IconButton title="Remove device" onClick={() => host.removePeer(peer.slot)}><IconTrash size={13} stroke={1.75} /></IconButton>
        </div>)}
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-800/30 p-3">
          <div className="size-24 shrink-0 rounded-md bg-white p-1.5 [&>svg]:size-full" aria-label="QR code to join" role="img" dangerouslySetInnerHTML={{ __html: joinQr(joinUrl) }} />
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-400">Code</span>
              <Badge tone={pairing.status === "ready" ? "good" : pairing.status === "offline" ? "bad" : "warn"}>
                {pairing.status === "ready" ? "Online" : pairing.status === "offline" ? "Offline" : "Connecting"}
              </Badge>
            </div>
            <div className="font-mono text-2xl font-semibold tracking-widest text-zinc-50" data-testid="host-code">{pairing.code}</div>
            <Button onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</Button>
          </div>
        </div>
        <Switch label="Keep last position when lost" checked={keepPose} onChange={setKeepPose} />
        <a className={buttonClass("default", "w-full")} href="/child" target="_blank" rel="noreferrer">Open child here</a>
      </Section>
      <Disclosure title="Tuning">
        <Slider label="Smoothing" min={0.1} max={1} step={0.05} value={host.options.smooth} format={(n) => n.toFixed(2)} onChange={(smooth) => { host.options.smooth = smooth; }} />
        <Slider label="Loss hold" min={100} max={2000} step={50} value={host.options.holdMs} format={(n) => `${n}ms`} onChange={(holdMs) => { host.options.holdMs = holdMs; }} />
        <Switch label="Show candidates" checked={showCandidates} onChange={setShowCandidates} />
      </Disclosure>
    </Panel>
  </Workspace>;
}
