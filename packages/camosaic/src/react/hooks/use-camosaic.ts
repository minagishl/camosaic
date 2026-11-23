import { useEffect, useMemo, useRef, useState } from "react";
import { createBroadcastClient, startBroadcastHost } from "../../core/transport/broadcast";
import { createChild, type CamosaicChild } from "../../core/synchronization/child";
import { createHost, type CamosaicHost } from "../../core/tracking/host";
import type { WireMessage } from "../../core/types";

export interface CamosaicSession {
  host: CamosaicHost | null;
  child: CamosaicChild | null;
  connected: boolean;
  setTransport(send: ((message: WireMessage) => void) | null): void;
}

/** Owns host/child controllers and same-origin BroadcastChannel lifecycle. */
export function useCamosaic(role: "host" | "child"): CamosaicSession {
  const host = useMemo(() => role === "host" ? createHost() : null, [role]);
  const sendRef = useRef<(message: WireMessage) => void>(() => undefined);
  const broadcastSendRef = useRef<(message: WireMessage) => void>(() => undefined);
  const child = useMemo(() => role === "child" ? createChild((message) => sendRef.current(message)) : null, [role]);
  const [connected, setConnected] = useState(false);
  const setTransport = (send: ((message: WireMessage) => void) | null) => {
    sendRef.current = send ?? broadcastSendRef.current;
  };

  useEffect(() => {
    if (host) {
      const stopBroadcast = startBroadcastHost(host);
      const heartbeat = window.setInterval(() => host.heartbeat(), 1000);
      return () => {
        window.clearInterval(heartbeat);
        stopBroadcast();
        host.dispose();
      };
    }
    if (!child) return;
    let broadcast = createBroadcastClient((message) => {
      child.receive(message);
      setConnected(child.connected);
    });
    broadcastSendRef.current = (message) => broadcast?.send(message);
    sendRef.current = broadcastSendRef.current;
    const interval = window.setInterval(() => {
      if (child.connected && performance.now() - child.lastReceivedAt > 4000) {
        child.connected = false;
        setConnected(false);
        child.onState?.();
      }
      if (child.connected) sendRef.current({ t: "ping" });
      else sendRef.current({ t: "join" });
    }, 1000);
    child.onState = () => setConnected(child.connected);
    return () => {
      window.clearInterval(interval);
      broadcast?.close();
      broadcast = null;
      sendRef.current = () => undefined;
      broadcastSendRef.current = () => undefined;
      child.dispose();
    };
  }, [host, child]);

  return { host, child, connected, setTransport };
}
