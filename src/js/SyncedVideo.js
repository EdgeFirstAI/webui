// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import FrameSync from './FrameSync.js'
import PlayoutClock from './PlayoutClock.js'

const FALLBACK_CAPACITY = 30
const TILE_CAPACITY = 12

/**
 * Camera video whose displayed frame is chosen by stamp-aware playout.
 * Overlays select their samples against `displayedStampMs`.
 *
 * `onTexture(texture)` is called with the fallback texture and again when
 * the 4K tile texture replaces it. `onFrame()` is called for every decoded
 * frame. `tick()` draws the frame that is due, if any, and returns the
 * displayed stamp.
 */
export default function createSyncedVideo({ onTexture, onFrame, capacity = FALLBACK_CAPACITY } = {}) {
    const clock = new PlayoutClock()
    let sync = new FrameSync({ clock, capacity })
    const manager = new SmartVideoManager()
    let texture = null
    let ctx = null
    let displayedStampMs = null

    manager.onUpgrade = (tileTexture) => {
        sync.reset()
        sync = new FrameSync({ clock, capacity: Math.min(capacity, TILE_CAPACITY) })
        ctx = null
        const old = texture
        texture = tileTexture
        if (onTexture) onTexture(texture)
        if (old && old !== tileTexture) old.dispose()
    }
    manager.onMergedFrame = (stampMs, bitmap) => {
        if (onFrame) onFrame()
        sync.pushFrame(stampMs, bitmap)
    }

    const capture = (url, w, h, fps, cb) => h264Stream(url, w, h, fps, cb, true)
    manager.init((timing) => {
        // Tile bitmaps belong to the TileAssembler; merged frames arrive via onMergedFrame.
        if (timing.mode === 'tiles') return
        if (manager.mode === 'tiles') {
            if (timing.bitmap) timing.bitmap.close()
            return
        }
        if (onFrame) onFrame()
        if (timing.bitmap) sync.pushFrame(timing.stampMs, timing.bitmap, timing.arrivalMs)
        if (timing.mode && !manager.loggedMode) {
            console.log('Video Mode: H.264 Fallback')
            manager.loggedMode = true
        }
    }, h264Stream, capture).then((tex) => {
        if (texture) return
        texture = tex
        if (onTexture) onTexture(texture)
    }).catch((err) => console.error('SyncedVideo: failed to start video:', err))

    function tick(nowMs = performance.now()) {
        const frame = sync.release(nowMs)
        if (!frame) return displayedStampMs
        if (!texture) {
            frame.bitmap.close()
            return displayedStampMs
        }
        const canvas = texture.image
        if (!ctx) ctx = canvas.getContext('2d')
        if (canvas.width !== frame.bitmap.width || canvas.height !== frame.bitmap.height) {
            canvas.width = frame.bitmap.width
            canvas.height = frame.bitmap.height
        }
        ctx.drawImage(frame.bitmap, 0, 0)
        frame.bitmap.close()
        texture.needsUpdate = true
        displayedStampMs = frame.stampMs
        return displayedStampMs
    }

    /**
     * Publish the overlay selections for the displayed frame on
     * `window.overlaySync` and return the playout statistics.
     * `selections` maps an overlay name to its selected StampBuffer entry
     * (or null); each becomes `<name>DeltaMs` = displayed - selected stamp.
     */
    function reportSync(selections = {}, nowMs = performance.now()) {
        const stats = clock.stats('camera', nowMs)
        const report = {
            displayedStampMs,
            delayMs: stats.delayMs,
            streams: stats.streams,
        }
        for (const [name, entry] of Object.entries(selections)) {
            report[`${name}DeltaMs`] = entry && displayedStampMs != null
                ? displayedStampMs - entry.stampMs
                : null
        }
        window.overlaySync = report
        return stats
    }

    return {
        clock,
        get sync() { return sync },
        tick,
        reportSync,
        get displayedStampMs() { return displayedStampMs },
    }
}
