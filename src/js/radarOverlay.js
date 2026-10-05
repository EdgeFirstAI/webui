// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Radar targets drawn over the camera image: colour modes, settings,
// per-point colours and projection. No DOM or three.js dependency.

import { readField } from './pointcloud2.js'
import { turboColormap, divergingColor } from './colorMaps.js'
import { projectToImage } from './projection.js'

/** Range that maps onto the full turbo scale; matches the LiDAR overlay. */
export const RADAR_RANGE_MAX_M = 30

/** Smallest speed that maps onto the ends of the diverging scale. */
export const RADAR_SPEED_FLOOR_MPS = 1

/**
 * Colour modes. `field` is the PointCloud2 field the mode needs; null means
 * the mode is always offered.
 */
export const RADAR_COLOR_MODES = [
    { value: 'fixed', label: 'Fixed', field: null },
    { value: 'range', label: 'Range', field: null },
    { value: 'speed', label: 'Speed', field: 'speed' },
    { value: 'power', label: 'Power', field: 'power' },
    { value: 'rcs',   label: 'RCS',   field: 'rcs' },
]

export const DEFAULT_RADAR_SETTINGS = Object.freeze({
    colorMode: 'range',
    color: '#ff00ff',
})

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * The colour modes a PointCloud2 with these fields supports.
 * @param {Object<string, object>} fieldMap
 */
export function availableRadarColorModes(fieldMap) {
    return RADAR_COLOR_MODES.filter((mode) => !mode.field || Boolean(fieldMap[mode.field]))
}

/**
 * Parse `#rrggbb` (the value of an `<input type="color">`).
 * @returns {{r:number,g:number,b:number}|null}
 */
export function parseHexColor(hex) {
    if (typeof hex !== 'string' || !HEX_COLOR.test(hex)) return null
    const n = parseInt(hex.slice(1), 16)
    return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 }
}

/**
 * Saved colour settings from storage (a JSON string or an object), with each
 * invalid or missing value replaced by its default. The overlay's on/off
 * state is not saved, like the other camera overlays.
 * @returns {{colorMode:string, color:string}}
 */
export function normalizeRadarSettings(raw) {
    let obj = raw
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw) } catch { obj = null }
    }
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_RADAR_SETTINGS }
    return {
        colorMode: RADAR_COLOR_MODES.some((m) => m.value === obj.colorMode)
            ? obj.colorMode : DEFAULT_RADAR_SETTINGS.colorMode,
        color: parseHexColor(obj.color) ? obj.color.toLowerCase() : DEFAULT_RADAR_SETTINGS.color,
    }
}

/**
 * Copy the fields the overlay needs out of a parsed PointCloud2.
 * @param {object} parsed result of parsePointCloud2
 * @returns {{count:number, x:Float32Array, y:Float32Array, z:Float32Array, range:Float32Array,
 *            speed:Float32Array|null, power:Float32Array|null, rcs:Float32Array|null}|null}
 *          null when x, y or z is missing
 */
export function readRadarColumns(parsed) {
    const { totalPoints: n, fieldMap } = parsed
    if (!fieldMap.x || !fieldMap.y || !fieldMap.z) return null
    const read = (name) => {
        const field = fieldMap[name]
        if (!field) return null
        const out = new Float32Array(n)
        for (let i = 0; i < n; i++) out[i] = readField(parsed, i, field)
        return out
    }
    const x = read('x'), y = read('y'), z = read('z')
    const range = new Float32Array(n)
    for (let i = 0; i < n; i++) range[i] = Math.sqrt(x[i] * x[i] + y[i] * y[i] + z[i] * z[i])
    return { count: n, x, y, z, range, speed: read('speed'), power: read('power'), rcs: read('rcs') }
}

/**
 * A colour for each point. Range uses turbo over 0–RADAR_RANGE_MAX_M; speed
 * uses the diverging scale (approaching negative → blue, receding positive
 * → red) normalised by the fastest point, at least RADAR_SPEED_FLOOR_MPS;
 * power and RCS stretch turbo over the sample's min–max. A mode whose field
 * is missing falls back to range.
 * @param {ReturnType<typeof readRadarColumns>} cols
 * @param {string} mode
 * @param {{r:number,g:number,b:number}|null} fixed colour for `fixed` mode
 */
export function radarPointColors(cols, mode, fixed) {
    const n = cols.count
    const out = new Array(n)
    if (mode === 'fixed') {
        const c = fixed || parseHexColor(DEFAULT_RADAR_SETTINGS.color)
        out.fill(c)
        return out
    }
    if (mode === 'speed' && cols.speed) {
        let maxAbs = RADAR_SPEED_FLOOR_MPS
        for (let i = 0; i < n; i++) {
            const s = Math.abs(cols.speed[i])
            if (s > maxAbs) maxAbs = s
        }
        for (let i = 0; i < n; i++) out[i] = divergingColor(cols.speed[i] / maxAbs, true)
        return out
    }
    if ((mode === 'power' || mode === 'rcs') && cols[mode]) {
        const values = cols[mode]
        let min = Infinity, max = -Infinity
        for (let i = 0; i < n; i++) {
            if (values[i] < min) min = values[i]
            if (values[i] > max) max = values[i]
        }
        const span = Math.max(max - min, 1e-3)
        for (let i = 0; i < n; i++) out[i] = turboColormap((values[i] - min) / span)
        return out
    }
    for (let i = 0; i < n; i++) out[i] = turboColormap(cols.range[i] / RADAR_RANGE_MAX_M)
    return out
}

function colorToCSS(c) {
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
}

/**
 * Project and colour the points that land on the image.
 * @param {ReturnType<typeof readRadarColumns>|null} cols
 * @param {{matrix:Float64Array|null, intrinsics:object|null, width:number, height:number,
 *          margin:number, mode:string, color:{r:number,g:number,b:number}|null}} opts
 *        `margin` keeps points whose dot still overlaps the image edge
 * @returns {Array<{u:number, v:number, depth:number, color:object, css:string}>}
 *          farthest first, so nearer dots are drawn on top
 */
export function buildRadarFrame(cols, { matrix, intrinsics, width, height, margin, mode, color }) {
    if (!cols || !matrix || !intrinsics) return []
    const colors = radarPointColors(cols, mode, color)
    const frame = []
    for (let i = 0; i < cols.count; i++) {
        const x = cols.x[i], y = cols.y[i], z = cols.z[i]
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
        const p = projectToImage(matrix, intrinsics, x, y, z)
        if (!p) continue
        if (p.u < -margin || p.u > width + margin || p.v < -margin || p.v > height + margin) continue
        frame.push({ u: p.u, v: p.v, depth: p.depth, color: colors[i], css: colorToCSS(colors[i]) })
    }
    frame.sort((a, b) => b.depth - a.depth)
    return frame
}
