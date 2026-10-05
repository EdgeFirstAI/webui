// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    TOPIC_POLL_MS, TOPIC_RETRY_MS, LOCAL_SAMPLE_FRESH_MS, DEFAULT_REFRESH_MS, PENDING_GRACE_MS,
    createTopicGateState, classifyTopicResponse, applyTopicPoll, shouldPollTopics, decideSection, topicStatusUrl,
} from '../../src/js/topicGate.js'

const RADAR = 'radar/targets'
const LIDAR = 'lidar/points'
const TOPICS = [LIDAR, RADAR]
const T = 1_000_000

const json = (topics, refreshMs = 10000) => ({ kind: 'topics', topics, refreshMs })
const seen = (available, lastSeenMs) => ({ available, last_seen_ms: lastSeenMs })
const status = (radar, lidar = false) => json({
    [RADAR]: radar ? seen(true, 3150) : seen(false, 18000),
    [LIDAR]: lidar ? seen(true, 2000) : seen(false, null),
})
const services = (radar, lidar) => [
    { service: 'radarpub', enabled: radar ? 'enabled' : 'disabled' },
    { service: 'lidarpub', enabled: lidar ? 'enabled' : 'disabled' },
]
const shown = (s, topic = RADAR, on = false) => decideSection(s, topic, 'radarpub', null, { visible: true, on })
const hidden = (s, topic = RADAR) => decideSection(s, topic, 'radarpub', null, { visible: false, on: false })

test('constants match the websrv contract and the agreed timings', () => {
    assert.equal(TOPIC_POLL_MS, 5000)
    assert.equal(TOPIC_RETRY_MS, 60000)
    assert.equal(LOCAL_SAMPLE_FRESH_MS, 3000)
    assert.equal(DEFAULT_REFRESH_MS, 10000)
    assert.equal(PENDING_GRACE_MS, 5000)
    assert.equal(topicStatusUrl(TOPICS), '/api/topics/status?topics=lidar/points,radar/targets')
})

test('classify: a JSON topics object is a topic response with the server refresh period', () => {
    const body = JSON.stringify({
        refresh_ms: 10000, last_cycle_ms: 3120, extra: 'ignored',
        topics: { [RADAR]: { available: true, last_seen_ms: 3150, more: 1 } },
    })
    assert.deepEqual(classifyTopicResponse({ status: 200, contentType: 'application/json', body }),
        { kind: 'topics', topics: { [RADAR]: { available: true, last_seen_ms: 3150, more: 1 } }, refreshMs: 10000 })
})

test('classify: a missing or invalid refresh period uses the default', () => {
    for (const refresh of [undefined, 0, -5, 'x']) {
        const body = JSON.stringify({ refresh_ms: refresh, topics: {} })
        assert.equal(classifyTopicResponse({ status: 200, contentType: 'application/json', body }).refreshMs, DEFAULT_REFRESH_MS)
    }
})

test('classify: 404, HTML fallback and malformed JSON mean the endpoint is unsupported', () => {
    assert.equal(classifyTopicResponse({ status: 404, contentType: 'text/plain', body: 'Not Found' }).kind, 'unsupported')
    assert.equal(classifyTopicResponse({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html>' }).kind, 'unsupported')
    assert.equal(classifyTopicResponse({ status: 200, contentType: 'application/json', body: '{oops' }).kind, 'unsupported')
    assert.equal(classifyTopicResponse({ status: 200, contentType: 'application/json', body: '{"other":1}' }).kind, 'unsupported')
})

test('classify: network failures and server errors are errors', () => {
    assert.equal(classifyTopicResponse(null).kind, 'error')
    assert.equal(classifyTopicResponse({ status: 503, contentType: 'text/plain', body: '' }).kind, 'error')
})

test('unknown before the first response: sections keep their state and nothing stops', () => {
    const s = createTopicGateState(TOPICS)
    assert.equal(s.mode, 'unknown')
    assert.equal(shouldPollTopics(s, T), true)
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', services(true, true), { visible: false, on: false }), { visible: false, stop: false })
})

test('a section shows once websrv has seen its topic', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, json({ [RADAR]: seen(false, null), [LIDAR]: seen(false, null) }), T)
    assert.equal(s.mode, 'topics')
    assert.deepEqual(hidden(s), { visible: false, stop: false })
    s = applyTopicPoll(s, status(true), T + 5000)
    assert.deepEqual(hidden(s), { visible: true, stop: false })
    assert.deepEqual(hidden(s, LIDAR), { visible: false, stop: false })
})

test('topic gating ignores the systemd enabled state', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    assert.equal(decideSection(s, RADAR, 'radarpub', services(false, false), { visible: false, on: false }).visible, true)
})

test('the server availability is used directly: one unavailable response hides', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 5000)
    assert.equal(shown(s).visible, false)
})

test('hiding while the overlay is on stops it, and the section returns with it off', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 5000)
    assert.deepEqual(shown(s, RADAR, true), { visible: false, stop: true })
    s = applyTopicPoll(s, status(true), T + 10000)
    assert.deepEqual(hidden(s), { visible: true, stop: false })
})

test('a not-yet-sampled topic does not hide a visible section within one refresh plus grace', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, { kind: 'unsupported' }, T)
    const now = T + TOPIC_RETRY_MS
    const pending = json({ [RADAR]: seen(false, null), [LIDAR]: seen(false, null) })
    s = applyTopicPoll(s, pending, now, {}, { [RADAR]: true, [LIDAR]: false })
    assert.deepEqual(shown(s, RADAR, true), { visible: true, stop: false })
    s = applyTopicPoll(s, pending, now + DEFAULT_REFRESH_MS + PENDING_GRACE_MS - 1)
    assert.equal(shown(s, RADAR, true).visible, true)
    assert.equal(hidden(s, LIDAR).visible, false)
    s = applyTopicPoll(s, pending, now + DEFAULT_REFRESH_MS + PENDING_GRACE_MS)
    assert.deepEqual(shown(s, RADAR, true), { visible: false, stop: true })
})

test('the pending window follows the server refresh period', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    const pending = json({ [RADAR]: seen(false, null) }, 20000)
    s = applyTopicPoll(s, pending, T + 5000)
    s = applyTopicPoll(s, pending, T + 5000 + 20000 + PENDING_GRACE_MS - 1)
    assert.equal(shown(s).visible, true)
    s = applyTopicPoll(s, pending, T + 5000 + 20000 + PENDING_GRACE_MS)
    assert.equal(shown(s).visible, false)
})

test('a topic seen before but now gone hides at once, even if it was pending', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, json({ [RADAR]: seen(false, null) }), T + 5000)
    assert.equal(shown(s).visible, true)
    s = applyTopicPoll(s, json({ [RADAR]: seen(false, 16000) }), T + 10000)
    assert.equal(shown(s).visible, false)
})

test('recent samples of the overlay\'s own stream count as available', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 5000, { [RADAR]: T + 4900 })
    assert.equal(shown(s, RADAR, true).visible, true)
    s = applyTopicPoll(s, status(false), T + 10000, { [RADAR]: T + 6000 })   // 4 s old: not fresh
    assert.deepEqual(shown(s, RADAR, true), { visible: false, stop: true })
})

test('404 or non-JSON on the first poll falls back to the service gate', () => {
    for (const result of [{ kind: 'unsupported' }, { kind: 'error' }]) {
        let s = createTopicGateState(TOPICS)
        s = applyTopicPoll(s, result, T)
        assert.equal(s.mode, 'service')
        assert.deepEqual(decideSection(s, RADAR, 'radarpub', services(true, false), { visible: false, on: false }), { visible: true, stop: false })
        assert.deepEqual(decideSection(s, LIDAR, 'lidarpub', services(true, false), { visible: false, on: false }), { visible: false, stop: false })
        assert.deepEqual(decideSection(s, RADAR, 'radarpub', services(false, false), { visible: true, on: true }), { visible: false, stop: true })
        assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: false, on: false }), { visible: false, stop: false })
    }
})

test('fallback stops polling and retries once after 60 s', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, { kind: 'unsupported' }, T)
    assert.equal(shouldPollTopics(s, T + 2000), false)
    assert.equal(shouldPollTopics(s, T + TOPIC_RETRY_MS - 1), false)
    assert.equal(shouldPollTopics(s, T + TOPIC_RETRY_MS), true)
    s = applyTopicPoll(s, { kind: 'unsupported' }, T + TOPIC_RETRY_MS)
    assert.equal(s.mode, 'service')
    assert.equal(shouldPollTopics(s, T + 10 * TOPIC_RETRY_MS), false)
})

test('a successful retry switches to topic gating', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, { kind: 'unsupported' }, T)
    const now = T + TOPIC_RETRY_MS
    s = applyTopicPoll(s, status(true), now, {}, { [RADAR]: true, [LIDAR]: false })
    assert.equal(s.mode, 'topics')
    assert.equal(shouldPollTopics(s, now + TOPIC_POLL_MS), true)
    assert.deepEqual(shown(s, RADAR, true), { visible: true, stop: false })
    assert.equal(hidden(s, LIDAR).visible, false)
})

test('errors after a successful poll hold the state and keep polling', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    for (let i = 1; i <= 10; i++) {
        s = applyTopicPoll(s, { kind: i % 2 ? 'error' : 'unsupported' }, T + i * 2000)
        assert.equal(s.mode, 'topics')
        assert.equal(shouldPollTopics(s, T + i * 2000), true)
        assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }), { visible: true, stop: false })
    }
})

test('a topic missing from the response counts as not yet sampled', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, json({ [RADAR]: seen(true, 10) }), T)
    assert.equal(hidden(s, LIDAR).visible, false)
    assert.equal(hidden(s).visible, true)
    s = applyTopicPoll(s, json({}), T + 5000)
    assert.equal(shown(s).visible, true)
    s = applyTopicPoll(s, json({}), T + 5000 + DEFAULT_REFRESH_MS + PENDING_GRACE_MS)
    assert.equal(shown(s).visible, false)
})
