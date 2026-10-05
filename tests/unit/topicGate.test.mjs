// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    TOPIC_POLL_MS, TOPIC_HIDE_AFTER_MS, TOPIC_RETRY_MS, LOCAL_SAMPLE_FRESH_MS,
    createTopicGateState, classifyTopicResponse, applyTopicPoll, shouldPollTopics, decideSection, topicStatusUrl,
} from '../../src/js/topicGate.js'

const RADAR = 'radar/targets'
const LIDAR = 'lidar/points'
const TOPICS = [LIDAR, RADAR]
const T = 1_000_000

const json = (topics) => ({ kind: 'topics', topics })
const status = (radar, lidar = false) => json({
    [RADAR]: { available: radar, age_ms: radar ? 50 : null },
    [LIDAR]: { available: lidar, age_ms: lidar ? 80 : null },
})
const services = (radar, lidar) => [
    { service: 'radarpub', enabled: radar ? 'enabled' : 'disabled' },
    { service: 'lidarpub', enabled: lidar ? 'enabled' : 'disabled' },
]

test('constants match the websrv contract and the agreed timings', () => {
    assert.equal(TOPIC_POLL_MS, 2000)
    assert.equal(TOPIC_HIDE_AFTER_MS, 10000)
    assert.equal(TOPIC_RETRY_MS, 60000)
    assert.equal(LOCAL_SAMPLE_FRESH_MS, 3000)
    assert.equal(topicStatusUrl(TOPICS), '/api/topics/status?topics=lidar/points,radar/targets')
})

test('classify: a JSON topics object is a topic response', () => {
    const body = JSON.stringify({ topics: { [RADAR]: { available: true, age_ms: 12 } } })
    assert.deepEqual(classifyTopicResponse({ status: 200, contentType: 'application/json', body }),
        { kind: 'topics', topics: { [RADAR]: { available: true, age_ms: 12 } } })
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

test('a section shows once its topic is available', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(false), T)          // first request starts the watch
    assert.equal(s.mode, 'topics')
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: false, on: false }), { visible: false, stop: false })
    s = applyTopicPoll(s, status(true), T + 2000)
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: false, on: false }), { visible: true, stop: false })
    assert.deepEqual(decideSection(s, LIDAR, 'lidarpub', null, { visible: false, on: false }), { visible: false, stop: false })
})

test('topic gating ignores the systemd enabled state', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    assert.equal(decideSection(s, RADAR, 'radarpub', services(false, false), { visible: false, on: false }).visible, true)
})

test('a section hides only after its topic is unavailable for 10 s of polls', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    for (let t = T + 2000; t < T + 2000 + TOPIC_HIDE_AFTER_MS; t += 2000) {
        s = applyTopicPoll(s, status(false), t)
        assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: false }).visible, true, `still shown at ${t - T}`)
    }
    s = applyTopicPoll(s, status(false), T + 2000 + TOPIC_HIDE_AFTER_MS)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: false }).visible, false)
})

test('one available poll inside the window restarts the hysteresis', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 2000)
    s = applyTopicPoll(s, status(true), T + 8000)
    s = applyTopicPoll(s, status(false), T + 10000)
    s = applyTopicPoll(s, status(false), T + 18000)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: false }).visible, true)
    s = applyTopicPoll(s, status(false), T + 20000)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: false }).visible, false)
})

test('hiding while the overlay is on stops it, and the section returns with it off', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 2000)
    s = applyTopicPoll(s, status(false), T + 12000)
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }), { visible: false, stop: true })
    s = applyTopicPoll(s, status(true), T + 14000)
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: false, on: false }), { visible: true, stop: false })
})

test('recent samples of the overlay\'s own stream count as available', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, status(true), T)
    s = applyTopicPoll(s, status(false), T + 2000, { [RADAR]: T + 1900 })
    s = applyTopicPoll(s, status(false), T + 12000, { [RADAR]: T + 11500 })
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }).visible, true)
    s = applyTopicPoll(s, status(false), T + 13000, { [RADAR]: T + 9000 })   // 4 s old: not fresh
    s = applyTopicPoll(s, status(false), T + 23000, { [RADAR]: T + 9000 })
    assert.deepEqual(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }), { visible: false, stop: true })
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

test('a successful retry switches to topic gating, keeping shown sections through the hysteresis', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, { kind: 'unsupported' }, T)
    const now = T + TOPIC_RETRY_MS
    s = applyTopicPoll(s, status(false), now, {}, { [RADAR]: true, [LIDAR]: false })
    assert.equal(s.mode, 'topics')
    assert.equal(shouldPollTopics(s, now + 2000), true)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }).visible, true)
    s = applyTopicPoll(s, status(true), now + 2000)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: true, on: true }).visible, true)
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

test('a topic missing from the response counts as unavailable', () => {
    let s = createTopicGateState(TOPICS)
    s = applyTopicPoll(s, json({ [RADAR]: { available: true, age_ms: 10 } }), T)
    assert.equal(decideSection(s, LIDAR, 'lidarpub', null, { visible: false, on: false }).visible, false)
    assert.equal(decideSection(s, RADAR, 'radarpub', null, { visible: false, on: false }).visible, true)
})
