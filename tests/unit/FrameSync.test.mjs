// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import FrameSync from '../../src/js/FrameSync.js'
import PlayoutClock from '../../src/js/PlayoutClock.js'

const T = 1790000000000

function bitmap(id) {
    return { id, closed: false, close() { this.closed = true } }
}

function fixedDelay(ms) {
    return { observe() {}, delayMs: () => ms }
}

test('without overlays the newest frame is released immediately', () => {
    const sync = new FrameSync({ clock: new PlayoutClock() })
    const a = bitmap('a'), b = bitmap('b')
    sync.pushFrame(T, a, 0)
    sync.pushFrame(T + 33, b, 1)
    const out = sync.release(1)
    assert.equal(out.bitmap, b)
    assert.equal(out.stampMs, T + 33)
    assert.ok(a.closed)
})

test('frames wait for the playout delay', () => {
    const sync = new FrameSync({ clock: fixedDelay(100) })
    sync.pushFrame(T, bitmap('a'), 0)
    assert.equal(sync.release(99), null)
    assert.equal(sync.release(100).stampMs, T)
})

test('only frames that are due are released, in stamp order', () => {
    const sync = new FrameSync({ clock: fixedDelay(100) })
    sync.pushFrame(T, bitmap('a'), 0)
    sync.pushFrame(T + 33, bitmap('b'), 33)
    sync.pushFrame(T + 66, bitmap('c'), 66)
    assert.equal(sync.release(140).stampMs, T + 33)
    assert.equal(sync.depth, 1)
})

test('capacity drops and closes the oldest frames', () => {
    const sync = new FrameSync({ clock: fixedDelay(1000), capacity: 2 })
    const a = bitmap('a')
    sync.pushFrame(T, a, 0)
    sync.pushFrame(T + 33, bitmap('b'), 33)
    sync.pushFrame(T + 66, bitmap('c'), 66)
    assert.ok(a.closed)
    assert.equal(sync.depth, 2)
})

test('a clock step flushes frames from the other side', () => {
    const sync = new FrameSync({ clock: fixedDelay(100) })
    const old = bitmap('old')
    sync.pushFrame(T, old, 0)
    sync.pushFrame(T + 41054973261, bitmap('new'), 10)
    assert.ok(old.closed)
    assert.equal(sync.depth, 1)
})

test('reset closes everything', () => {
    const sync = new FrameSync({ clock: fixedDelay(100) })
    const a = bitmap('a')
    sync.pushFrame(T, a, 0)
    sync.reset()
    assert.ok(a.closed)
    assert.equal(sync.depth, 0)
})

test('only dropped frames are closed; the released and kept frames belong to the caller', () => {
    const sync = new FrameSync({ clock: fixedDelay(100) })
    const a = bitmap('a'), b = bitmap('b'), c = bitmap('c')
    sync.pushFrame(T, a, 0)
    sync.pushFrame(T + 33, b, 10)
    sync.pushFrame(T + 66, c, 20)
    const out = sync.release(115)
    assert.equal(out.bitmap, b)
    assert.ok(a.closed, 'intermediate frame is closed')
    assert.ok(!b.closed, 'released frame is left to the caller')
    assert.ok(!c.closed, 'frame not yet due is kept')
    assert.equal(sync.release(120).bitmap, c)
    assert.ok(!c.closed)
})

test('capacity eviction closes only the evicted frame', () => {
    const sync = new FrameSync({ clock: fixedDelay(1000), capacity: 2 })
    const a = bitmap('a'), b = bitmap('b'), c = bitmap('c')
    sync.pushFrame(T, a, 0)
    sync.pushFrame(T + 33, b, 33)
    sync.pushFrame(T + 66, c, 66)
    assert.deepEqual([a, b, c].map((f) => f.closed), [true, false, false])
})

test('a clock step in either direction closes the old frames only', () => {
    for (const stepMs of [41054973261, -41054973261]) {
        const sync = new FrameSync({ clock: fixedDelay(0) })
        const a = bitmap('a'), b = bitmap('b'), after = bitmap('after')
        sync.pushFrame(T, a, 0)
        sync.pushFrame(T + 33, b, 1)
        sync.pushFrame(T + stepMs, after, 2)
        assert.ok(a.closed && b.closed, `step ${stepMs}`)
        assert.ok(!after.closed, `step ${stepMs}`)
        const out = sync.release(2)
        assert.equal(out.bitmap, after)
        assert.equal(out.stampMs, T + stepMs)
        assert.ok(!after.closed)
    }
})

test('a delay longer than the queue can hold degrades instead of freezing', () => {
    const capacity = 12
    const sync = new FrameSync({ clock: fixedDelay(1000), capacity })
    const all = []
    const shown = []
    for (let i = 0; i < 100; i++) {
        const arrival = i * 67
        const b = bitmap(i)
        all.push(b)
        sync.pushFrame(T + i * 67, b, arrival)
        assert.ok(sync.depth <= capacity, `depth ${sync.depth} at frame ${i}`)
        for (let now = arrival; now < arrival + 67; now += 16) {
            const out = sync.release(now)
            if (!out) continue
            shown.push(out.stampMs)
            out.bitmap.close()
        }
    }
    assert.ok(shown.length >= 100 - capacity, `only ${shown.length} frames shown`)
    for (let i = 1; i < shown.length; i++) assert.ok(shown[i] > shown[i - 1], 'stamp order')
    assert.ok(all.slice(0, all.length - sync.depth).every((b) => b.closed))
    assert.ok(all.slice(all.length - sync.depth).every((b) => !b.closed))
})
