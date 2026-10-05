// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import StampBuffer, { selectDerived, selectSensor, sensorToleranceMs } from '../../src/js/StampBuffer.js'

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
