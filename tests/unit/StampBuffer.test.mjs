// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import StampBuffer, {
    selectDerived, selectSensor, sensorToleranceMs, RADAR_BUFFER_CAPACITY, LIDAR_BUFFER_CAPACITY, MODEL_BUFFER_CAPACITY,
    SENSOR_RETAIN_MARGIN_MS,
} from '../../src/js/StampBuffer.js'

const T = 1790000000000

function filled(periodMs, count, start = T) {
    const b = new StampBuffer({ capacity: 64 })
    for (let i = 0; i < count; i++) b.push(start + i * periodMs, `v${i}`)
    return b
}

test('exact match wins for camera-derived results', () => {
    const b = filled(100, 5)
    assert.equal(selectDerived(b, T + 200).value, 'v2')
})

test('derived hold covers frames the model skipped but never looks ahead', () => {
    const b = filled(100, 5)           // model at 10 Hz
    assert.equal(selectDerived(b, T + 233).value, 'v2')
    assert.equal(selectDerived(b, T - 1), null)
})

test('derived hold expires after two model periods', () => {
    const b = filled(100, 5)
    assert.equal(selectDerived(b, T + 400 + 199).value, 'v4')
    assert.equal(selectDerived(b, T + 400 + 251), null)
})

test('sensor selection picks the nearest stamp within half a period', () => {
    const lidar = filled(100, 5, T + 30)   // 10 Hz, offset from camera
    assert.equal(selectSensor(lidar, T + 70).value, 'v0')
    assert.equal(selectSensor(lidar, T + 90).value, 'v1')
    assert.equal(selectSensor(lidar, T + 1000), null)
})

test('sensor tolerance falls back before a period is known', () => {
    const b = new StampBuffer()
    b.push(T, 'only')
    assert.equal(sensorToleranceMs(b), 60)
    assert.equal(sensorToleranceMs(filled(100, 5)), 60)
    assert.equal(sensorToleranceMs(filled(50, 5)), 35)
})

test('forward clock step clears older entries', () => {
    const b = filled(100, 5)
    b.push(T + 41054973261, 'after')
    assert.equal(b.size, 1)
    assert.equal(selectDerived(b, T + 200), null)
})

test('backward clock step clears newer entries', () => {
    const b = filled(100, 5, T + 41054973261)
    b.push(T, 'after')
    assert.equal(b.size, 1)
    assert.equal(selectDerived(b, T).value, 'after')
})

test('late arrival within the window is inserted in order', () => {
    const b = new StampBuffer()
    b.push(T, 'a')
    b.push(T + 200, 'c')
    b.push(T + 100, 'b')
    assert.equal(b.nearest(T + 110, 20).value, 'b')
})

test('capacity evicts the oldest entry', () => {
    const b = new StampBuffer({ capacity: 3 })
    for (let i = 0; i < 5; i++) b.push(T + i, i)
    assert.equal(b.size, 3)
    assert.equal(b.exact(T), null)
    assert.equal(b.exact(T + 4).value, 4)
})

test('duplicate stamp replaces the value', () => {
    const b = new StampBuffer()
    b.push(T, 'old')
    b.push(T, 'new')
    assert.equal(b.size, 1)
    assert.equal(b.exact(T).value, 'new')
})

/**
 * Live stream: one sample per period, selecting each time for a displayed
 * frame `lagMs` behind the newest sample, as the animation loop does.
 * Returns the selection for the last sample.
 */
function streamWithLag(buffer, periodMs, count, lagMs) {
    let sel = null
    for (let i = 0; i < count; i++) {
        buffer.push(T + i * periodMs, i)
        sel = selectSensor(buffer, T + i * periodMs - lagMs)
    }
    return sel
}

test('sensor capacities and the retention margin', () => {
    assert.equal(RADAR_BUFFER_CAPACITY, 192)
    assert.equal(LIDAR_BUFFER_CAPACITY, 64)
    assert.equal(SENSOR_RETAIN_MARGIN_MS, 1000)
})

test('radar at 55 ms is selected with the displayed frame 2.2 to 10 s behind the newest sample', () => {
    for (const lag of [2200, 2850, 3300, 3405, 3500, 3600, 5000, 8000, 10000]) {
        const b = new StampBuffer({ capacity: RADAR_BUFFER_CAPACITY })
        const sel = streamWithLag(b, 55, 400, lag)
        assert.ok(sel, `selected at ${lag} ms`)
        const frame = T + 399 * 55 - lag
        assert.ok(Math.abs(frame - sel.stampMs) <= 55 / 2 + 10, `within tolerance at ${lag} ms`)
    }
})

test('radar beyond the capacity horizon (191 periods, about 10.5 s) selects nothing and counts a horizon miss', () => {
    const b = new StampBuffer({ capacity: RADAR_BUFFER_CAPACITY })
    const misses = b.horizonMisses
    assert.equal(streamWithLag(b, 55, 400, 11000), null)
    assert.ok(b.horizonMisses > misses)
})

test('LiDAR at 10 Hz is selected with the displayed frame 4 s behind', () => {
    for (const lag of [500, 3400, 4000, 6000]) {
        const b = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
        assert.ok(streamWithLag(b, 100, 200, lag), `selected at ${lag} ms`)
    }
    const b = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
    assert.equal(streamWithLag(b, 100, 200, 7000), null)
})

test('samples the displayed frame can no longer reach are dropped, so a small lag keeps a small buffer', () => {
    const radar = new StampBuffer({ capacity: RADAR_BUFFER_CAPACITY })
    streamWithLag(radar, 55, 400, 100)
    // frame - tolerance - margin .. newest = 100 + 37.5 + 1000 ms
    assert.ok(radar.size <= Math.ceil((100 + 37.5 + SENSOR_RETAIN_MARGIN_MS) / 55) + 1, `radar keeps ${radar.size}`)
    const lidar = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
    streamWithLag(lidar, 100, 200, 100)
    assert.ok(lidar.size <= 13, `LiDAR keeps ${lidar.size}`)
})

test('the samples around a lagging frame survive while it plays forward', () => {
    const b = new StampBuffer({ capacity: RADAR_BUFFER_CAPACITY })
    for (let i = 0; i < 100; i++) b.push(T + i * 55, i)
    // video 3.6 s behind, advancing 33 ms per frame while radar keeps arriving
    let selected = 0
    for (let f = 0; f < 120; f++) {
        if (f % 2 === 0) b.push(T + (100 + f / 2) * 55, 100 + f / 2)
        const frame = T + 99 * 55 - 3600 + f * 33
        if (selectSensor(b, frame)) selected++
    }
    assert.equal(selected, 120)
})

test('no displayed frame yet: only the capacity bounds the buffer', () => {
    const b = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
    for (let i = 0; i < 100; i++) b.push(T + i * 100, i)
    assert.equal(selectSensor(b, null), null)
    assert.equal(b.size, LIDAR_BUFFER_CAPACITY)
})

test('model results are found by exact stamp with the displayed frame 4 s behind the newest result', () => {
    assert.equal(MODEL_BUFFER_CAPACITY, 64)
    for (const lag of [500, 3400, 4000, 6000]) {
        const b = new StampBuffer({ capacity: MODEL_BUFFER_CAPACITY })
        let sel = null
        for (let i = 0; i < 200; i++) {
            b.push(T + i * 100, i)
            sel = selectDerived(b, T + i * 100 - lag)
        }
        assert.ok(sel, `selected at ${lag} ms`)
        assert.equal(sel.stampMs, T + 199 * 100 - lag)
    }
})

test('model results the displayed frame can no longer reach are dropped', () => {
    const b = new StampBuffer({ capacity: MODEL_BUFFER_CAPACITY })
    for (let i = 0; i < 200; i++) {
        b.push(T + i * 100, i)
        selectDerived(b, T + i * 100 - 100)
    }
    assert.ok(b.size <= 15, `model keeps ${b.size}`)
})
