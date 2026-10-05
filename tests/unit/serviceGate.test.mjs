// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serviceState, gateOverlay } from '../../src/js/serviceGate.js'

const statuses = (radar, lidar) => [
    { service: 'camera', enabled: 'enabled', status: 'running' },
    { service: 'radarpub', enabled: radar, status: radar === 'enabled' ? 'running' : 'inactive' },
    { service: 'lidarpub', enabled: lidar, status: 'inactive' },
]

test('service state comes from the systemd enabled field', () => {
    const s = statuses('enabled', 'disabled')
    assert.equal(serviceState(s, 'radarpub'), 'enabled')
    assert.equal(serviceState(s, 'lidarpub'), 'disabled')
    assert.equal(serviceState(s, 'fusion'), 'disabled')       // not listed
})

test('statuses not fetched yet are unknown', () => {
    assert.equal(serviceState(null, 'radarpub'), 'unknown')
    assert.equal(serviceState(undefined, 'radarpub'), 'unknown')
    assert.equal(serviceState({}, 'radarpub'), 'unknown')
})

test('an enabled service shows its overlay section and leaves the overlay as it is', () => {
    const s = statuses('enabled', 'disabled')
    assert.deepEqual(gateOverlay(s, 'radarpub', { visible: false, on: false }), { visible: true, stop: false })
    assert.deepEqual(gateOverlay(s, 'radarpub', { visible: true, on: true }), { visible: true, stop: false })
})

test('a disabled service hides its section', () => {
    const s = statuses('enabled', 'disabled')
    assert.deepEqual(gateOverlay(s, 'lidarpub', { visible: true, on: false }), { visible: false, stop: false })
    assert.deepEqual(gateOverlay(s, 'lidarpub', { visible: false, on: false }), { visible: false, stop: false })
})

test('a service disabled while its overlay is on hides the section and stops the overlay', () => {
    const before = statuses('enabled', 'disabled')
    const after = statuses('disabled', 'disabled')
    const shown = gateOverlay(before, 'radarpub', { visible: false, on: false })
    assert.deepEqual(shown, { visible: true, stop: false })
    assert.deepEqual(gateOverlay(after, 'radarpub', { visible: shown.visible, on: true }), { visible: false, stop: true })
})

test('re-enabling shows the section again without turning the overlay on', () => {
    const s = statuses('enabled', 'disabled')
    assert.deepEqual(gateOverlay(s, 'radarpub', { visible: false, on: false }), { visible: true, stop: false })
})

test('unknown statuses keep the current visibility and never stop the overlay', () => {
    assert.deepEqual(gateOverlay(null, 'radarpub', { visible: false, on: false }), { visible: false, stop: false })
    assert.deepEqual(gateOverlay(null, 'radarpub', { visible: true, on: true }), { visible: true, stop: false })
})
