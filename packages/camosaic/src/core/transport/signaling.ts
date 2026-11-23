import { attachDataChannel } from "./chunks";
import type { Link } from "../types";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  return new Uint8Array(await new Response(blob.stream().pipeThrough(stream as TransformStream)).arrayBuffer());
}

export async function encodeSignal(description: RTCSessionDescriptionInit): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(description));
  if (typeof CompressionStream === "undefined") return `r${toBase64(raw)}`;
  try { return `z${toBase64(await transform(raw, new CompressionStream("deflate-raw")))}`; }
  catch { return `r${toBase64(raw)}`; }
}

export async function decodeSignal(code: string): Promise<RTCSessionDescriptionInit> {
  const normalized = code.trim();
  if (!["r", "z"].includes(normalized[0]) || normalized.length < 2) throw new Error("Signal code is empty or has an unsupported format.");
  const bytes = fromBase64(normalized.slice(1));
  const raw = normalized[0] === "z"
    ? await transform(bytes, new DecompressionStream("deflate-raw"))
    : bytes;
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (!value || typeof value !== "object" || !("type" in value) || !("sdp" in value)) throw new Error("Signal code does not contain an SDP description.");
  return value as RTCSessionDescriptionInit;
}

function waitForIceGathering(pc: RTCPeerConnection, timeout = 3000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") finish(); };
    pc.addEventListener("icegatheringstatechange", check);
    timer = window.setTimeout(finish, timeout);
  });
}

export async function createOffer(): Promise<{
  code: string;
  accept(answer: string): Promise<void>;
  onLink(callback: (link: Link, channel: RTCDataChannel) => void): void;
  close(): void;
}> {
  if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is not supported by this browser.");
  const pc = new RTCPeerConnection({ iceServers: [] });
  const channel = pc.createDataChannel("camosaic");
  let callback: ((link: Link, channel: RTCDataChannel) => void) | undefined;
  channel.addEventListener("open", () => callback?.(attachDataChannel(channel), channel));
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIceGathering(pc);
  if (!pc.localDescription) throw new Error("The browser did not create a local offer.");
  return {
    code: await encodeSignal(pc.localDescription.toJSON()),
    accept: async (answer) => pc.setRemoteDescription(await decodeSignal(answer)),
    onLink: (fn) => { callback = fn; },
    close: () => pc.close(),
  };
}

export async function acceptOffer(code: string): Promise<{ answer: string; onLink(callback: (link: Link, channel: RTCDataChannel) => void): void; close(): void }> {
  if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is not supported by this browser.");
  const pc = new RTCPeerConnection({ iceServers: [] });
  let callback: ((link: Link, channel: RTCDataChannel) => void) | undefined;
  let pendingChannel: RTCDataChannel | null = null;
  let notified = false;
  const notify = () => {
    if (!pendingChannel || !callback || notified) return;
    notified = true;
    callback(attachDataChannel(pendingChannel), pendingChannel);
  };
  pc.addEventListener("datachannel", (event) => {
    pendingChannel = event.channel;
    if (pendingChannel.readyState === "open") notify();
    else pendingChannel.addEventListener("open", notify, { once: true });
  });
  await pc.setRemoteDescription(await decodeSignal(code));
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIceGathering(pc);
  if (!pc.localDescription) throw new Error("The browser did not create a local answer.");
  return {
    answer: await encodeSignal(pc.localDescription.toJSON()),
    onLink: (fn) => { callback = fn; notify(); },
    close: () => pc.close(),
  };
}
