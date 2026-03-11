// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 8000;

function parseTime(reader) {
    return {
        sec: reader.int32(),
        nanosec: reader.uint32(),
    }
}

function parseHeader(reader) {
    return {
        time: parseTime(reader),
        frame_id: reader.string(),
    }
}

function parseTrack(reader) {
    return {
        id: reader.string(),
        lifetime: reader.int32(),
        created: parseTime(reader),
    }
}

function parseBox(reader) {
    return {
        center_x: reader.float32(),
        center_y: reader.float32(),
        width: reader.float32(),
        height: reader.float32(),
        label: reader.string(),
        score: reader.float32(),
        distance: reader.float32(),
        speed: reader.float32(),
        track: parseTrack(reader),
    }
}

function parseMask(reader) {
    const height = reader.uint32()
    const width = reader.uint32()
    const length = reader.uint32()
    const encoding = reader.string()
    if (encoding === 'zstd') {
        throw new Error('model.js does not support zstd-encoded masks; use mask.js instead')
    }
    const mask = reader.uint8Array()
    const boxed = reader.int8() > 0
    return { height, width, length, encoding, mask, boxed }
}

function parseModelMsg(arrayBuffer) {
    const dataView = new DataView(arrayBuffer)
    const reader = new CdrReader(dataView)

    const header = parseHeader(reader)
    const input_time = parseTime(reader)
    const model_time = parseTime(reader)
    const output_time = parseTime(reader)
    const decode_time = parseTime(reader)

    const boxCount = reader.sequenceLength()
    const boxes = []
    for (let i = 0; i < boxCount; i++) {
        boxes.push(parseBox(reader))
    }

    const maskCount = reader.sequenceLength()
    const masks = []
    for (let i = 0; i < maskCount; i++) {
        masks.push(parseMask(reader))
    }

    return { header, boxes, masks }
}

export default function modelstream(socketUrl, onMessage) {
    let stopped = false;
    let socket = null;
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer = null;

    function connect() {
        if (stopped) return;

        socket = new WebSocket(socketUrl)
        socket.binaryType = 'arraybuffer'

        socket.onopen = () => {
            console.log('Model WebSocket connected to ' + socketUrl)
            reconnectDelay = RECONNECT_MIN_MS;
        }

        socket.onmessage = (event) => {
            try {
                const msg = parseModelMsg(event.data)
                onMessage(msg)
            } catch (error) {
                console.error('Failed to parse Model message:', error)
            }
        }

        socket.onerror = (error) => {
            console.error(`Model WebSocket ${socketUrl} error:`, error)
        }

        socket.onclose = () => {
            if (stopped) return;
            console.log(`Model WebSocket ${socketUrl} closed — reconnecting in ${reconnectDelay / 1000}s`)
            reconnectTimer = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        }
    }

    connect();

    // Return a handle that camera.js can use to close/manage the connection
    return {
        close() {
            stopped = true;
            clearTimeout(reconnectTimer);
            if (socket) {
                socket.onclose = null;
                socket.close();
                socket = null;
            }
        },
        get readyState() {
            return socket ? socket.readyState : WebSocket.CLOSED;
        }
    }
}
