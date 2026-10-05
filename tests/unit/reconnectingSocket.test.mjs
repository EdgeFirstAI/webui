// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import createReconnectingSocket from '../../src/js/reconnectingSocket.js'

const CONNECTING = 0
const OPEN = 1
const CLOSED = 3

/** Fake WebSocket that records every instance and lets the test drive events. */
function fakeSocketClass() {
    const sockets = []
    class FakeWebSocket {
        constructor(url) {
            this.url = url
            this.readyState = CONNECTING
            this.closeCalls = 0
            this.onopen = null
            this.onclose = null
            this.onmessage = null
            this.onerror = null
            sockets.push(this)
        }
        open() { this.readyState = OPEN; if (this.onopen) this.onopen({}) }
        message(data) { if (this.onmessage) this.onmessage({ data }) }
        /** The server or network drops the connection. */
        drop() { this.readyState = CLOSED; if (this.onclose) this.onclose({}) }
        close() { this.closeCalls++; this.readyState = CLOSED }
    }
    FakeWebSocket.OPEN = OPEN
    FakeWebSocket.CONNECTING = CONNECTING
    return { FakeWebSocket, sockets }
}

/** Fake timers: run() fires every pending timer once. */
function fakeTimers() {
    let next = 1
    const pending = new Map()
    return {
        setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id },
        clearTimer: (id) => { pending.delete(id) },
        pending,
        run() {
            const due = [...pending.entries()]
            pending.clear()
            for (const [, t] of due) t.fn()
            return due.map(([, t]) => t.ms)
        },
    }
}

const quiet = { log() {}, warn() {} }

function make(extra = {}) {
    const { FakeWebSocket, sockets } = fakeSocketClass()
    const timers = fakeTimers()
    const received = []
    const options = {
        url: '/api/rt/radar/targets/',
        label: 'test',
        onmessage: (e) => received.push(e.data),
        WebSocketImpl: FakeWebSocket,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        logger: quiet,
        ...extra,
    }
    return { sockets, timers, received, options }
}

test('opens one binary socket and delivers messages', () => {
    const { sockets, received, options } = make()
    const handle = createReconnectingSocket(options)
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].binaryType, 'arraybuffer')
    assert.equal(handle.socket, sockets[0])
    sockets[0].open()
    sockets[0].message('a')
    assert.deepEqual(received, ['a'])
})

test('reconnects after a drop with doubling backoff capped at the maximum', () => {
    const { sockets, timers, options } = make({ minDelayMs: 1000, maxDelayMs: 4000 })
    createReconnectingSocket(options)
    const delays = []
    for (let i = 0; i < 4; i++) {
        sockets.at(-1).drop()
        delays.push(...timers.run())
    }
    assert.deepEqual(delays, [1000, 2000, 4000, 4000])
    assert.equal(sockets.length, 5)
})

test('a successful open resets the backoff', () => {
    const { sockets, timers, options } = make({ minDelayMs: 1000, maxDelayMs: 8000 })
    createReconnectingSocket(options)
    sockets.at(-1).drop()
    timers.run()
    sockets.at(-1).drop()
    assert.deepEqual(timers.run(), [2000])
    sockets.at(-1).open()
    sockets.at(-1).drop()
    assert.deepEqual(timers.run(), [1000])
})

test('stop during backoff opens nothing later', () => {
    const { sockets, timers, options } = make()
    const handle = createReconnectingSocket(options)
    sockets[0].drop()
    assert.equal(timers.pending.size, 1)
    handle.stop()
    assert.equal(timers.pending.size, 0)
    timers.run()
    assert.equal(sockets.length, 1)
    assert.equal(handle.socket, null)
})

test('restart during backoff results in exactly one socket', () => {
    const { sockets, timers, options } = make()
    const first = createReconnectingSocket(options)
    sockets[0].drop()
    first.stop()
    const second = createReconnectingSocket(options)
    timers.run()
    const live = sockets.filter((s) => s.readyState !== CLOSED)
    assert.equal(live.length, 1)
    assert.equal(second.socket, live[0])
    assert.equal(first.socket, null)
})

test('stop closes the open socket and silences its handlers', () => {
    const { sockets, timers, received, options } = make()
    const handle = createReconnectingSocket(options)
    const ws = sockets[0]
    ws.open()
    handle.stop()
    assert.equal(ws.closeCalls, 1)
    assert.equal(ws.onmessage, null)
    assert.equal(ws.onclose, null)
    ws.message('late')
    assert.deepEqual(received, [])
    assert.equal(timers.pending.size, 0)
    handle.stop()
    assert.equal(ws.closeCalls, 1)
})

test('shouldReconnect false at close time stops reconnecting', () => {
    let allow = true
    const { sockets, timers, options } = make({ shouldReconnect: () => allow })
    const handle = createReconnectingSocket(options)
    allow = false
    sockets[0].drop()
    assert.equal(timers.pending.size, 0)
    assert.equal(handle.socket, null)
    assert.equal(handle.stopped, true)
})

test('a backoff timer firing while a socket is open does not open a second one', () => {
    const { sockets, timers, options } = make()
    const handle = createReconnectingSocket(options)
    sockets[0].drop()
    const stale = [...timers.pending.values()][0].fn
    timers.run()
    assert.equal(sockets.length, 2)
    stale()
    assert.equal(sockets.length, 2)
    assert.equal(handle.socket, sockets[1])
})
