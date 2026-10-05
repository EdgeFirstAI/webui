// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Binary WebSocket that reconnects with exponential backoff until stopped.
// No DOM dependency: the WebSocket class and timers can be injected.

const DEFAULT_MIN_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 8000

/**
 * Open `url` and reconnect after each close until `stop()` is called or
 * `shouldReconnect()` returns false when the socket closes. The delay starts
 * at `minDelayMs`, doubles up to `maxDelayMs` and resets after an open. At
 * most one socket is open or connecting at a time, and `stop()` cancels a
 * pending reconnect as well as closing the socket.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {(event: MessageEvent) => void} options.onmessage
 * @param {string} [options.label] name used in log messages
 * @param {() => boolean} [options.shouldReconnect]
 * @param {number} [options.minDelayMs]
 * @param {number} [options.maxDelayMs]
 * @param {typeof WebSocket} [options.WebSocketImpl]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 * @param {{log: Function, warn: Function}} [options.logger]
 * @returns {{readonly socket: WebSocket|null, readonly stopped: boolean, stop: () => void}}
 */
export default function createReconnectingSocket({
    url,
    onmessage,
    label = url,
    shouldReconnect = () => true,
    minDelayMs = DEFAULT_MIN_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    WebSocketImpl = globalThis.WebSocket,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    logger = console,
}) {
    let ws = null
    let timer = null
    let stopped = false
    let delay = minDelayMs

    function detach(socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
    }

    function connect() {
        timer = null
        if (stopped || ws) return
        const socket = new WebSocketImpl(url)
        socket.binaryType = 'arraybuffer'
        socket.onmessage = onmessage
        socket.onerror = (e) => logger.warn(`${label} WebSocket error:`, e)
        socket.onopen = () => { delay = minDelayMs }
        socket.onclose = () => {
            detach(socket)
            if (ws === socket) ws = null
            if (stopped) return
            if (!shouldReconnect()) {
                stopped = true
                return
            }
            logger.log(`${label} WebSocket closed — reconnecting in ${delay / 1000}s`)
            clearTimer(timer)
            timer = setTimer(connect, delay)
            delay = Math.min(delay * 2, maxDelayMs)
        }
        ws = socket
    }

    function stop() {
        stopped = true
        if (timer !== null) {
            clearTimer(timer)
            timer = null
        }
        if (ws) {
            const socket = ws
            ws = null
            detach(socket)
            socket.close()
        }
    }

    connect()

    return {
        get socket() { return ws },
        get stopped() { return stopped },
        stop,
    }
}
