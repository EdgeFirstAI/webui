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
 * only move forward. The caller owns the bitmaps of a returned group.
 *
 * `minIntervalMs` limits how often a group is returned. A group that
 * becomes ready sooner is held rather than closed and returned on the
 * first `add()` once the interval has passed, unless a newer group has
 * become ready by then, in which case the newer one replaces it. A newer
 * complete group therefore wins over an older partial one.
 *
 * Each tile has its own stream, so one stream can fall behind the others.
 * A tile more than `DISCONTINUITY_MS` from the last emitted stamp is only
 * taken as a clock step once tiles of the new time have arrived on most
 * streams; until then the newest such tile per stream is held aside, and
 * the assembler then starts over with the held tiles. A lagging stream
 * alone never confirms, so its tiles are closed without disturbing the
 * groups of the other streams.
 */
export default class TileAssembler {
    constructor({ tiles, maxWaitMs = 100, minIntervalMs = 0 }) {
        this.tiles = tiles
        this.maxWaitMs = maxWaitMs
        this.minIntervalMs = minIntervalMs
        this.lastReturnMs = null
        this.groups = new Map()
        this.lastEmittedMs = null
        this.step = null
    }

    /**
     * @returns {{stampMs: number, bitmaps: Object<string, ImageBitmap>} | null}
     *   the group to draw, complete or partial, or null when none is ready
     */
    add(tileName, stampMs, bitmap, nowMs = performance.now()) {
        if (this.lastEmittedMs !== null && Math.abs(stampMs - this.lastEmittedMs) > DISCONTINUITY_MS) {
            this._holdStepTile(tileName, stampMs, bitmap, nowMs)
            if (this.step.tiles.size > this.tiles.length / 2) {
                const held = [...this.step.tiles]
                this.step = null
                this.reset()
                for (const [name, t] of held) this._place(name, t.stampMs, t.bitmap, t.nowMs)
            }
        } else if (this.lastEmittedMs !== null && stampMs <= this.lastEmittedMs) {
            bitmap.close()
        } else {
            this._place(tileName, stampMs, bitmap, nowMs)
        }
        return this._emit(nowMs)
    }

    reset() {
        for (const stamp of [...this.groups.keys()]) this._drop(stamp)
        this.lastEmittedMs = null
        this._dropStep()
    }

    _place(tileName, stampMs, bitmap, nowMs) {
        let group = this.groups.get(stampMs)
        if (!group) {
            group = { firstMs: nowMs, bitmaps: {} }
            this.groups.set(stampMs, group)
        }
        if (group.bitmaps[tileName]) group.bitmaps[tileName].close()
        group.bitmaps[tileName] = bitmap
    }

    _emit(nowMs) {
        let emitMs = null
        for (const [stamp, g] of this.groups) {
            const ready = nowMs - g.firstMs > this.maxWaitMs || this.tiles.every((t) => g.bitmaps[t])
            if (ready && (emitMs === null || stamp > emitMs)) emitMs = stamp
        }
        if (emitMs === null) return null
        for (const stamp of [...this.groups.keys()]) {
            if (stamp < emitMs) this._drop(stamp)
        }
        if (this.lastReturnMs !== null && nowMs - this.lastReturnMs < this.minIntervalMs) return null
        const group = this.groups.get(emitMs)
        this.groups.delete(emitMs)
        this.lastReturnMs = nowMs
        this.lastEmittedMs = emitMs
        return { stampMs: emitMs, bitmaps: group.bitmaps }
    }

    _holdStepTile(tileName, stampMs, bitmap, nowMs) {
        if (this.step && Math.abs(stampMs - this.step.stampMs) > DISCONTINUITY_MS) this._dropStep()
        if (!this.step) this.step = { stampMs, tiles: new Map() }
        const previous = this.step.tiles.get(tileName)
        if (previous) previous.bitmap.close()
        this.step.tiles.set(tileName, { stampMs, bitmap, nowMs })
        this.step.stampMs = stampMs
    }

    _dropStep() {
        if (!this.step) return
        for (const t of this.step.tiles.values()) t.bitmap.close()
        this.step = null
    }

    _drop(stamp) {
        const g = this.groups.get(stamp)
        if (!g) return
        for (const b of Object.values(g.bitmaps)) b.close()
        this.groups.delete(stamp)
    }
}
