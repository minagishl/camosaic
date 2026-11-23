# Camosaic

**Turn multiple screens into one canvas with camera-based tracking.**

Camosaic is a browser-based application and a reusable TypeScript library. A host camera detects three AprilTags (tag36h11) at the corners of on up to five child displays, estimates each display's position and orientation, and sends the matching portion of a shared scene to each screen. Tracking and rendering run locally in the browser; no application backend or account is required.

## Choose how to use Camosaic

- **Use the web application:** start the host and child interfaces from `apps/web`. Same-origin tabs connect automatically; other devices can be paired manually.
- **Use the npm library:** install the single package, `camosaic`, to embed marker detection, pose tracking, synchronization, scene rendering, transport, or React integrations in your own app.

## Workspace

```text
apps/web/                 React + TypeScript application
packages/camosaic/        The sole publishable npm package
  src/core/               Framework-independent tracking and rendering
  src/react/              React hooks and canvas integration
screen-tracker.html       Original functional reference
```

The root and web app are private pnpm projects. The core has no React, Zustand, Tailwind, or app dependencies. React is a peer dependency of `camosaic` because its root and `camosaic/react` exports include hooks and components.

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm 11
- A modern browser; camera capture requires HTTPS or `localhost`

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` builds the library first and starts Vite at `http://localhost:5173`. The browser app has four routes:

- `/` — overview
- `/host` — camera, scene, device, tracking, and manual pairing controls
- `/child` — fullscreen marker display and shared-canvas renderer
- `/lab` — draggable virtual devices processed by the production detector

The host and child can communicate in same-origin tabs with `BroadcastChannel`. The child can enter fullscreen and request the Screen Wake Lock API where supported. Manual pairing exchanges encoded WebRTC offer/answer strings without a signaling server.

## Library installation and API

```bash
pnpm add camosaic
```

Core and React APIs can be imported from the package root or the optional same-package subpaths:

```ts
import { createHost, detectTags, poseFrom, createChild } from "camosaic/core";
import { CamosaicCanvas, useCamera, useCamosaic } from "camosaic/react";
```

The package root re-exports both:

```tsx
import { createHost, detectTags, useCamosaic, useCamera } from "camosaic";
```

Example: run the reusable detector against image data:

```ts
import { createVisionWork, detectTags } from "camosaic/core";

const work = createVisionWork(frame.width, frame.height);
const markers = detectTags(frame, [{ slot: 0, w: 360, h: 640 }], {
  tol: 16,
  smin: 0.45,
  vmin: 0.35,
  minArea: 40,
  smooth: 0.6,
  holdMs: 500,
}, work);
```

Example: own a host and camera lifecycle in React:

```tsx
import { useEffect, useRef } from "react";
import { useCamera, useCamosaic } from "camosaic";

function Host() {
  const { host } = useCamosaic("host");
  const camera = useCamera();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = camera.stream;
  }, [camera.stream]);

  // Process video frames with host.track(ImageData) outside React state.
  return <video ref={video} muted playsInline />;
}
```

`createHost()` provides peer management, scene synchronization, configurable tracking defaults, `track(ImageData)`, and heartbeat cleanup. `createChild(send)` receives host messages and renders through `CamosaicCanvas` or its `render` method. `createOffer` and `acceptOffer` handle manual WebRTC signaling. See `packages/camosaic/README.md` for the API and transport details.

## Scenes and tracking

The six synchronized scenes are Grid, Gradient, Plasma, Clock, Image, and Video URL. Detection uses AprilTag tag36h11 markers (via js-aruco2): one tag at each of three corners of every child display, affine pose estimation, inverse canvas transforms, smoothing, and tracking-loss hold.

Defaults: up to five child slots, 1280px stage width, 1280px detection width, smoothing `0.6`, and `500ms` loss hold.

## Browser compatibility and limitations

- Camera capture requires a secure context and user permission.
- `BroadcastChannel`, Canvas 2D, and `requestAnimationFrame` are required for the main workflows. Camera processing falls back to frame-timed rendering when `requestVideoFrameCallback` is unavailable.
- Fullscreen and wake locking are optional and depend on browser support and user activation.
- Video scenes need a URL reachable by every child; cross-origin video policies may limit playback or seeking.
- Manual WebRTC uses no configured STUN/TURN servers. Host candidates are embedded in the exchanged codes, so direct connections generally require compatible network paths. Symmetric NATs, restrictive firewalls, or different networks can prevent connection. A TURN service would be needed for reliable relaying across those networks.
- Tracking quality depends on camera angle, focus, exposure, marker visibility, and display brightness. The supplied test lab validates the algorithm with synthetic input, not physical camera conditions.

## Build, test, and publish

```bash
pnpm build:lib
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
```

Unit tests are deterministic and do not require a camera. Playwright browser tests require its Chromium browser; install it with `pnpm exec playwright install chromium` when needed.

The library build emits ESM JavaScript and declarations. To inspect the npm artifact without publishing:

```bash
pnpm --filter camosaic pack
```

To publish intentionally, review the package name/version, run all verification commands, authenticate to npm, then run `pnpm --filter camosaic publish`. Publishing is never part of a build.

For Cloudflare Pages, configure the project root as the repository root, build command as `pnpm install --frozen-lockfile && pnpm build`, and output directory as `apps/web/dist`. The included `_redirects` file enables SPA route fallback.

## Status

Algorithmic unit coverage and the package build are verified in this repository. Physical camera quality, fullscreen behavior, wake-lock behavior, and real cross-network WebRTC connectivity depend on hardware and network conditions and are not asserted by synthetic tests.


## Connecting a child

Tabs of the same browser connect automatically. For another device, open `/host` and scan the QR code (or open the shared link, or type the six-character code on `/child`). Pairing uses PeerJS: by default the public PeerJS signaling server, or your own via `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH` and `VITE_PEER_SECURE`. Only the WebRTC handshake goes through it; scene and pose data flow directly between devices.

## Deploying to Cloudflare Workers

The web app is served as static assets from a Cloudflare Worker (`wrangler.jsonc`, custom domain `camosaic.dev`, single-page-app fallback).

```sh
pnpm exec wrangler login   # once
pnpm deploy                # builds the library and the app, then runs `wrangler deploy`
pnpm deploy:dry            # build and validate the config without uploading
```

The `camosaic.dev` zone must be on the same Cloudflare account; `wrangler deploy` then creates the custom-domain record and certificate.
