// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DISCONTINUITY_MS } from './stamp.js'

const DEFAULT_SENSOR_TOLERANCE_MS = 60
const SENSOR_TOLERANCE_MARGIN_MS = 10
const HOLD_MIN_MS = 50
const HOLD_MAX_MS = 250

/** Retained past the reach of the displayed frame. */
export const SENSOR_RETAIN_MARGIN_MS = 1000
/** Radar targets (about 18 Hz, a few kB each): about 10.5 s of horizon. */
export const RADAR_BUFFER_CAPACITY = 192
/** LiDAR clouds (10 Hz, up to a few MB each): about 6.3 s of horizon. */
export const LIDAR_BUFFER_CAPACITY = 64
/** Model results (about 10 Hz): about 6.3 s of horizon. */
export const MODEL_BUFFER_CAPACITY = 64

/**
 * Samples of one stream ordered by acquisition stamp, at most `capacity`.
 * Sensor buffers also drop samples the displayed frame can no longer reach
 * (see selectSensor), so they hold about as much time as the display lags.
 */
export default class StampBuffer {
    constructor({ capacity = 32 } = {}) {
        this.capacity = capacity
        this.entries = []
        this.horizonMisses = 0
    }

    get size() {
        return this.entries.length
    }

    push(stampMs, value) {
        const newest = this.entries[this.entries.length - 1]
        if (newest && Math.abs(stampMs - newest.stampMs) > DISCONTINUITY_MS) {
            this.clear()
        }
        let i = this.entries.length
        while (i > 0 && this.entries[i - 1].stampMs > stampMs) i--
        if (i > 0 && this.entries[i - 1].stampMs === stampMs) {
            this.entries[i - 1].value = value
            return
        }
        this.entries.splice(i, 0, { stampMs, value })
        while (this.entries.length > this.capacity) this.entries.shift()
    }

    exact(stampMs) {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const e = this.entries[i]
            if (e.stampMs === stampMs) return e
            if (e.stampMs < stampMs) return null
        }
        return null
    }

    atOrBefore(stampMs, maxAgeMs) {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const e = this.entries[i]
            if (e.stampMs <= stampMs) {
                return stampMs - e.stampMs <= maxAgeMs ? e : null
            }
        }
        return null
    }

    nearest(stampMs, toleranceMs) {
        let best = null
        for (const e of this.entries) {
            const d = Math.abs(e.stampMs - stampMs)
            if (d <= toleranceMs && (!best || d < Math.abs(best.stampMs - stampMs))) best = e
        }
        return best
    }

    /** Drop samples stamped before `stampMs`. */
    dropBefore(stampMs) {
        let n = 0
        while (n < this.entries.length && this.entries[n].stampMs < stampMs) n++
        if (n > 0) this.entries.splice(0, n)
    }

    periodMs() {
        if (this.entries.length < 2) return null
        const deltas = []
        for (let i = 1; i < this.entries.length; i++) {
            deltas.push(this.entries[i].stampMs - this.entries[i - 1].stampMs)
        }
        deltas.sort((a, b) => a - b)
        return deltas[Math.floor(deltas.length / 2)]
    }

    clear() {
        this.entries = []
    }
}

/**
 * Select a camera-derived result (model output) for the displayed frame:
 * the result for that exact frame, else the newest earlier result held for
 * up to two model periods. Never returns a result newer than the frame.
 * Results older than the frame's reach are dropped, as in selectSensor.
 */
export function selectDerived(buffer, frameStampMs) {
    if (frameStampMs == null) return null
    buffer.dropBefore(frameStampMs - HOLD_MAX_MS - SENSOR_RETAIN_MARGIN_MS)
    const exact = buffer.exact(frameStampMs)
    if (exact) return exact
    const period = buffer.periodMs()
    const hold = Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, period ? 2 * period : HOLD_MAX_MS))
    return buffer.atOrBefore(frameStampMs, hold)
}

/** Half a sensor period plus margin; independent sensors never share a stamp. */
export function sensorToleranceMs(buffer) {
    const period = buffer.periodMs()
    return period ? period / 2 + SENSOR_TOLERANCE_MARGIN_MS : DEFAULT_SENSOR_TOLERANCE_MS
}

/**
 * Select the independent-sensor sample (LiDAR, radar) nearest the frame.
 * Displayed stamps only move forward, so samples older than the frame's
 * reach (tolerance plus SENSOR_RETAIN_MARGIN_MS) are dropped; retention then
 * follows the display lag, bounded by the buffer capacity. A frame older
 * than everything a full buffer holds counts in `buffer.horizonMisses`.
 */
export function selectSensor(buffer, frameStampMs) {
    if (frameStampMs == null) return null
    const tolerance = sensorToleranceMs(buffer)
    buffer.dropBefore(frameStampMs - tolerance - SENSOR_RETAIN_MARGIN_MS)
    const selected = buffer.nearest(frameStampMs, tolerance)
    if (!selected && buffer.size >= buffer.capacity && buffer.entries[0].stampMs > frameStampMs + tolerance) {
        buffer.horizonMisses++
    }
    return selected
}
