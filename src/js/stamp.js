// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CdrReader } from './Cdr.js'

/**
 * Stamps further apart than this between consecutive samples of one stream
 * are a wall-clock step, not data; buffers holding either side are flushed.
 */
export const DISCONTINUITY_MS = 2000

/**
 * Convert a ROS Time to milliseconds since the Unix epoch. Identical stamps
 * give identical numbers, so the result is safe as an exact-match key; its
 * resolution is about 0.25 µs, far below any frame interval.
 */
export function stampToMs(sec, nanosec) {
    return (sec >>> 0) * 1000 + (nanosec >>> 0) / 1e6
}

/**
 * Read `header.stamp` from any CDR message whose first field is a
 * std_msgs/Header (PointCloud2, Detect, CompressedVideo, CameraInfo, ...).
 */
export function readHeaderStampMs(arrayBuffer) {
    const reader = new CdrReader(new DataView(arrayBuffer))
    const sec = reader.uint32()
    const nanosec = reader.uint32()
    return stampToMs(sec, nanosec)
}

/**
 * Associates each encoded chunk with its stamp so the VideoDecoder output
 * callback can recover it from `VideoFrame.timestamp`, whatever the number
 * of frames in flight.
 */
export class StampTracker {
    constructor(limit = 64) {
        this.limit = limit
        this.next = 0
        this.pending = new Map()
    }

    enqueue(stamp) {
        const seq = this.next++
        this.pending.set(seq, stamp)
        while (this.pending.size > this.limit) {
            this.pending.delete(this.pending.keys().next().value)
        }
        return seq
    }

    take(seq) {
        const stamp = this.pending.get(seq)
        if (stamp === undefined) return null
        this.pending.delete(seq)
        return stamp
    }
}
