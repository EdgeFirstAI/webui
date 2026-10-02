// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import TileAssembler from '../../src/js/TileAssembler.js'

const TILES = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']
const T = 1790000000000
const bm = () => ({ closed: false, close() { this.closed = true } })

test('a group completes when all four tiles share a stamp', () => {
    const a = new TileAssembler({ tiles: TILES })
    assert.equal(a.add('topLeft', T, bm(), 0), null)
    assert.equal(a.add('topRight', T, bm(), 1), null)
    assert.equal(a.add('bottomLeft', T, bm(), 2), null)
    const g = a.add('bottomRight', T, bm(), 3)
    assert.equal(g.stampMs, T)
    assert.deepEqual(Object.keys(g.bitmaps).sort(), [...TILES].sort())
})

test('tiles from different frames are never mixed', () => {
    const a = new TileAssembler({ tiles: TILES })
    a.add('topLeft', T, bm(), 0)
    a.add('topRight', T + 33, bm(), 1)
    a.add('bottomLeft', T, bm(), 2)
    assert.equal(a.add('bottomRight', T + 33, bm(), 3), null)
})

test('completing a newer group discards older incomplete ones', () => {
    const a = new TileAssembler({ tiles: TILES })
    const stale = bm()
    a.add('topLeft', T, stale, 0)
    for (const t of TILES) a.add(t, T + 33, bm(), 10)
    assert.ok(stale.closed)
})

const strict = () => ({
    closes: 0,
    close() {
        if (this.closes++) throw new Error('bitmap closed twice')
    },
})

test('the default wait is short relative to the 33 ms tile period', () => {
    assert.equal(new TileAssembler({ tiles: TILES }).maxWaitMs, 100)
})

test('a group missing a tile is emitted as a partial group after maxWaitMs', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    const tl = strict(), tr = strict(), bl = strict()
    assert.equal(a.add('topLeft', T, tl, 0), null)
    assert.equal(a.add('topRight', T, tr, 1), null)
    assert.equal(a.add('bottomLeft', T, bl, 2), null)
    const g = a.add('topLeft', T + 133, strict(), 101)
    assert.equal(g.stampMs, T)
    assert.deepEqual(g.bitmaps, { topLeft: tl, topRight: tr, bottomLeft: bl })
    assert.deepEqual([tl, tr, bl].map((b) => b.closes), [0, 0, 0])
})

test('a group is not emitted before maxWaitMs', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    a.add('topLeft', T, strict(), 0)
    assert.equal(a.add('topRight', T + 33, strict(), 100), null)
})

test('a partial group never holds tiles of another stamp', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    const tl = strict()
    a.add('topLeft', T, tl, 0)
    a.add('topRight', T + 33, strict(), 33)
    const g = a.add('bottomLeft', T + 66, strict(), 101)
    assert.equal(g.stampMs, T)
    assert.deepEqual(g.bitmaps, { topLeft: tl })
})

test('a late tile of an already emitted stamp is closed, never emitted', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    a.add('topLeft', T, strict(), 0)
    assert.equal(a.add('topLeft', T + 133, strict(), 101).stampMs, T)
    const late = strict()
    assert.equal(a.add('topRight', T, late, 102), null)
    assert.equal(late.closes, 1)
    assert.equal(a.add('topRight', T + 166, strict(), 300).stampMs, T + 133)
})

test('only the newest of several emittable groups is returned; the rest are closed', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    const old = strict()
    a.add('topLeft', T, old, 0)
    for (const t of TILES.slice(0, 3)) assert.equal(a.add(t, T + 33, strict(), 50), null)
    const g = a.add('bottomRight', T + 33, strict(), 101)
    assert.equal(g.stampMs, T + 33)
    assert.equal(Object.keys(g.bitmaps).length, 4)
    assert.equal(old.closes, 1)
})

test('an emitted partial group supersedes older incomplete groups', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    const older = strict(), newer = strict()
    a.add('topLeft', T, older, 0)
    a.add('topLeft', T + 33, newer, 10)
    const g = a.add('topLeft', T + 200, strict(), 111)
    assert.equal(g.stampMs, T + 33)
    assert.equal(older.closes, 1)
    assert.equal(newer.closes, 0)
})

test('a clock step backwards does not stall emission', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    for (const t of TILES) a.add(t, T, strict(), 0)
    const back = T - 3600000
    for (const t of TILES.slice(0, 3)) a.add(t, back, strict(), 10)
    const g = a.add('bottomRight', back, strict(), 11)
    assert.equal(g.stampMs, back)
})

test('every bitmap is closed exactly once across emission, supersession and reset', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 100 })
    const all = []
    let seed = 7
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    let now = 0
    for (let frame = 0; frame < 200; frame++) {
        const stamp = T + frame * 33.333
        for (const t of TILES) {
            now += 8
            if (rand() < 0.2) continue
            const b = strict()
            all.push(b)
            const s = rand() < 0.1 ? stamp - 33.333 : stamp
            const g = a.add(t, s, b, now)
            if (g) for (const x of Object.values(g.bitmaps)) x.close()
        }
    }
    a.reset()
    assert.deepEqual(all.filter((b) => b.closes !== 1), [])
})
