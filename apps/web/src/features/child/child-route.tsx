import { useEffect, useRef, useState } from "react";
import { IconAdjustmentsHorizontal, IconBroadcast } from "@tabler/icons-react";
import { CamosaicCanvas, useCamosaic } from "camosaic";
import { Badge, Button, Input, Muted, Switch } from "../../components/ui";
import { CODE_LENGTH, connectToHost, normalizeCode, type ChildPairing } from "../../lib/pairing";

export function ChildRoute() {
  const { child, connected, setTransport } = useCamosaic("child");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [code, setCode] = useState(() => normalizeCode(new URLSearchParams(window.location.search).get("code") ?? ""));
  const [message, setMessage] = useState("");
  const [entered, setEntered] = useState(false);
  const [remote, setRemote] = useState(false);
  const [autoHide, setAutoHide] = useState(true);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pairingRef = useRef<ChildPairing | null>(null);

  useEffect(() => {
    const onVisibility = async () => {
      if (entered && document.visibilityState === "visible" && "wakeLock" in navigator) {
        try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch { /* Wake lock is optional. */ }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, [entered]);

  useEffect(() => () => pairingRef.current?.close(), []);

  // Report device motion so the tags can be hidden while the display stands still.
  useEffect(() => {
    if (!child) return;
    const onMotion = (event: DeviceMotionEvent) => {
      const { acceleration: a, rotationRate: r } = event;
      if (!a && !r) return; // Desktop browsers fire one empty event.
      const accel = a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : 0;
      const spin = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
      if (a?.x == null && r?.alpha == null) return;
      child.reportMotion(accel > 0.4 || spin > 8);
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [child]);

  useEffect(() => { if (child) child.autoHideMarkers = autoHide; }, [child, autoHide]);

  // Joins straight away when the page was opened from a link or QR code (`?code=`).
  useEffect(() => {
    if (!child || new URLSearchParams(window.location.search).get("code") === null || code.length !== CODE_LENGTH) return;
    join(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child]);

  if (!child) return null;

  const enableMotion = async () => {
    // iOS only delivers motion events after an explicit permission request from a user gesture.
    const request = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    try { await request?.call(DeviceMotionEvent); } catch { /* Motion stays unavailable; tags remain visible. */ }
  };

  const enterFullscreen = async () => {
    void enableMotion();
    setEntered(true);
    child.view.resume();
    try { await document.documentElement.requestFullscreen?.(); } catch { /* Continue without fullscreen. */ }
    if ("wakeLock" in navigator) {
      try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch { /* Wake lock is optional. */ }
    }
    setSettingsOpen(false);
  };

  const join = (value: string) => {
    if (normalizeCode(value).length !== CODE_LENGTH) return;
    pairingRef.current?.close();
    setMessage("Connecting…");
    pairingRef.current = connectToHost(value, {
      onLink: (link) => {
        link.onmessage = (incoming) => child.receive(incoming);
        setTransport((outgoing) => link.send(outgoing));
        setRemote(true);
        setMessage("");
      },
      onClose: (reason) => {
        setTransport(null);
        setRemote(false);
        child.connected = false;
        child.onState?.();
        setMessage(reason ?? "Disconnected.");
      },
    });
  };

  const leave = () => {
    pairingRef.current?.close();
    pairingRef.current = null;
    setTransport(null);
    setRemote(false);
    child.connected = false;
    child.onState?.();
    setMessage("");
  };

  return <div className="fixed inset-0 overflow-hidden bg-black">
    <CamosaicCanvas child={child} className="block size-full" aria-label="Shared canvas child display" />
    <button
      className={`fixed top-3 left-1/2 z-10 grid h-8 w-10 -translate-x-1/2 place-items-center rounded border border-white/10 bg-zinc-900/80 text-zinc-200 transition-opacity hover:opacity-90 ${settingsOpen ? "opacity-90" : "opacity-25"}`}
      onClick={() => setSettingsOpen((value) => !value)}
      aria-label="Toggle settings"
    ><IconAdjustmentsHorizontal size={16} stroke={1.75} /></button>
    {settingsOpen && <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="grid max-h-full w-full max-w-md gap-4 overflow-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-50">Child screen</h1>
          <Badge tone={connected ? "good" : "warn"}><IconBroadcast size={12} stroke={1.75} /> {connected ? `Connected · ${child.slot + 1}` : "Searching for host"}</Badge>
        </div>
        <Button variant="primary" onClick={() => void enterFullscreen()}>Enter fullscreen</Button>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); join(code); }}>
          <Input
            aria-label="Host code"
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            placeholder="Host code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-widest uppercase"
          />
          {remote
            ? <Button type="button" onClick={leave}>Leave</Button>
            : <Button type="submit" disabled={code.length !== CODE_LENGTH}>Connect</Button>}
        </form>
        <Switch label="Hide tags when the device stands still" checked={autoHide} onChange={setAutoHide} />
        {message && <Muted aria-live="polite">{message}</Muted>}
      </div>
    </div>}
  </div>;
}
