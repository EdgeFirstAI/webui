// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Shared point-cloud colour helpers used by the LiDAR and Radar viewers.
// Every function returns { r, g, b } with each channel in [0, 1] unless
// stated otherwise, and takes an explicit `isDark` flag so callers can cache
// the theme state and avoid DOM lookups in hot paths.

import * as THREE from './three.js'

export { turboColormap, distanceColor, neutralGrey, divergingColor } from './colorMaps.js'

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
