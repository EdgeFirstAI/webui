// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DISCONTINUITY_MS } from './stamp.js'

export function percentile(sorted, p) {
    const i = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
    return sorted[i]
}

/**
 * Learns how late each stream arrives relative to its acquisition stamp and
 * derives how long camera frames must wait so every enabled overlay for a
 * frame has arrived before the frame is shown.
 *
 * Offsets are `arrival - stamp`, mixing the browser clock with the device
 * clock; only differences between streams are used, so the skew cancels.
 */
export default class PlayoutClock {
    constructor({ window = 60, maxDelayMs = 1000, staleAfterMs = 2000, marginMs = 10 } = {}) {
        this.window = window
        this.maxDelayMs = maxDelayMs
        this.staleAfterMs = staleAfterMs
        this.marginMs = marginMs
        this.streams = new Map()
    }

    observe(stream, stampMs, arrivalMs) {
        let s = this.streams.get(stream)
        if (!s) {
            s = { offsets: [], toleranceMs: 0, lastArrivalMs: arrivalMs }
            this.streams.set(stream, s)
        }
        const offset = arrivalMs - stampMs
        if (s.offsets.length > 0) {
            const sorted = [...s.offsets].sort((a, b) => a - b)
            if (Math.abs(offset - percentile(sorted, 0.5)) > DISCONTINUITY_MS) {
                s.offsets = []
            }
        }
        s.offsets.push(offset)
        if (s.offsets.length > this.window) s.offsets.shift()
        s.lastArrivalMs = arrivalMs
    }

    setTolerance(stream, toleranceMs) {
        const s = this.streams.get(stream)
        if (s) s.toleranceMs = toleranceMs
    }

    remove(stream) {
        this.streams.delete(stream)
    }

    delayMs(reference, nowMs) {
        return this.stats(reference, nowMs).delayMs
    }

    stats(reference, nowMs) {
        const ref = this.streams.get(reference)
        const result = { delayMs: 0, streams: {} }
        if (!ref || ref.offsets.length === 0) return result
        const refOffset = percentile([...ref.offsets].sort((a, b) => a - b), 0.5)
        let needed = 0
        for (const [name, s] of this.streams) {
            if (name === reference || s.offsets.length === 0) continue
            const lagMs = percentile([...s.offsets].sort((a, b) => a - b), 0.95) - refOffset
            result.streams[name] = { lagMs, samples: s.offsets.length }
            if (nowMs - s.lastArrivalMs > this.staleAfterMs) continue
            // Skip streams in different clock domain (momentary lag during step transient)
            if (Math.abs(lagMs) > DISCONTINUITY_MS) continue
            needed = Math.max(needed, lagMs + s.toleranceMs + this.marginMs)
        }
        result.delayMs = Math.min(this.maxDelayMs, Math.max(0, needed))
        return result
    }
}
