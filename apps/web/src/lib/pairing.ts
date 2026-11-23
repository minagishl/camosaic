import Peer, { type DataConnection, type PeerOptions } from "peerjs";
import { useEffect, useState } from "react";
import { deserializeMessage, serializeMessage, type CamosaicHost, type Link } from "camosaic";

/** Characters without look-alikes (no 0/O, 1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

const peerId = (code: string) => `camosaic-${code.toLowerCase()}`;

/** Defaults to the public PeerJS signaling server; point these at your own with VITE_PEER_*. */
function peerOptions(): PeerOptions {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (!host) return {};
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
    path: (import.meta.env.VITE_PEER_PATH as string | undefined) ?? "/",
    secure: import.meta.env.VITE_PEER_SECURE === "true",
  };
}

function toLink(connection: DataConnection): Link {
  const queue: Parameters<NonNullable<Link["onmessage"]>>[0][] = [];
  const link: Link = {
    kind: "rtc",
    send: (message) => { if (connection.open) connection.send(serializeMessage(message)); },
    close: () => connection.close(),
  };
  connection.on("data", (data) => {
    try {
      const message = deserializeMessage(String(data));
      if (link.onmessage) link.onmessage(message);
      else queue.push(message);
    } catch { /* Ignore malformed messages. */ }
  });
  // Messages that arrive before the consumer attaches `onmessage` are replayed right after.
  queueMicrotask(function flush() {
    if (!link.onmessage) { if (connection.open) setTimeout(flush, 0); return; }
    for (const message of queue.splice(0)) link.onmessage(message);
  });
  return link;
}

export type HostPairingStatus = "connecting" | "ready" | "offline";

const STORAGE_KEY = "camosaic-host-code";

function initialCode(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && saved.length === CODE_LENGTH) return saved;
    const fresh = makeCode();
    sessionStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch { return makeCode(); }
}

/** Opens a room on the signaling server so children can join with a code, a link or a QR code. */
export function useHostPairing(host: CamosaicHost | null): { code: string; status: HostPairingStatus } {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<HostPairingStatus>("connecting");

  useEffect(() => {
    if (!host) return;
    let disposed = false;
    let retries = 0;
    let timer = 0;
    let peer: Peer;
    const open = () => {
      peer = new Peer(peerId(code), peerOptions());
      peer.on("open", () => { retries = 0; setStatus("ready"); });
      peer.on("disconnected", () => { if (!disposed) { setStatus("connecting"); peer.reconnect(); } });
      peer.on("error", (error) => {
        if (disposed) return;
        if (error.type === "unavailable-id") {
          // The previous registration may still be expiring (reload, StrictMode); retry, then pick a new code.
          peer.destroy();
          if (retries++ < 4) { timer = window.setTimeout(open, 700); return; }
          const fresh = makeCode();
          try { sessionStorage.setItem(STORAGE_KEY, fresh); } catch { /* Storage is optional. */ }
          setCode(fresh);
          return;
        }
        setStatus("offline");
      });
      peer.on("connection", (connection) => {
        connection.on("open", () => {
          const link = toLink(connection);
          const slot = host.addPeer(link);
          if (slot < 0) { connection.close(); return; }
          link.onmessage = (message) => host.handle(slot, message);
          connection.on("close", () => host.removePeer(slot));
        });
      });
    };
    open();
    return () => { disposed = true; window.clearTimeout(timer); peer.destroy(); };
  }, [host, code]);

  return { code, status };
}

export interface ChildPairing {
  close(): void;
}

/** Joins a host's room. `onLink` fires once the connection is open; `onClose` when it ends or fails. */
export function connectToHost(
  rawCode: string,
  handlers: { onLink(link: Link): void; onClose(reason?: string): void },
): ChildPairing {
  const code = normalizeCode(rawCode);
  const peer = new Peer(peerOptions());
  let closed = false;
  const finish = (reason?: string) => {
    if (closed) return;
    closed = true;
    peer.destroy();
    handlers.onClose(reason);
  };
  peer.on("error", (error) => finish(error.type === "peer-unavailable" ? "No host found for this code." : "Could not reach the signaling server."));
  peer.on("open", () => {
    const connection = peer.connect(peerId(code), { reliable: true });
    const timeout = window.setTimeout(() => finish("The host did not answer."), 15_000);
    connection.on("open", () => { window.clearTimeout(timeout); handlers.onLink(toLink(connection)); });
    connection.on("close", () => finish());
    connection.on("error", () => finish("Connection failed."));
  });
  return { close: () => { closed = true; peer.destroy(); } };
}
