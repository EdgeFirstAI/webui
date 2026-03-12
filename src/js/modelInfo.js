// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CdrReader } from './Cdr.js'

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 8000
const BG_PATTERN = /^(background|bg)$/i

/**
 * ModelInfo singleton — subscribes to /api/rt/model/info/ and exposes:
 *   - labels: string[] of model class labels
 *   - numClasses: number of drawable classes (labels.length)
 *   - isBackground(classId): whether a class should be treated as background
 *   - hasBackground: whether any background class was detected
 *   - onChange(callback): register a listener for when model info updates
 */
const ModelInfo = {
    labels: [],
    numClasses: 0,
    hasBackground: false,

    _listeners: [],
    _socket: null,
    _stopped: false,
    _reconnectDelay: RECONNECT_MIN_MS,
    _reconnectTimer: null,
    _bgIndices: new Set(),

    /**
     * Returns true if the given class index should be treated as background.
     * Background is detected in two ways:
     *   1. Label matches "background" or "bg" (case-insensitive)
     *   2. Class index >= numClasses (beyond the known label set)
     */
    isBackground(classId) {
        if (this.numClasses > 0 && classId >= this.numClasses) return true
        return this._bgIndices.has(classId)
    },

    /**
     * Register a callback invoked when model info is received or updated.
     * Callback receives this ModelInfo object.
     */
    onChange(callback) {
        this._listeners.push(callback)
    },

    /**
     * Open the WebSocket connection to the model info topic.
     * Safe to call multiple times — will not open duplicate connections.
     */
    connect(socketUrl) {
        if (this._socket) return
        this._stopped = false
        this._doConnect(socketUrl)
    },

    /**
     * Close the connection and stop reconnection.
     */
    close() {
        this._stopped = true
        clearTimeout(this._reconnectTimer)
        if (this._socket) {
            this._socket.onclose = null
            this._socket.close()
            this._socket = null
        }
    },

    _doConnect(url) {
        if (this._stopped) return

        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
            this._reconnectDelay = RECONNECT_MIN_MS
        }

        ws.onmessage = (event) => {
            try {
                this._parse(event.data)
            } catch (error) {
                console.error('Failed to deserialize model info:', error)
            }
        }

        ws.onerror = (e) => {
            console.warn('ModelInfo WebSocket error:', e)
        }

        ws.onclose = () => {
            this._socket = null
            if (this._stopped) return
            this._reconnectTimer = setTimeout(() => this._doConnect(url), this._reconnectDelay)
            this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX_MS)
        }

        this._socket = ws
    },

    _parse(arrayBuffer) {
        const dataView = new DataView(arrayBuffer)
        const reader = new CdrReader(dataView)

        // Header
        reader.uint32() // stamp.sec
        reader.uint32() // stamp.nanosec
        reader.string() // frame_id

        this.inputShape = reader.uint32Array()
        this.inputType = reader.uint8()
        this.outputShape = reader.uint32Array()
        this.outputType = reader.uint8()

        const labels = reader.stringArray()

        this.modelType = reader.string()
        this.modelFormat = reader.string()
        this.modelName = reader.string()

        // Detect background labels (explicit match on label text)
        const bgIndices = new Set()
        for (let i = 0; i < labels.length; i++) {
            if (BG_PATTERN.test(labels[i].trim())) {
                bgIndices.add(i)
            }
        }

        // Detect implicit background: output_shape's class dimension may
        // exceed the label count when the model includes an unlabelled
        // background class (typically the last output channel)
        const outputClasses = this.outputShape.length > 0
            ? this.outputShape[this.outputShape.length - 1] : 0
        const hasImplicitBg = outputClasses > labels.length

        this.labels = labels
        this.numClasses = labels.length
        this._bgIndices = bgIndices
        this.hasBackground = bgIndices.size > 0 || hasImplicitBg

        // Notify listeners
        for (const cb of this._listeners) {
            try { cb(this) } catch (e) { console.error('ModelInfo listener error:', e) }
        }
    },
}

export default ModelInfo
