# Copilot Instructions

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

EdgeFirst WebUI is a **static HTML/JavaScript application** (no build step, no bundler, no package.json) that provides real-time visualization for EdgeFirst Maivin and Raivin embedded AI platforms. It is served by the [WebSRV](https://github.com/EdgeFirstAI/websrv) Rust backend (typically found as a sibling directory at `../websrv`), which bridges Zenoh pub/sub to WebSocket streams.

WebSRV is a Rust native server built with `cargo-zigbuild` for cross-compilation. The typical deployment target is `aarch64-unknown-linux-gnu` (ARM64 Linux on Maivin/Raivin devices), buildable from any platform including macOS.

## Development Commands

```bash
# Lint (requires Node.js + npm dependencies installed)
npx eslint src/

# Deploy to device for testing (target has ~/webui cloned)
# No restart needed — WebSRV serves static files directly, changes are immediate
rsync -av src/ torizon@maivin.local:~/webui/src/

# No build step — all files in src/ are served directly as static assets
```

### Building WebSRV (sibling project at ../websrv)

WebSRV is a Rust server cross-compiled with cargo-zigbuild for ARM64 Linux targets:

```bash
cd ../websrv
cargo zigbuild --target aarch64-unknown-linux-gnu --release

# After deploying a new websrv binary, restart the service on the device
ssh torizon@maivin.local sudo systemctl restart websrv
```

## Architecture

### No Build Pipeline

All JavaScript is vanilla ES6 modules loaded via `<script type="module">`. Third-party libraries (Three.js, Leaflet, Zstandard WASM, Tailwind CSS) are vendored directly in `src/js/` and `src/css/`. There is no npm, no bundler, no transpilation.

### Data Flow: Zenoh → WebSocket → Browser

The WebSRV backend subscribes to Zenoh topics and bridges them to WebSocket endpoints. The browser connects to WebSocket URLs like `/api/rt/camera/h264` and receives **CDR-serialized binary messages** (ROS 2 Common Data Representation). The `Cdr.js` module deserializes these into typed arrays for rendering.

### Key Modules (src/js/)

| Module | Role |
|--------|------|
| `stream.js` | H.264 WebSocket → WebCodecs VideoDecoder → Three.js CanvasTexture pipeline. Handles reconnection with exponential backoff. |
| `SmartVideoManager.js` | Tiled 4K video: probes 4 tile endpoints, falls back to single stream, upgrades seamlessly via `onUpgrade` callback. Frame sync at 15fps. |
| `serviceCache.js` | Global `window.serviceCache` singleton. Polls `/api/services/status` every 5s, caches in localStorage, notifies listeners via callbacks. Use `isServiceEnabled(name)` / `isServiceRunning(name)` to gate UI features. |
| `status.js` | Navbar status indicators (Live/Degraded/Replay/Stopped). Recorder status polling. Service status dialog. |
| `navbar.js` | Shared navbar component injected via `createNavbar()`. Recording button, MCAP dialog, mode indicator, theme toggle. |
| `theme.js` | ThemeManager IIFE on `window.ThemeManager`. Handles light/dark/auto with CSS custom properties and localStorage persistence. |
| `Cdr.js` | CDR (Common Data Representation) deserializer for binary WebSocket messages from Zenoh. |
| `boxes.js` | 2D bounding box overlay rendering on Canvas. |
| `mask.js` / `ProjectedMask.js` | Segmentation mask decompression (Zstandard WASM) and WebGL overlay. |
| `lidar.js` | 3D LiDAR point cloud viewer using Three.js with orbit controls and multiple color modes. |
| `grid.js` | Radar point cloud viewer on a polar range/bearing grid with source, colour mode, and elevation controls. |
| `pointColors.js` | Shared colour helpers (Turbo, distance, cluster ID, diverging speed, theme-aware fixed) for the LiDAR and Radar viewers. |
| `pointcloud2.js` | ROS PointCloud2 message parser for LiDAR and radar data. |

### Service-Enabled Gating Pattern

UI elements (home page cards, settings cards, overlay options) are conditionally shown based on whether the backing EdgeFirst service is **enabled** (configured in systemd), not just running. Use `window.serviceCache.isServiceEnabled('serviceName')` — never hard-code MAIVIN/RAIVIN platform checks.

The canonical service list lives in `serviceCache.js` as `ALL_SERVICES`. Don't duplicate it in other files.

### REST API Endpoints (provided by WebSRV)

- `POST /api/services/status` — body: `{ services: [...] }`, returns status array
- `GET /api/replay/status` — returns replay state text
- `GET /api/recorder/status` — returns recorder state text
- `GET /api/rt/<topic>` — WebSocket upgrade for real-time Zenoh topics

### Rendering Stack (Camera Page)

Four composited layers, bottom to top:
1. **Video texture** — WebGL `ProjectedMaterial` on Three.js plane
2. **Segmentation overlay** — WebGL shader with Zstandard-decompressed mask
3. **Bounding boxes** — Canvas 2D overlay
4. **LiDAR points** — Canvas 2D projected overlay

### Segmentation Mask Data

Instance segmentation masks arrive as **sigmoid probabilities quantized to uint8** (0 = background, 255 = foreground) with `boxed: true` for per-instance ROI crops. The shaders apply `smoothstep(0.5, 0.65)` to threshold and anti-alias mask edges. The mask pipeline is: HAL `materialize_segmentations` → sigmoid → uint8 quantize → CDR → WebSocket → GPU texture → shader threshold.

### Test IDs

All interactive UI elements use `data-testid="<page>-<element>-<name>"` attributes (e.g., `camera-toggle-segmentation`, `lidar-color-mode`). Maintain this convention for new elements. Full reference in TESTING.md.

## Testing with Playwright on Device

The WebUI runs on physical devices with self-signed certificates. All UI elements have `data-testid` attributes for automated interaction — see TESTING.md for the full reference of available test IDs and Playwright examples.

### Browser Session Management

**Reuse a single browser context** — do not open new windows/contexts for each action. On the first navigation, create one context with `ignoreHTTPSErrors: true` (self-signed certs) and reuse it for all subsequent interactions:

```js
// First call — create context and navigate
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto('https://maivin.local/camera');

// Subsequent calls — reuse the same page
await page.goto('https://maivin.local/config/settings');
```

### Interacting with UI Elements

Use `data-testid` selectors to interact with page elements. Toggles and checkboxes are standard HTML inputs and can be clicked via Playwright's `click()`:

```js
await page.click('[data-testid="camera-toggle-segmentation"]');
await page.click('[data-testid="index-card-camera"]');
```

### Stream Timing

After navigating to a visualization page, wait ~5s for video/WebSocket streams to connect. After enabling overlays (segmentation, bounding boxes), wait ~5s for model data to arrive.

### Inspecting Live Data

The page's own `CdrReader` can be dynamically imported inside `page.evaluate()` to parse live WebSocket messages for debugging:

```js
await page.evaluate(async () => {
    const { CdrReader } = await import('/js/Cdr.js');
    // Open a WebSocket and parse CDR messages...
});
```

### Deploy Before Testing

`rsync -avz src torizon@<device>:webui/` — changes are served immediately, no restart needed.

## Conventions

- Copyright header on every source file: `// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.` + SPDX identifier
- Global state via `window.*` (e.g., `window.serviceCache`, `window.ThemeManager`, `window.isPlaying`)
- WebSocket URLs include `?compress=false` for H.264 streams (already compressed)
- Tailwind CSS classes used inline; custom styles in `src/css/theme.css` via CSS custom properties
- Changelog follows [Keep a Changelog](https://keepachangelog.com/) format in CHANGELOG.md
