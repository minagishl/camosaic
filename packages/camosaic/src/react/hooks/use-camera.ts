import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraDevice {
  deviceId: string;
  label: string;
}
export interface CameraState {
  devices: CameraDevice[];
  stream: MediaStream | null;
  status: string;
  refresh(): Promise<void>;
  start(deviceId?: string): Promise<MediaStream | null>;
  stop(): void;
}

export function useCamera(): CameraState {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Stopped");
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);

  const listDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === "videoinput").map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      })));
    } catch {
      setDevices([]);
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setStatus("Stopped");
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    if (!window.isSecureContext) {
      setStatus("Camera access requires HTTPS or localhost.");
      return null;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera access is not supported by this browser.");
      return null;
    }
    stop();
    const generation = generationRef.current;
    try {
      const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (deviceId) video.deviceId = { exact: deviceId };
      const next = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (generation !== generationRef.current) {
        next.getTracks().forEach((track) => track.stop());
        return null;
      }
      streamRef.current = next;
      setStream(next);
      const track = next.getVideoTracks()[0];
      const settings = track?.getSettings();
      setStatus(`Running${settings?.width && settings.height ? ` · ${settings.width}×${settings.height}` : ""}`);
      await listDevices();
      return next;
    } catch (error) {
      setStatus(`Could not start camera: ${error instanceof DOMException ? error.name : "Unknown error"}`);
      return null;
    }
  }, [listDevices, stop]);

  useEffect(() => {
    void listDevices();
    return () => {
      generationRef.current++;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [listDevices]);

  return { devices, stream, status, refresh: listDevices, start, stop };
}
