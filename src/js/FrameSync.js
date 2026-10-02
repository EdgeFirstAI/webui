// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DISCONTINUITY_MS } from './stamp.js'

/**
 * Holds decoded camera frames until the playout delay has passed, so the
 * overlays for a frame have arrived by the time it is shown. The released
 * frame's stamp is what overlays are selected against.
 *
 * Displayed stamps never go backwards: a frame at or before the last
 * released stamp is closed on arrival, unless it is more than
 * `DISCONTINUITY_MS` away, which is a clock step and starts over. So a
 * released frame up to `DISCONTINUITY_MS` ahead of the stream, or a real
 * backward step smaller than that, hides the following frames until the
 * stream passes the last shown stamp, for at most `DISCONTINUITY_MS`.
 */
export default class FrameSync {
    constructor({ clock, reference = 'camera', capacity = 30 }) {
        this.clock = clock
        this.reference = reference
        this.capacity = capacity
        this.frames = []
        this.lastReleasedMs = null
    }

    get depth() {
        return this.frames.length
    }

    /**
     * Queues a frame, or closes it if it is not newer than the last released
     * frame. If more than `capacity` frames are queued, which only happens
     * when `release()` is not called between pushes, the oldest is closed.
     */
    pushFrame(stampMs, bitmap, arrivalMs = performance.now()) {
        this.clock.observe(this.reference, stampMs, arrivalMs)
        const newest = this.frames[this.frames.length - 1]
        const last = this.lastReleasedMs
        if ((newest && Math.abs(stampMs - newest.stampMs) > DISCONTINUITY_MS)
            || (last !== null && Math.abs(stampMs - last) > DISCONTINUITY_MS)) {
            this.reset()
        } else if (last !== null && stampMs <= last) {
            bitmap.close()
            return
        }
        let i = this.frames.length
        while (i > 0 && this.frames[i - 1].stampMs > stampMs) i--
        this.frames.splice(i, 0, { stampMs, bitmap, arrivalMs })
        while (this.frames.length > this.capacity) this.frames.shift().bitmap.close()
    }

    /**
     * Releases the newest frame whose playout delay has passed and closes
     * the older due frames it supersedes. Frames not yet due stay queued,
     * except that a full queue always releases its oldest frame: when the
     * delay is longer than `capacity` frames span, the effective delay
     * shrinks to what the queue holds instead of frames being evicted
     * before they are due.
     * The caller owns the returned bitmap and must `close()` it.
     * @returns {{stampMs: number, bitmap: ImageBitmap} | null} null when no frame is due
     */
    release(nowMs = performance.now()) {
        const delay = this.clock.delayMs(this.reference, nowMs)
        let due = this.frames.length - this.capacity
        for (let i = 0; i < this.frames.length; i++) {
            if (nowMs - this.frames[i].arrivalMs >= delay) due = Math.max(due, i)
        }
        if (due < 0) return null
        const released = this.frames.splice(0, due + 1)
        const shown = released.pop()
        for (const f of released) f.bitmap.close()
        this.lastReleasedMs = shown.stampMs
        return { stampMs: shown.stampMs, bitmap: shown.bitmap }
    }

    reset() {
        for (const f of this.frames) f.bitmap.close()
        this.frames = []
        this.lastReleasedMs = null
    }
}
