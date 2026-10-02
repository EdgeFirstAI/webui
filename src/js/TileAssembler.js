// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { DISCONTINUITY_MS } from './stamp.js'

/**
 * Groups decoded tiles by exact acquisition stamp. All tiles of one sensor
 * frame carry the same header.stamp, and a group only ever holds tiles of a
 * single stamp, which becomes the stamp of the merged frame.
 *
 * Tiles travel on independent streams and any of them can be lost, so a
 * group is emitted either when all tiles have arrived or, as a partial
 * group, once it has waited `maxWaitMs` since its first tile. The consumer
 * draws onto a persistent canvas, so a missing tile leaves the previous
 * content of its quadrant in place. The default of 100 ms is three tile
 * periods at 30 fps: long enough for tiles of one frame decoded with normal
 * jitter to meet, short compared with the playout delay the frame is held
 * for anyway.
 *
 * `add()` returns at most one group, the newest by stamp among those ready;
 * older ready or pending groups are closed, and later tiles with a stamp at
 * or before the last emitted one are closed on arrival, so emitted stamps
 * only move forward (a jump beyond `DISCONTINUITY_MS` is a clock step and
 * starts over). The caller owns the bitmaps of a returned group.
 */
export default class TileAssembler {
    constructor({ tiles, maxWaitMs = 100 }) {
        this.tiles = tiles
        this.maxWaitMs = maxWaitMs
        this.groups = new Map()
        this.lastEmittedMs = null
    }

    /**
     * @returns {{stampMs: number, bitmaps: Object<string, ImageBitmap>} | null}
     *   the group to draw, complete or partial, or null when none is ready
     */
    add(tileName, stampMs, bitmap, nowMs = performance.now()) {
        if (this.lastEmittedMs !== null && Math.abs(stampMs - this.lastEmittedMs) > DISCONTINUITY_MS) {
            this.reset()
        }
        const ready = []
        if (this.lastEmittedMs !== null && stampMs <= this.lastEmittedMs) {
            bitmap.close()
        } else {
            let group = this.groups.get(stampMs)
            if (!group) {
                group = { firstMs: nowMs, bitmaps: {} }
                this.groups.set(stampMs, group)
            }
            if (group.bitmaps[tileName]) group.bitmaps[tileName].close()
            group.bitmaps[tileName] = bitmap
            if (this.tiles.every((t) => group.bitmaps[t])) ready.push(stampMs)
        }
        for (const [stamp, g] of this.groups) {
            if (nowMs - g.firstMs > this.maxWaitMs && !ready.includes(stamp)) ready.push(stamp)
        }
        if (ready.length === 0) return null

        const emitMs = Math.max(...ready)
        const group = this.groups.get(emitMs)
        this.groups.delete(emitMs)
        for (const stamp of [...this.groups.keys()]) {
            if (stamp < emitMs) this._drop(stamp)
        }
        this.lastEmittedMs = emitMs
        return { stampMs: emitMs, bitmaps: group.bitmaps }
    }

    reset() {
        for (const stamp of [...this.groups.keys()]) this._drop(stamp)
        this.lastEmittedMs = null
    }

    _drop(stamp) {
        const g = this.groups.get(stamp)
        if (!g) return
        for (const b of Object.values(g.bitmaps)) b.close()
        this.groups.delete(stamp)
    }
}
