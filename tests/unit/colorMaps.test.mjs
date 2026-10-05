// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turboColormap, divergingColor, distanceColor, neutralGrey } from '../../src/js/colorMaps.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('turbo runs from dark through blue to red and clamps its input', () => {
    const lo = turboColormap(0)
    const blue = turboColormap(0.15)
    const hi = turboColormap(1)
    assert.ok(lo.r + lo.g + lo.b < 0.5, 'low end is dark')
    assert.ok(blue.b > blue.r && blue.b > blue.g, 'low range is blue')
    assert.ok(hi.r > hi.g && hi.r > hi.b, 'high end is red')
    assert.deepEqual(turboColormap(-3), lo)
    assert.deepEqual(turboColormap(7), hi)
})

test('turbo channels stay within [0, 1]', () => {
    for (let t = 0; t <= 1; t += 0.05) {
        const c = turboColormap(t)
        for (const v of [c.r, c.g, c.b]) assert.ok(v >= 0 && v <= 1)
    }
})

test('diverging scale is neutral grey at zero, blue when negative, red when positive', () => {
    const g = neutralGrey(true) + 0.25
    const zero = divergingColor(0, true)
    close(zero.r, g); close(zero.g, g); close(zero.b, g)
    const neg = divergingColor(-1, true)
    const pos = divergingColor(1, true)
    assert.ok(neg.b > neg.r)
    assert.ok(pos.r > pos.b)
    assert.deepEqual(divergingColor(-5, true), neg)
    assert.deepEqual(divergingColor(5, true), pos)
})

test('distance colour is turbo in dark mode', () => {
    assert.deepEqual(distanceColor(0.4, true), turboColormap(0.4))
})
