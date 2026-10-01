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

test('groups older than maxWaitMs are discarded', () => {
    const a = new TileAssembler({ tiles: TILES, maxWaitMs: 200 })
    const stale = bm()
    a.add('topLeft', T, stale, 0)
    a.add('topLeft', T + 33, bm(), 201)
    assert.ok(stale.closed)
})
