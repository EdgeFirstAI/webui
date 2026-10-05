// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CdrWriter } from '../../src/js/Cdr.js'
import { stampToMs, readHeaderStampMs, StampTracker } from '../../src/js/stamp.js'

function headered(sec, nanosec) {
    const w = new CdrWriter()
    w.uint32(sec)
    w.uint32(nanosec)
    w.string('camera_optical')
    w.uint32(0)
    return w.data.buffer.slice(w.data.byteOffset, w.data.byteOffset + w.data.byteLength)
}

test('stampToMs is deterministic for identical stamps', () => {
    assert.equal(stampToMs(1790000000, 123456789), stampToMs(1790000000, 123456789))
    assert.notEqual(stampToMs(1790000000, 123456789), stampToMs(1790000000, 123457789))
})

test('readHeaderStampMs reads header.stamp of a CDR message', () => {
    assert.equal(readHeaderStampMs(headered(1790000000, 500000000)), 1790000000500)
})

test('readHeaderStampMs handles stamps past 2038', () => {
    assert.equal(readHeaderStampMs(headered(0x90000000, 0)), 0x90000000 * 1000)
})

test('StampTracker returns each frame its own stamp even with frames in flight', () => {
    const tracker = new StampTracker()
    const a = tracker.enqueue({ stampMs: 1 })
    const b = tracker.enqueue({ stampMs: 2 })
    const c = tracker.enqueue({ stampMs: 3 })
    assert.deepEqual(tracker.take(a), { stampMs: 1 })
    assert.deepEqual(tracker.take(c), { stampMs: 3 })
    assert.deepEqual(tracker.take(b), { stampMs: 2 })
    assert.equal(tracker.take(b), null)
})

test('StampTracker forgets entries the decoder dropped', () => {
    const tracker = new StampTracker(4)
    const first = tracker.enqueue({ stampMs: 0 })
    for (let i = 1; i <= 4; i++) tracker.enqueue({ stampMs: i })
    assert.equal(tracker.take(first), null)
})
