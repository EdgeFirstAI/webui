// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Point-cloud colour maps with no DOM or three.js dependency. Every function
// returns { r, g, b } with each channel in [0, 1] unless stated otherwise.

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
 * Neutral grey used for background / unassigned points, as a single channel
 * value (r = g = b).
 */
export function neutralGrey(isDark) {
    return isDark ? 0.35 : 0.7
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
