// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Gate page sections on whether their topics are being published, from
// websrv's GET /api/topics/status, falling back to the service-enabled gate
// on websrv builds without that endpoint. No DOM dependency: the caller
// fetches, classifies the response and applies the decisions.

import { gateOverlay } from './serviceGate.js'

/** Interval between /api/topics/status polls. */
export const TOPIC_POLL_MS = 2000
/** How long a topic must stay unavailable before its section hides. */
export const TOPIC_HIDE_AFTER_MS = 10000
/** Delay before retrying the endpoint once after falling back. */
export const TOPIC_RETRY_MS = 60000
/** A sample of the overlay's own stream this recent counts as available. */
export const LOCAL_SAMPLE_FRESH_MS = 3000

/** Endpoint URL for one request covering every topic. */
export function topicStatusUrl(topics) {
    return `/api/topics/status?topics=${topics.join(',')}`
}

/**
 * @param {string[]} topics `/api/rt/<topic>` keys
 * @returns {object} gate state: mode 'unknown' until the first response,
 *          then 'topics' (endpoint answers) or 'service' (fallback)
 */
export function createTopicGateState(topics) {
    return { topics: [...topics], mode: 'unknown', retryAt: null, retried: false, entries: {} }
}

/**
 * Classify a response from the endpoint.
 * @param {{status:number, contentType:string|null, body:string}|null} res null for a network error
 * @returns {{kind:'topics', topics:object}|{kind:'unsupported'}|{kind:'error'}}
 *          'unsupported' for 404 or anything that is not the JSON contract
 *          (older websrv serves its HTML fallback), 'error' for network
 *          failures and server errors
 */
export function classifyTopicResponse(res) {
    if (!res) return { kind: 'error' }
    if (res.status === 404) return { kind: 'unsupported' }
    if (res.status < 200 || res.status >= 300) return { kind: 'error' }
    if (!/\bjson\b/i.test(res.contentType || '')) return { kind: 'unsupported' }
    let parsed
    try { parsed = JSON.parse(res.body) } catch { return { kind: 'unsupported' } }
    if (!parsed || typeof parsed.topics !== 'object' || parsed.topics === null) return { kind: 'unsupported' }
    return { kind: 'topics', topics: parsed.topics }
}

/**
 * Fold one poll result into the gate state.
 * @param {object} state from createTopicGateState
 * @param {ReturnType<typeof classifyTopicResponse>} result
 * @param {number} nowMs
 * @param {Object<string, number>} [localSamples] arrival time of the newest
 *        sample of each topic's own overlay stream, when that overlay is on
 * @param {Object<string, boolean>} [currentVisible] section visibility, used
 *        to seed the topic state when switching from the fallback, so shown
 *        sections get the same hysteresis
 * @returns {object} new state
 */
export function applyTopicPoll(state, result, nowMs, localSamples = {}, currentVisible = {}) {
    if (result.kind !== 'topics') {
        if (state.mode === 'topics') return state
        if (state.mode === 'unknown') return { ...state, mode: 'service', retryAt: nowMs + TOPIC_RETRY_MS }
        return { ...state, retried: true }
    }
    const entering = state.mode !== 'topics'
    const entries = {}
    for (const topic of state.topics) {
        const prev = state.entries[topic] ||
            { visible: entering && Boolean(currentVisible[topic]), unavailableSince: null }
        const local = localSamples[topic]
        const available = Boolean(result.topics[topic]?.available) ||
            (local != null && nowMs - local <= LOCAL_SAMPLE_FRESH_MS)
        if (available) {
            entries[topic] = { visible: true, unavailableSince: null }
        } else {
            const since = prev.unavailableSince ?? nowMs
            entries[topic] = {
                visible: prev.visible && nowMs - since < TOPIC_HIDE_AFTER_MS,
                unavailableSince: since,
            }
        }
    }
    return { ...state, mode: 'topics', retryAt: null, entries }
}

/** Whether the endpoint should be polled now. */
export function shouldPollTopics(state, nowMs) {
    if (state.mode !== 'service') return true
    return !state.retried && state.retryAt != null && nowMs >= state.retryAt
}

/**
 * Visibility of a section and whether its overlay must be stopped.
 * Unknown (before the first response) changes nothing; the fallback uses
 * the service-enabled gate; topic mode shows a section while its topic is
 * available and stops an overlay that is on when its section hides.
 * @param {object} state
 * @param {string} topic
 * @param {string} service systemd service used by the fallback
 * @param {Array<object>|null} serviceStatuses window.serviceCache.serviceStatuses
 * @param {{visible:boolean, on:boolean}} current
 * @returns {{visible:boolean, stop:boolean}}
 */
export function decideSection(state, topic, service, serviceStatuses, current) {
    if (state.mode === 'unknown') return { visible: current.visible, stop: false }
    if (state.mode === 'service') return gateOverlay(serviceStatuses, service, current)
    const visible = Boolean(state.entries[topic]?.visible)
    return { visible, stop: !visible && current.on }
}
