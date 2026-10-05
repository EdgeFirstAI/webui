// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    tfToMatrix, invertRigidTransform, multiplyMatrices, sensorToCameraMatrix, projectToImage, sameTransform,
} from '../../src/js/projection.js'

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 }
const ZERO_T = { x: 0, y: 0, z: 0 }
// base_link (x forward, y left, z up) to the optical frame (z forward, x right, y down)
const OPTICAL_Q = { x: -0.5, y: 0.5, z: -0.5, w: 0.5 }
const K = { fx: 1000, fy: 1000, cx: 960, cy: 540 }

function apply(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ]
}

test('identity transform with a translation', () => {
    const m = tfToMatrix({ x: 1, y: 2, z: 3 }, IDENTITY_Q)
    assert.deepEqual(apply(m, 0, 0, 0), [1, 2, 3])
})

test('non-unit quaternions are normalised', () => {
    const a = tfToMatrix(ZERO_T, OPTICAL_Q)
    const b = tfToMatrix(ZERO_T, { x: -1, y: 1, z: -1, w: 1 })
    for (let i = 0; i < 16; i++) close(a[i], b[i])
})

test('inverse of a rigid transform undoes it', () => {
    const m = tfToMatrix({ x: 0.3, y: -0.2, z: 1.1 }, { x: 0.1, y: 0.2, z: 0.3, w: 0.9 })
    const id = multiplyMatrices(invertRigidTransform(m), m)
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) close(id[c * 4 + r], c === r ? 1 : 0)
})

test('a sensor at the camera origin maps forward to optical +Z', () => {
    const m = sensorToCameraMatrix({ translation: ZERO_T, rotation: IDENTITY_Q }, { translation: ZERO_T, rotation: OPTICAL_Q })
    const [x, y, z] = apply(m, 10, 0, 0)
    close(x, 0); close(y, 0); close(z, 10)
    const [lx, , ] = apply(m, 10, 1, 0)
    close(lx, -1)                     // sensor +Y (left) is image left
    const [, uy] = apply(m, 10, 0, 1)
    close(uy, -1)                     // sensor +Z (up) is image up
})

test('sensor offset from the camera is applied', () => {
    const m = sensorToCameraMatrix(
        { translation: { x: 0, y: 0, z: -0.5 }, rotation: IDENTITY_Q },
        { translation: ZERO_T, rotation: OPTICAL_Q },
    )
    const [, y, z] = apply(m, 10, 0, 0)
    close(z, 10); close(y, 0.5)       // half a metre below the camera
})

test('missing transforms give no matrix', () => {
    assert.equal(sensorToCameraMatrix(null, { translation: ZERO_T, rotation: OPTICAL_Q }), null)
    assert.equal(sensorToCameraMatrix({ translation: ZERO_T, rotation: IDENTITY_Q }, null), null)
})

test('projection follows the pinhole model', () => {
    const m = sensorToCameraMatrix({ translation: ZERO_T, rotation: IDENTITY_Q }, { translation: ZERO_T, rotation: OPTICAL_Q })
    const centre = projectToImage(m, K, 5, 0, 0)
    close(centre.u, 960); close(centre.v, 540); close(centre.depth, 5)
    const left = projectToImage(m, K, 10, 1, 0)
    close(left.u, 860); close(left.v, 540)
})

test('points behind or on the camera plane are not projected', () => {
    const m = sensorToCameraMatrix({ translation: ZERO_T, rotation: IDENTITY_Q }, { translation: ZERO_T, rotation: OPTICAL_Q })
    assert.equal(projectToImage(m, K, -5, 0, 0), null)
    assert.equal(projectToImage(m, K, 0, 1, 0), null)
})

test('sameTransform compares translation and rotation values, not identity', () => {
    const a = { translation: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, frameId: 'base_link', childFrameId: 'radar' }
    const b = { translation: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, frameId: 'base_link', childFrameId: 'radar' }
    assert.equal(sameTransform(a, b), true)
    assert.equal(sameTransform(a, { ...b, translation: { x: 1, y: 2, z: 3.001 } }), false)
    assert.equal(sameTransform(a, { ...b, rotation: { x: 0, y: 0, z: 0.1, w: 1 } }), false)
    assert.equal(sameTransform(a, null), false)
    assert.equal(sameTransform(null, a), false)
    assert.equal(sameTransform(null, null), true)
})
