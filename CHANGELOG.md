# Changelog

All notable changes to EdgeFirst WebUI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
