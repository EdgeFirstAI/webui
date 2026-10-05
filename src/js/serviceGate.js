// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Service-enabled gating for page sections, decided from the
// window.serviceCache.serviceStatuses array. No DOM dependency.

/**
 * Whether a service is enabled in systemd, by the same rule as
 * serviceCache.isServiceEnabled, or 'unknown' before the first status
 * fetch (statuses not yet an array).
 * @param {Array<{service:string, enabled:string}>|null|undefined} statuses
 * @param {string} service
 * @returns {'enabled'|'disabled'|'unknown'}
 */
export function serviceState(statuses, service) {
    if (!Array.isArray(statuses)) return 'unknown'
    const entry = statuses.find((s) => s.service === service)
    return entry?.enabled === 'enabled' ? 'enabled' : 'disabled'
}

/**
 * Visibility of an overlay section gated on its backing service, and
 * whether a running overlay must be stopped. An enabled service shows the
 * section and leaves the overlay as it is (off after re-enabling); a
 * disabled service hides it and stops an overlay that is on; unknown
 * statuses change nothing, so the section does not flash.
 * @param {Array<object>|null|undefined} statuses
 * @param {string} service
 * @param {{visible:boolean, on:boolean}} current
 * @returns {{visible:boolean, stop:boolean}}
 */
export function gateOverlay(statuses, service, { visible, on }) {
    const state = serviceState(statuses, service)
    if (state === 'unknown') return { visible, stop: false }
    if (state === 'enabled') return { visible: true, stop: false }
    return { visible: false, stop: on }
}
