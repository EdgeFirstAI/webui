// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    MIRROR_MODES, DEFAULT_MIRROR, normalizeMirror, mirrorScale, mirrorCssTransform, loadMirror, saveMirror,
} from '../../src/js/viewMirror.js'

function memoryStorage(initial = {}) {
    const data = { ...initial }
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v) },
    }
}

const throwingStorage = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
}

test('default is not mirrored', () => {
    assert.equal(DEFAULT_MIRROR, 'none')
    assert.deepEqual(mirrorScale(DEFAULT_MIRROR), { x: 1, y: 1 })
    assert.equal(mirrorCssTransform(DEFAULT_MIRROR), '')
})

test('normalizeMirror keeps known modes and rejects anything else', () => {
    for (const mode of MIRROR_MODES) assert.equal(normalizeMirror(mode), mode)
    for (const bad of [null, undefined, '', 'true', 'Horizontal', 'left', 1]) {
        assert.equal(normalizeMirror(bad), 'none')
    }
})

test('mirrorScale flips the expected axes', () => {
    assert.deepEqual(mirrorScale('horizontal'), { x: -1, y: 1 })
    assert.deepEqual(mirrorScale('vertical'), { x: 1, y: -1 })
    assert.deepEqual(mirrorScale('both'), { x: -1, y: -1 })
    assert.deepEqual(mirrorScale('bogus'), { x: 1, y: 1 })
})

test('mirrorCssTransform', () => {
    assert.equal(mirrorCssTransform('horizontal'), 'scale(-1, 1)')
    assert.equal(mirrorCssTransform('vertical'), 'scale(1, -1)')
    assert.equal(mirrorCssTransform('both'), 'scale(-1, -1)')
})

test('save then load round-trips per key', () => {
    const storage = memoryStorage()
    saveMirror('lidar.mirror', 'vertical', storage)
    saveMirror('grid.mirror', 'both', storage)
    assert.equal(loadMirror('lidar.mirror', storage), 'vertical')
    assert.equal(loadMirror('grid.mirror', storage), 'both')
    assert.equal(loadMirror('camera.mirror', storage), 'none')
})

test('load ignores an invalid saved value and save normalizes', () => {
    const storage = memoryStorage({ 'camera.mirror': 'sideways' })
    assert.equal(loadMirror('camera.mirror', storage), 'none')
    saveMirror('camera.mirror', 'sideways', storage)
    assert.equal(storage.data['camera.mirror'], 'none')
})

test('unavailable storage falls back without throwing', () => {
    assert.equal(loadMirror('camera.mirror', throwingStorage), 'none')
    assert.doesNotThrow(() => saveMirror('camera.mirror', 'both', throwingStorage))
})
