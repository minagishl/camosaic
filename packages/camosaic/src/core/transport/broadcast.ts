import { isWireMessage } from "./messages";
import type { CamosaicHost } from "../tracking/host";
import type { Link, WireMessage } from "../types";

const CHANNEL_NAME = "camosaic";

export function startBroadcastHost(host: CamosaicHost): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const clients = new Map<string, number>();
  channel.addEventListener("message", (event: MessageEvent) => {
    const raw = event.data as Record<string, unknown> | null;
    const clientId = raw?.from;
    if (typeof clientId !== "string" || !isWireMessage(raw)) return;
    const data = raw as Record<string, unknown> & WireMessage;
    const slot = clients.get(clientId);
    if (slot !== undefined && host.peers.has(slot)) {
      host.handle(slot, data);
      return;
    }
    if (data.t !== "join") return;
    const link: Link = {
      kind: "bc",
      send: (message) => channel.postMessage({ ...message, to: clientId }),
    };
    const assigned = host.addPeer(link);
    if (assigned >= 0) clients.set(clientId, assigned);
  });
  return () => {
    channel.close();
    for (const slot of clients.values()) host.removePeer(slot);
    clients.clear();
  };
}

export interface BroadcastClient {
  send(message: WireMessage): void;
  close(): void;
}

export function createBroadcastClient(onMessage: (message: WireMessage) => void, id = Math.random().toString(36).slice(2)): BroadcastClient | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (data?.to === id && isWireMessage(data)) onMessage(data);
  });
  return {
    send: (message) => channel.postMessage({ ...message, from: id }),
    close: () => channel.close(),
  };
}
