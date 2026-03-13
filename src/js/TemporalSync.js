// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_BASE_INTERVAL = 33.3
const INITIAL_BUFFER_CAPACITY = 5
const MAX_BUFFER_CAPACITY = 30
const BUFFER_GROW_STEP = 5
const EMA_ALPHA = 0.1
const THROUGHPUT_WINDOW_MS = 2000
const SPEED_DRIFT_GAIN = 0.002
const SPEED_MIN = 0.95
const SPEED_MAX = 1.05

function rosKey(sec, nanosec) {
    return `${sec >>> 0}.${String(nanosec >>> 0).padStart(9, '0')}`
}

export default class TemporalSync {
    constructor({ onRelease, onStats, baseInterval = DEFAULT_BASE_INTERVAL } = {}) {
        this.releaseCallback = onRelease || null
        this.statsCallback = onStats || null
        this.baseInterval = baseInterval

        this.frameBuffer = []
        this.bufferCapacity = INITIAL_BUFFER_CAPACITY
        this.cameraArrivalMap = new Map()
        this.estimatedLatencyMs = 0
        this.calibrated = false
        this.speedFactor = 1.0

        // Rolling window of model output arrival times for throughput calculation
        this._modelArrivalTimes = []
    }

    /**
     * Buffer a decoded camera frame.
     * @param {number} rosTimeSec - ROS timestamp seconds
     * @param {number} rosTimeNsec - ROS timestamp nanoseconds
     * @param {ImageBitmap} bitmap - Decoded video frame
     */
    pushFrame(rosTimeSec, rosTimeNsec, bitmap) {
        const key = rosKey(rosTimeSec, rosTimeNsec)
        const arrivalTime = performance.now()

        this._recordArrival(key, arrivalTime)

        // If not calibrated, pass through immediately without buffering
        if (!this.calibrated) {
            if (this.releaseCallback) {
                this.releaseCallback(bitmap)
            } else {
                bitmap.close()
            }
            return
        }
        this.frameBuffer.push({ rosKey: key, bitmap, arrivalTime })

        // Grow buffer capacity if estimated latency exceeds what current capacity can hold
        if (this.estimatedLatencyMs > this.bufferCapacity * this.baseInterval) {
            this.bufferCapacity = Math.min(
                this.bufferCapacity + BUFFER_GROW_STEP,
                MAX_BUFFER_CAPACITY
            )
        }

        // Evict oldest frames when over capacity
        while (this.frameBuffer.length > this.bufferCapacity) {
            const evicted = this.frameBuffer.shift()
            evicted.bitmap.close()
            this.cameraArrivalMap.delete(evicted.rosKey)
        }
    }

    /**
     * Handle model output arrival. Used for latency calibration and throughput tracking.
     * @param {{ sec: number, nanosec: number }} headerTime - ROS header timestamp from model output
     */
    onModelOutput(headerTime) {
        const key = rosKey(headerTime.sec, headerTime.nanosec)
        const now = performance.now()

        // Track arrival time for throughput calculation
        this._modelArrivalTimes.push(now)
        this._pruneModelArrivalTimes(now)

        const cameraArrivalTime = this.cameraArrivalMap.get(key)
        if (cameraArrivalTime === undefined) {
            return
        }

        const measuredLatency = now - cameraArrivalTime
        this.cameraArrivalMap.delete(key)

        if (!this.calibrated) {
            this.calibrated = true
            this.estimatedLatencyMs = measuredLatency
        } else {
            // Exponential moving average
            this.estimatedLatencyMs =
                EMA_ALPHA * measuredLatency +
                (1 - EMA_ALPHA) * this.estimatedLatencyMs
        }
    }

    /**
     * Release eligible frames for display. Called externally from requestAnimationFrame.
     * Only the most recent eligible frame is passed to releaseCallback; intermediates are closed.
     */
    release() {
        if (!this.calibrated) {
            return
        }

        const now = performance.now()
        let lastEligibleIndex = -1

        // Find all frames where enough time has elapsed
        for (let i = 0; i < this.frameBuffer.length; i++) {
            if (now - this.frameBuffer[i].arrivalTime >= this.estimatedLatencyMs) {
                lastEligibleIndex = i
            }
        }

        if (lastEligibleIndex >= 0) {
            // Drain eligible frames: close intermediates, release the most recent
            const eligible = this.frameBuffer.splice(0, lastEligibleIndex + 1)

            for (let i = 0; i < eligible.length; i++) {
                const frame = eligible[i]
                this.cameraArrivalMap.delete(frame.rosKey)

                if (i < eligible.length - 1) {
                    // Intermediate frame — close without display
                    frame.bitmap.close()
                } else {
                    // Most recent eligible frame — release for display
                    if (this.releaseCallback) {
                        this.releaseCallback(frame.bitmap)
                    } else {
                        frame.bitmap.close()
                    }
                }
            }
        }

        this._updateSpeedFactor(now)
        this._fireStats()
    }

    /**
     * Close all buffered bitmaps and reset state.
     */
    reset() {
        for (const frame of this.frameBuffer) {
            frame.bitmap.close()
        }
        this.frameBuffer = []
        this.cameraArrivalMap.clear()
        this.calibrated = false
        this.estimatedLatencyMs = 0
        this.bufferCapacity = INITIAL_BUFFER_CAPACITY
        this.speedFactor = 1.0
        this._modelArrivalTimes = []
    }

    /**
     * Full teardown — reset and null out callbacks.
     */
    dispose() {
        this.reset()
        this.releaseCallback = null
        this.statsCallback = null
    }

    // -- Internal helpers --

    _recordArrival(key, arrivalTime) {
        this.cameraArrivalMap.set(key, arrivalTime)
        // Cap map size to MAX_BUFFER_CAPACITY; evict oldest entry (insertion order)
        while (this.cameraArrivalMap.size > MAX_BUFFER_CAPACITY) {
            const oldest = this.cameraArrivalMap.keys().next().value
            this.cameraArrivalMap.delete(oldest)
        }
    }

    _pruneModelArrivalTimes(now) {
        const cutoff = now - THROUGHPUT_WINDOW_MS
        while (this._modelArrivalTimes.length > 0 && this._modelArrivalTimes[0] < cutoff) {
            this._modelArrivalTimes.shift()
        }
    }

    _computeThroughput() {
        const times = this._modelArrivalTimes
        if (times.length < 2) {
            return 0
        }
        const windowDuration = (times[times.length - 1] - times[0]) / 1000
        if (windowDuration <= 0) {
            return 0
        }
        return times.length / windowDuration
    }

    _updateSpeedFactor(now) {
        if (this.frameBuffer.length === 0) {
            this.speedFactor = 1.0
            return
        }

        const oldestAge = now - this.frameBuffer[0].arrivalTime
        const drift = oldestAge - this.estimatedLatencyMs
        this.speedFactor = Math.min(
            SPEED_MAX,
            Math.max(SPEED_MIN, 1.0 + drift * SPEED_DRIFT_GAIN)
        )
    }

    _fireStats() {
        if (!this.statsCallback) {
            return
        }

        this.statsCallback({
            latencyMs: this.estimatedLatencyMs,
            throughputFps: this._computeThroughput(),
            bufferDepth: this.frameBuffer.length,
            bufferCapacity: this.bufferCapacity,
            speedFactor: this.speedFactor,
        })
    }
}
