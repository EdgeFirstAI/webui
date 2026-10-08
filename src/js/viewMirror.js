// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// View-only mirroring for the camera, LiDAR and radar pages. The mirror is
// applied to what is drawn (a CSS transform on the composited camera layers,
// a parent group scale in the 3D views) and never to the sensor data.
// No DOM or three.js dependency.

export const MIRROR_MODES = ['none', 'horizontal', 'vertical', 'both']

export const DEFAULT_MIRROR = 'none'

/** A saved or selected value, or `none` when it is not a mirror mode. */
export function normalizeMirror(value) {
    return MIRROR_MODES.includes(value) ? value : DEFAULT_MIRROR
}

/**
 * Scale factors for a mirror mode. `x` flips left and right, `y` flips up
 * and down; each is 1 or -1.
 * @returns {{x:number, y:number}}
 */
export function mirrorScale(mode) {
    const m = normalizeMirror(mode)
    return {
        x: m === 'horizontal' || m === 'both' ? -1 : 1,
        y: m === 'vertical' || m === 'both' ? -1 : 1,
    }
}

/** CSS `transform` value for a mirror mode; empty when not mirrored. */
export function mirrorCssTransform(mode) {
    const { x, y } = mirrorScale(mode)
    return x === 1 && y === 1 ? '' : `scale(${x}, ${y})`
}

// Storage defaults to localStorage, resolved inside each try: reading
// globalThis.localStorage itself throws when site storage is blocked.

/** The mirror mode saved under `key`, or `none`. */
export function loadMirror(key, storage) {
    try {
        return normalizeMirror((storage ?? globalThis.localStorage).getItem(key))
    } catch {
        return DEFAULT_MIRROR
    }
}

/** Save a mirror mode under `key`; unavailable storage keeps it for this page only. */
export function saveMirror(key, mode, storage) {
    try {
        (storage ?? globalThis.localStorage).setItem(key, normalizeMirror(mode))
    } catch { /* storage unavailable */ }
}
