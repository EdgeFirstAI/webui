// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Shared point-cloud colour helpers used by the LiDAR and Radar viewers.
// Every function returns { r, g, b } with each channel in [0, 1] unless
// stated otherwise, and takes an explicit `isDark` flag so callers can cache
// the theme state and avoid DOM lookups in hot paths.

import * as THREE from './three.js'

/**
 * Polynomial approximation of the Turbo colourmap.
 * Input: t in [0, 1]. Output: { r, g, b } each in [0, 1].
 */
export function turboColormap(t) {
    t = Math.max(0, Math.min(1, t))

    const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))
    const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))
    const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))

    return {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b))
    }
}

/**
 * Apply the distance colourmap. In dark mode we use turbo directly; in light
 * mode we darken and saturate the output so points are vivid against the
 * bright background.
 */
export function distanceColor(t, isDark) {
    const c = turboColormap(t)
    if (isDark) return c

    // Light mode: increase saturation and darken to improve contrast
    const max = Math.max(c.r, c.g, c.b, 1e-6)
    const boost = 1.0 / max           // normalise so the brightest channel = 1
    let r = c.r * boost
    let g = c.g * boost
    let b = c.b * boost

    // Then darken by 30 % so the colours are rich, not washed-out
    const darken = 0.70
    r *= darken
    g *= darken
    b *= darken

    return {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b))
    }
}

/**
 * Generate a distinct colour for a cluster/track/instance ID using
 * golden-angle hue spacing. IDs <= 0 (noise / unassigned) are grey.
 */
export function clusterColor(id, isDark) {
    if (id <= 0) return isDark ? { r: 0.3, g: 0.3, b: 0.35 } : { r: 0.6, g: 0.6, b: 0.65 }

    // Golden angle gives good hue separation between adjacent IDs
    const hue = (id * 137.508) % 360
    const sat = isDark ? 0.75 : 0.85
    const light = isDark ? 0.60 : 0.45

    // HSL → RGB
    const c = (1 - Math.abs(2 * light - 1)) * sat
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = light - c / 2
    let r, g, b
    if (hue < 60) { r = c; g = x; b = 0 }
    else if (hue < 120) { r = x; g = c; b = 0 }
    else if (hue < 180) { r = 0; g = c; b = x }
    else if (hue < 240) { r = 0; g = x; b = c }
    else if (hue < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    return { r: r + m, g: g + m, b: b + m }
}

/**
 * Fixed colour — lavender for dark theme, deep purple for light theme.
 * Returns a THREE.Color.
 */
export function getFixedColor(isDark) {
    return isDark ? new THREE.Color(0xE6E6FA) : new THREE.Color(0x3E3371)
}

/**
 * Neutral grey used for background / unassigned points, as a single channel
 * value (r = g = b).
 */
export function neutralGrey(isDark) {
    return isDark ? 0.35 : 0.7
}

/**
 * Resolve the current theme to a boolean (hits DOM + matchMedia).
 * Call sparingly — cache the result and refresh on `themechange`.
 */
export function resolveIsDark() {
    const theme = document.documentElement.getAttribute('data-theme') || 'auto'
    return window.ThemeManager ? window.ThemeManager.isDark(theme) : true
}

/**
 * Read the CSS variable --color-bg-base from the root element and return a
 * THREE.Color. Falls back to a sensible dark/light default.
 */
export function getBgColorFromCSS(isDark) {
    const style = getComputedStyle(document.documentElement)
    const raw = style.getPropertyValue('--color-bg-base').trim()
    if (raw) {
        try {
            return new THREE.Color(raw)
        } catch { /* fall through */ }
    }
    return isDark ? new THREE.Color(0x1a1625) : new THREE.Color(0xf0f2f5)
}

/**
 * Diverging colourmap for signed quantities such as radial speed.
 * Input: s in [-1, 1]. Negative values (approaching) ramp to blue, positive
 * values (receding) ramp to red, and zero is a neutral grey.
 */
export function divergingColor(s, isDark) {
    s = Math.max(-1, Math.min(1, s))
    const grey = neutralGrey(isDark) + (isDark ? 0.25 : -0.1)
    const neg = isDark ? { r: 0.30, g: 0.55, b: 1.00 } : { r: 0.10, g: 0.35, b: 0.85 }
    const pos = isDark ? { r: 1.00, g: 0.35, b: 0.30 } : { r: 0.80, g: 0.15, b: 0.10 }
    const target = s < 0 ? neg : pos
    const t = Math.abs(s)
    return {
        r: grey + (target.r - grey) * t,
        g: grey + (target.g - grey) * t,
        b: grey + (target.b - grey) * t
    }
}
