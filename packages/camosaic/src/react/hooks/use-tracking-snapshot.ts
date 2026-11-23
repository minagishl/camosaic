import { useEffect, useState } from "react";
import type { CamosaicHost } from "../../core/tracking/host";

/** A deliberately low-rate UI snapshot; camera frame updates stay outside React. */
export function useTrackingSnapshot(host: CamosaicHost | null, intervalMs = 250): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => setRevision((value) => value + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [host, intervalMs]);
  return revision;
}
