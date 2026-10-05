// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import PlayoutClock, { percentile } from '../../src/js/PlayoutClock.js'

const T = 1790000000000
const BROWSER_SKEW = -1789999000000   // device and browser clocks differ; only differences matter

function feed(clock, stream, lagMs, count, period = 33, now0 = 0) {
    let now = now0
    for (let i = 0; i < count; i++) {
        const stamp = T + i * period
        now = stamp + BROWSER_SKEW + lagMs
        clock.observe(stream, stamp, now)
    }
    return now
}

test('camera only means no delay', () => {
    const clock = new PlayoutClock()
    const now = feed(clock, 'camera', 20, 30)
    assert.equal(clock.delayMs('camera', now), 0)
})

test('delay covers model lag relative to camera plus margin', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    const now = feed(clock, 'model', 120, 60)
    assert.equal(Math.round(clock.delayMs('camera', now)), 110)
})

test('sensor tolerance extends the delay so the nearest later sample can arrive', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    const now = feed(clock, 'lidar', 150, 20, 100)
    clock.setTolerance('lidar', 60)
    assert.equal(Math.round(clock.delayMs('camera', now)), 200)
})

test('delay is clamped', () => {
    const clock = new PlayoutClock({ maxDelayMs: 1000 })
    feed(clock, 'camera', 20, 60)
    const now = feed(clock, 'model', 1500, 60)
    assert.equal(clock.delayMs('camera', now), 1000)
})

test('a silent stream stops contributing', () => {
    const clock = new PlayoutClock({ staleAfterMs: 2000 })
    feed(clock, 'camera', 20, 60)
    const last = feed(clock, 'model', 120, 60)
    assert.ok(clock.delayMs('camera', last) > 0)
    assert.equal(clock.delayMs('camera', last + 2001), 0)
})

test('clock step resets the stream instead of poisoning the estimate', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    feed(clock, 'model', 120, 60)
    const stepped = T + 41054973261
    const now = T + 60 * 33 + BROWSER_SKEW + 120
    clock.observe('model', stepped, now)
    assert.equal(clock.stats('camera', now).streams.model.samples, 1)
})

test('removed streams no longer count', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    const now = feed(clock, 'model', 120, 60)
    clock.remove('model')
    assert.equal(clock.delayMs('camera', now), 0)
})

test('percentile picks from a sorted array', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 6)
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10)
})

test('p95 distinguishes from p50 with jittered lag', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    // Model: 55 samples at lag 100, 5 samples at lag 300
    let now = T + 60 * 33 + BROWSER_SKEW + 100
    for (let i = 0; i < 55; i++) {
        const stamp = T + 60 * 33 + i * 33
        now = stamp + BROWSER_SKEW + 100
        clock.observe('model', stamp, now)
    }
    for (let i = 0; i < 5; i++) {
        const stamp = T + 60 * 33 + 55 * 33 + i * 33
        now = stamp + BROWSER_SKEW + 300
        clock.observe('model', stamp, now)
    }
    // p95 of sorted offsets: floor(0.95*60)=57 → sorted[57]=300
    // lagMs = 300 - 20 + 10 = 290
    assert.equal(Math.round(clock.delayMs('camera', now)), 290)
})

test('forward clock step clears transient lag', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    feed(clock, 'model', 120, 60)
    const now = T + 60 * 33 + BROWSER_SKEW + 120
    // Camera steps forward
    const STEP = 3_600_000
    let t = now + 100
    clock.observe('camera', T + 60 * 33 + STEP, t)
    clock.observe('camera', T + 60 * 33 + STEP + 33, t + 33)
    // Delay should be 0 (transient: camera in new domain, model in old)
    assert.equal(clock.delayMs('camera', t), 0)
    // Model steps too
    clock.observe('model', T + 60 * 33 + STEP, t + 50)
    clock.observe('model', T + 60 * 33 + STEP + 33, t + 50 + 33)
    // Delay recovers to ≈110 (both in same domain, new window)
    const delay = clock.delayMs('camera', t + 100)
    assert.ok(delay > 0 && delay < 200, `delay ${delay} not in expected range`)
})

test('backward clock step clears transient lag', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    feed(clock, 'model', 120, 60)
    const now = T + 60 * 33 + BROWSER_SKEW + 120
    // Camera steps backward
    const STEP = 3_600_000
    let t = now + 100
    clock.observe('camera', T + 60 * 33 - STEP, t)
    clock.observe('camera', T + 60 * 33 - STEP + 33, t + 33)
    // Delay should be 0 (transient)
    assert.equal(clock.delayMs('camera', t), 0)
    // Model steps too
    clock.observe('model', T + 60 * 33 - STEP, t + 50)
    clock.observe('model', T + 60 * 33 - STEP + 33, t + 50 + 33)
    // Delay recovers
    const delay = clock.delayMs('camera', t + 100)
    assert.ok(delay > 0 && delay < 200, `delay ${delay} not in expected range`)
})

test('model steps first, camera later recovers delay', () => {
    const clock = new PlayoutClock()
    feed(clock, 'camera', 20, 60)
    feed(clock, 'model', 120, 60)
    const now = T + 60 * 33 + BROWSER_SKEW + 120
    const STEP = 3_600_000
    let t = now + 100
    // Model steps first, accumulates new samples with same lag offset
    for (let i = 0; i < 10; i++) {
        clock.observe('model', T + 60 * 33 + STEP + i * 33, t + 50 + i * 33)
    }
    // Delay is 0 (transient: model in new domain, camera still in old)
    assert.equal(clock.delayMs('camera', t + 100), 0)
    // Camera steps, accumulates new samples (50ms behind model)
    for (let i = 0; i < 10; i++) {
        clock.observe('camera', T + 60 * 33 + STEP + i * 33, t + i * 33)
    }
    // Delay recovers (both in same domain, model ~50ms ahead)
    const delay = clock.delayMs('camera', t + 500)
    assert.ok(delay > 0 && delay < 200, `delay ${delay} not in expected range`)
})
