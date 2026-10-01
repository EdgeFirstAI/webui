// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Groups decoded tiles by exact acquisition stamp. All tiles of one sensor
 * frame carry the same header.stamp, so a merged frame is only built from
 * tiles of the same frame.
 */
export default class TileAssembler {
    constructor({ tiles, maxWaitMs = 200 }) {
        this.tiles = tiles
        this.maxWaitMs = maxWaitMs
        this.groups = new Map()
    }

    add(tileName, stampMs, bitmap, nowMs = performance.now()) {
        for (const [stamp, g] of this.groups) {
            if (nowMs - g.firstMs > this.maxWaitMs) this._drop(stamp)
        }
        let group = this.groups.get(stampMs)
        if (!group) {
            group = { firstMs: nowMs, bitmaps: {} }
            this.groups.set(stampMs, group)
        }
        if (group.bitmaps[tileName]) group.bitmaps[tileName].close()
        group.bitmaps[tileName] = bitmap
        if (!this.tiles.every((t) => group.bitmaps[t])) return null
        this.groups.delete(stampMs)
        for (const stamp of [...this.groups.keys()]) {
            if (stamp < stampMs) this._drop(stamp)
        }
        return { stampMs, bitmaps: group.bitmaps }
    }

    reset() {
        for (const stamp of [...this.groups.keys()]) this._drop(stamp)
    }

    _drop(stamp) {
        const g = this.groups.get(stamp)
        if (!g) return
        for (const b of Object.values(g.bitmaps)) b.close()
        this.groups.delete(stamp)
    }
}
