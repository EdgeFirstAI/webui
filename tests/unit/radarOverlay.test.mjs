// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    RADAR_COLOR_MODES, RADAR_RANGE_MAX_M, DEFAULT_RADAR_SETTINGS,
    availableRadarColorModes, parseHexColor, normalizeRadarSettings,
    readRadarColumns, radarPointColors, buildRadarFrame,
} from '../../src/js/radarOverlay.js'
import { turboColormap, divergingColor } from '../../src/js/colorMaps.js'
import { sensorToCameraMatrix } from '../../src/js/projection.js'

const FLOAT32 = 7
const ZERO_T = { x: 0, y: 0, z: 0 }
const OPTICAL = { translation: ZERO_T, rotation: { x: -0.5, y: 0.5, z: -0.5, w: 0.5 } }
const RADAR = { translation: ZERO_T, rotation: { x: 0, y: 0, z: 0, w: 1 } }
const K = { fx: 1000, fy: 1000, cx: 960, cy: 540 }
const W = 1920
const H = 1080

/** A parsed PointCloud2 (as parsePointCloud2 returns) of float32 fields. */
function cloud(names, rows) {
    const fields = names.map((name, i) => ({ name, offset: i * 4, datatype: FLOAT32, count: 1 }))
    const fieldMap = Object.fromEntries(fields.map((f) => [f.name, f]))
    const pointStep = names.length * 4
    const dataView = new DataView(new ArrayBuffer(pointStep * rows.length))
    rows.forEach((row, i) => row.forEach((v, j) => dataView.setFloat32(i * pointStep + j * 4, v, true)))
    return { totalPoints: rows.length, pointStep, littleEndian: true, fields, fieldMap, dataView }
}

const LIVE_FIELDS = ['x', 'y', 'z', 'speed', 'power', 'rcs']

test('fixed and range are always offered; field modes need their field', () => {
    assert.deepEqual(availableRadarColorModes({ x: {}, y: {}, z: {} }).map((m) => m.value), ['fixed', 'range'])
    const all = availableRadarColorModes(cloud(LIVE_FIELDS, []).fieldMap).map((m) => m.value)
    assert.deepEqual(all, ['fixed', 'range', 'speed', 'power', 'rcs'])
    assert.deepEqual(RADAR_COLOR_MODES.map((m) => m.value), all)
})

test('hex colours parse to unit channels and reject anything else', () => {
    assert.deepEqual(parseHexColor('#ff0080'), { r: 1, g: 0, b: 128 / 255 })
    assert.deepEqual(parseHexColor('#FFFFFF'), { r: 1, g: 1, b: 1 })
    for (const bad of ['ff0080', '#fff', '#gg0000', null, 3, 'red']) assert.equal(parseHexColor(bad), null)
})

test('settings default when missing and drop invalid values', () => {
    assert.deepEqual(normalizeRadarSettings(null), DEFAULT_RADAR_SETTINGS)
    assert.deepEqual(normalizeRadarSettings('not json'), DEFAULT_RADAR_SETTINGS)
    assert.deepEqual(
        normalizeRadarSettings('{"colorMode":"speed","color":"#00FF00"}'),
        { colorMode: 'speed', color: '#00ff00' },
    )
    assert.deepEqual(
        normalizeRadarSettings('{"colorMode":"bogus","color":"blue"}'),
        DEFAULT_RADAR_SETTINGS,
    )
    assert.deepEqual(normalizeRadarSettings({ colorMode: 'rcs' }), { ...DEFAULT_RADAR_SETTINGS, colorMode: 'rcs' })
})

test('the on/off state is not part of the saved settings', () => {
    const settings = normalizeRadarSettings('{"enabled":true,"colorMode":"power","color":"#123456"}')
    assert.deepEqual(settings, { colorMode: 'power', color: '#123456' })
    assert.equal('enabled' in DEFAULT_RADAR_SETTINGS, false)
})

test('defaults colour by range with a valid fixed colour', () => {
    assert.equal(DEFAULT_RADAR_SETTINGS.colorMode, 'range')
    assert.ok(parseHexColor(DEFAULT_RADAR_SETTINGS.color))
})

test('columns hold xyz, range and the optional fields', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [[3, 4, 0, -2, 150, 5]]))
    assert.equal(c.count, 1)
    assert.equal(c.range[0], 5)
    assert.equal(c.speed[0], -2)
    assert.equal(c.power[0], 150)
    assert.equal(c.rcs[0], 5)
    const bare = readRadarColumns(cloud(['x', 'y', 'z'], [[1, 0, 0]]))
    assert.equal(bare.speed, null)
    assert.equal(bare.power, null)
    assert.equal(bare.rcs, null)
})

test('columns are null when xyz are missing', () => {
    assert.equal(readRadarColumns(cloud(['x', 'y'], [[1, 2]])), null)
})

test('range colours use turbo over the LiDAR overlay range', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [[15, 0, 0, 0, 0, 0], [90, 0, 0, 0, 0, 0]]))
    const colors = radarPointColors(c, 'range', null)
    assert.deepEqual(colors[0], turboColormap(15 / RADAR_RANGE_MAX_M))
    assert.deepEqual(colors[1], turboColormap(1))
})

test('fixed colour paints every point', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [[5, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0]]))
    const fixed = { r: 1, g: 0, b: 1 }
    assert.deepEqual(radarPointColors(c, 'fixed', fixed), [fixed, fixed])
})

test('speed colours diverge around zero, scaled by the fastest point with a 1 m/s floor', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [
        [5, 0, 0, -4, 0, 0], [5, 0, 0, 2, 0, 0], [5, 0, 0, 0, 0, 0],
    ]))
    const colors = radarPointColors(c, 'speed', null)
    assert.deepEqual(colors[0], divergingColor(-1, true))
    assert.deepEqual(colors[1], divergingColor(0.5, true))
    assert.deepEqual(colors[2], divergingColor(0, true))
    const slow = readRadarColumns(cloud(LIVE_FIELDS, [[5, 0, 0, 0.5, 0, 0]]))
    assert.deepEqual(radarPointColors(slow, 'speed', null)[0], divergingColor(0.5, true))
})

test('power and rcs colours stretch turbo over the sample', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [
        [5, 0, 0, 0, 130, -10], [5, 0, 0, 0, 140, 0], [5, 0, 0, 0, 150, 10],
    ]))
    const power = radarPointColors(c, 'power', null)
    assert.deepEqual(power[0], turboColormap(0))
    assert.deepEqual(power[1], turboColormap(0.5))
    assert.deepEqual(power[2], turboColormap(1))
    const rcs = radarPointColors(c, 'rcs', null)
    assert.deepEqual(rcs[1], turboColormap(0.5))
})

test('a single power value does not divide by zero', () => {
    const c = readRadarColumns(cloud(LIVE_FIELDS, [[5, 0, 0, 0, 140, 0]]))
    const [only] = radarPointColors(c, 'power', null)
    for (const v of [only.r, only.g, only.b]) assert.ok(Number.isFinite(v))
})

test('a mode whose field is missing falls back to range', () => {
    const c = readRadarColumns(cloud(['x', 'y', 'z'], [[15, 0, 0]]))
    for (const mode of ['speed', 'power', 'rcs', 'unknown']) {
        assert.deepEqual(radarPointColors(c, mode, null)[0], turboColormap(15 / RADAR_RANGE_MAX_M))
    }
})

test('fixed mode without a colour falls back to the default colour', () => {
    const c = readRadarColumns(cloud(['x', 'y', 'z'], [[15, 0, 0]]))
    assert.deepEqual(radarPointColors(c, 'fixed', null)[0], parseHexColor(DEFAULT_RADAR_SETTINGS.color))
})

test('frame projects visible points and skips points behind, outside or invalid', () => {
    const m = sensorToCameraMatrix(RADAR, OPTICAL)
    const c = readRadarColumns(cloud(LIVE_FIELDS, [
        [10, 0, 0, 0, 0, 0],         // centre
        [10, 1, 0, 0, 0, 0],         // left of centre
        [-10, 0, 0, 0, 0, 0],        // behind
        [1, 5, 0, 0, 0, 0],          // far outside the image
        [NaN, 0, 0, 0, 0, 0],        // invalid
    ]))
    const frame = buildRadarFrame(c, { matrix: m, intrinsics: K, width: W, height: H, margin: 6, mode: 'range', color: null })
    assert.equal(frame.length, 2)
    assert.equal(frame[0].u, 960)
    assert.equal(frame[0].v, 540)
    assert.equal(frame[1].u, 860)
    assert.deepEqual(frame[0].color, turboColormap(10 / RADAR_RANGE_MAX_M))
    assert.match(frame[0].css, /^rgb\(\d+,\d+,\d+\)$/)
})

test('frame keeps points inside the margin past the image edge', () => {
    const m = sensorToCameraMatrix(RADAR, OPTICAL)
    // u = 960 - 1000 * y / x: -3 is inside a 6 px margin, -10 is not
    const c = readRadarColumns(cloud(['x', 'y', 'z'], [[1, 0.963, 0], [1, 0.97, 0]]))
    const frame = buildRadarFrame(c, { matrix: m, intrinsics: K, width: W, height: H, margin: 6, mode: 'range', color: null })
    assert.equal(frame.length, 1)
})

test('frame is empty without a matrix, intrinsics or columns', () => {
    const m = sensorToCameraMatrix(RADAR, OPTICAL)
    const c = readRadarColumns(cloud(['x', 'y', 'z'], [[10, 0, 0]]))
    const opts = { matrix: m, intrinsics: K, width: W, height: H, margin: 6, mode: 'range', color: null }
    assert.deepEqual(buildRadarFrame(c, { ...opts, matrix: null }), [])
    assert.deepEqual(buildRadarFrame(c, { ...opts, intrinsics: null }), [])
    assert.deepEqual(buildRadarFrame(null, opts), [])
})
