# camosaic

Camera-based tracking and shared-canvas synchronization for multiple screens.

## Install

```bash
pnpm add camosaic
```

React is a peer dependency for root imports and the React integration. For framework-independent deployments, import `camosaic/core`.

## Core API

```ts
import {
  createHost,
  createVisionWork,
  detectTags,
  poseFrom,
  applyPose,
  invertPose,
  createChild,
} from "camosaic/core";

const host = createHost();
const slot = host.addPeer(link, { w: 360, h: 640 });
const results = host.track(imageData, performance.now());
host.setScene({ scene: "grid" });
host.heartbeat();
```

`detectTags(frame)` accepts `ImageData`-compatible data and returns every Camosaic AprilTag it finds, each with its display slot, corner (0 = top-left, 1 = top-right, 2 = bottom-right) and center. Tag ids 0-14 encode `slot * 3 + corner`, so displays are identified by the tag itself, not by color. Defaults are smoothing `0.6`, a `500ms` loss hold, and `keepPose: false`; set `host.options.keepPose = true` to keep showing a display's last known position after tracking is lost. A host assigns up to five slots.

`createHost()` exposes the stage, peers, scene, and mutable `options` object. `track(frame, now?)` returns the detected tags and updates poses (pass `{ mirror: true }` when the preview is mirrored). `setLayout({ fit, scale, x, y })` resizes and moves the shared image or video (`fit` is `cover` or `contain`, `scale` 0.1-4, `x`/`y` from -1 to 1) without restarting video sync. Call `dispose()` when finished. Affine helpers use `[a, b, c, d, e, f]` canvas-transform order for inverse poses.

## React integration

```tsx
import { CamosaicCanvas, useCamera, useCamosaic } from "camosaic";

function ChildScreen() {
  const { child, connected } = useCamosaic("child");
  return child ? <CamosaicCanvas child={child} /> : null;
}
```

- `useCamera()` enumerates cameras, acquires and releases streams, and reports availability/errors.
- `useCamosaic("host" | "child")` owns a host or child controller and its same-origin BroadcastChannel lifecycle. It returns the controller, connection state, and `setTransport` for switching a child to a manual link.
- `useTrackingSnapshot(host, intervalMs?)` provides a low-rate UI refresh. It does not store camera frames.
- `CamosaicCanvas` manages resize and animation-frame cleanup for a child controller.

For camera processing, keep video frames and image data in refs/canvas contexts. Pass frames to `host.track()` from `requestVideoFrameCallback` or an animation-frame fallback rather than React state.

## Communication

The core provides BroadcastChannel helpers, validated message encoding/decoding, WebRTC DataChannel chunking/reassembly, and `createOffer` / `acceptOffer` for manual offer/answer exchange. No server is used for signaling. With `iceServers: []`, WebRTC cannot relay traffic through TURN; network topology may prevent connections between devices.

## Build and test

```bash
pnpm build
pnpm test
pnpm pack
```

Build output includes ESM at `dist/index.js`, `dist/core/index.js`, and `dist/react/index.js` plus TypeScript declarations. The package is not published automatically.
