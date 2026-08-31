# Changelog

All notable changes to EdgeFirst WebUI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.2.0] - 2026-08-31

### Changed
- Camera config Mirror dropdown defaults to **Both** (vflip+hflip) for the
  upside-down Maivin/Raivin sensor mount.
- Fusion config default radar input topic is `radar/clusters` (no `rt/`
  prefix), matching the hostname-namespaced Zenoh keys from EDGEAI-1396.
  Browser WebSocket URLs stay under `/api/rt/…`; WebSRV maps that HTTP path
  to the bare application key.

## [4.1.1] - 2026-05-25

### Changed

- Migrated `combined.js` and `segmentation.js` from the legacy split `/detect/boxes2d/` + `/detect/mask/` topics to the unified `/model/output/` `Model.msg` published by the EdgeFirst `model` service
- Extracted the camera page's shader-based segmentation overlay into a reusable `segOverlay.js` module that handles both instance (`boxed=true`) and semantic masks
- `combined.js` falls back to `Box.distance` / `Box.speed` (populated by the fusion service in the unified Model.msg) when radar projection data is unavailable
- MCAP recorder config now records `/model/output` in place of `/model/boxes2d` and `/model/mask_compressed`

### Removed

- Legacy parsers `boxes.js` (`Detect.msg`) and `mask.js` (compressed semantic-tensor mask) — superseded by `model.js` parsing the unified `Model.msg`
- `ProjectedMask.js` THREE.js material — replaced by the shader in `segOverlay.js`
- `fzstd.js` zstd decoder — masks are now uncompressed, with compression handled by the WebSocket transport layer
- Orphaned `module.js` WASM/zstd codec shim
- Defensive zstd-encoding throw in `model.js` (the encoding field is always empty in the new schema)

## [4.1.0] - 2026-05-25

### Added

- TemporalSync module for camera-model frame synchronization with an ImageBitmap ring buffer, EMA-based latency estimation, and adaptive buffer sizing
- Camera page integration of TemporalSync to align decoded video frames with model overlays via ROS timestamp correlation
- Temporal sync stats HUD on camera page showing model latency, throughput, and buffer depth (`data-testid="camera-sync-stats"`)
- `onMergedFrame` callback and latest ROS timestamp tracking in SmartVideoManager for tile-mode temporal sync
- Separate `fallbackH264StreamFunc` parameter in `SmartVideoManager.init()` so tile and fallback streams can use different decode pipelines
- `captureFrames` mode and ROS timestamp passthrough (`rosTimeSec`, `rosTimeNsec`) in `stream.js` for ImageBitmap-based frame capture

### Fixed

- Blank tile-mode composites during TemporalSync integration — tiles continue to use canvas-drawing `h264Stream` while only the fallback stream uses `captureFrames`
- ImageBitmap leak in TemporalSync when `releaseCallback` is null (both uncalibrated passthrough and calibrated release paths now close bitmaps)

## [4.0.1] - 2026-03-12

### Fixed

- Replaced hardcoded class 0 = background with dynamic detection via ModelInfo `/model/info/` topic
- Segmentation mask class indices now align 1:1 with bounding box labels (no off-by-one offset)
- LiDAR vision_class mode no longer skips or grays out class 0 unconditionally

### Added

- "Draw Background" toggle on camera and LiDAR pages (hidden by default, shown when background detected)
- ModelInfo singleton subscribes to `/api/rt/model/info/` for label-aware background detection
- Implicit background detection via output_shape class dimension exceeding label count

## [4.0.0] - 2026-03-11

### Added

- Camera page overlay controls for segmentation, bounding boxes, and LiDAR projection
- Model output CDR parser for bounding boxes and instance segmentation masks
- LiDAR cluster noise/ground filter toggles
- Track ID and instance ID colour modes for LiDAR point clouds
- Shared PointCloud2 parser with fusion topic support and dynamic colour modes
- Camera card on home page with missing device config handling
- GitHub Actions release workflow for automated archive and release notes
- Copilot instructions with architecture overview and Playwright testing guide

### Changed

- **Breaking:** Replaced MAIVIN/RAIVIN device-type checks with dynamic service-enabled gating across dashboard, settings, recorder, and status pages
- Unified segmentation into single shader-based toggle
- Smoothstep confidence threshold (0.50–0.65) for segmentation mask anti-aliasing
- Video stream starts immediately without tile probe delay

### Removed

- **Breaking:** Obsolete config pages (detect, segment, webui, vpkui)
- Device-type based service filtering — all services now shown regardless of platform

### Fixed

- Left-right mirroring in 3D LiDAR point cloud view
- Rendering frustum culling issues on camera page
- Correct `rt/model/` topic paths for bounding boxes and segmentation masks
- Vision class colour mode bugs in LiDAR viewer

## [3.8.0] - 2026-02-26

### Added

- Dedicated `/lidar` 3D point cloud viewer with Four colour modes: Fixed, Distance, Cluster, Vision Class
- Theme-aware point cloud rendering (turbo colourmap dark, boosted contrast light)
- "LiDAR Unavailable" overlay when `lidarpub` is enabled but not streaming data
- Fusion warning banner when Cluster or Vision Class mode lacks upstream data
- `data-testid` attributes on LiDAR page elements for automated testing

### Changed

- LiDAR card on home page now shown when `lidarpub` is enabled (configured) rather than only when running
- Home page cards reactively update when service statuses change
- Updated TESTING.md with `/lidar` routes, test IDs, and colour mode documentation

### Removed

- `/combined_lidar` multi-panel view replaced by focused `/lidar` viewer

## [3.7.0] - 2026-02-05

### Added

- ThemeManager for light/dark/auto theme switching with system preference detection
- CSS custom properties system for consistent theming across all pages
- Theme-aware widget components with unified styling
- Neural mesh animated background for dark mode
- Test IDs (`data-testid` attributes) on UI elements for test automation
- TESTING.md with manual testing workflows and Selenium/Playwright examples

### Changed

- Standardized all UI components to use CSS variables instead of hardcoded colors
- Simplified ARCHITECTURE.md with mermaid diagrams, removed implementation details
- Updated README.md with clear project overview and WebSRV relationship
- Improved navbar with theme toggle button and consistent styling
- Enhanced MCAP dialog styling for dark mode compatibility

### Fixed

- Dark mode styling consistency across all pages
- NeuralMesh z-index layering issues
- Widget card hover states and visual feedback

## [3.6.1] - 2026-02-03

### Changed

- Updated license from AGPL-3.0 to Apache-2.0
- Added SPDX license headers and copyright notices to all source files

## [3.6.0] - 2026-02-03

### Added

- EdgeFirst Studio integration UI for MCAP uploads
- MCAP upload to EdgeFirst Studio with real-time progress tracking
- Authentication flow for EdgeFirst Studio (login/logout)
- Upload status indicators and cancellation support

### Changed

- Applied EdgeFirst branding refresh
- Improved XSS protection with consistent sanitization
- Better port handling and validation

### Fixed

- Studio integration auth status and logout functionality
- Upload completion detection
- AGTG uploading improvements

## [3.5.5] - 2025-12-15

### Fixed

- Standardized renderOrder for mask overlays with depthWrite disabled

## [3.5.4] - 2025-12-15

### Fixed

- Corrected renderOrder to ensure mask is always drawn above video

## [3.5.3] - 2025-09-26

### Changed

- Updated /fusion/targets to /fusion/radar and /fusion/lidar endpoints

## [3.5.2] - 2025-09-22

### Fixed

- Model filename display when names contain spaces
- Added fallback to h264 when tiles are not present

## [3.5.1] - 2025-08-06

### Fixed

- Various bug fixes and improvements
