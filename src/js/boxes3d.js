// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

function parseTime(reader) {
    let time = {}
    time.sec = reader.int32()
    time.nanosec = reader.uint32()
    return time
}

function parseHeader(reader) {
    let header = {};
    header.stamp = parseTime(reader)
    header.frame_id = reader.string()
    return header
}

function parseDetectTrack(reader) {
    let detectTrack = {};
    detectTrack.id = reader.string()
    detectTrack.lifetime = reader.int32()
    detectTrack.stamp = parseTime(reader)
    return detectTrack
}

function parseDetectBoxes3D(reader) {
    let detectBox3D = {};
    try {
        console.log('Reading center_x at offset:', reader.offset);
        detectBox3D.center_x = reader.float32()

        console.log('Reading center_y at offset:', reader.offset);
        detectBox3D.center_y = reader.float32()

        console.log('Reading width at offset:', reader.offset);
        detectBox3D.width = reader.float32()

        console.log('Reading height at offset:', reader.offset);
        detectBox3D.height = reader.float32()

        console.log('Reading label at offset:', reader.offset);
        detectBox3D.label = reader.string()

        console.log('Reading score at offset:', reader.offset);
        detectBox3D.score = reader.float32()

        console.log('Reading distance at offset:', reader.offset);
        detectBox3D.distance = reader.float32()

        console.log('Reading speed at offset:', reader.offset);
        detectBox3D.speed = reader.float32()

        console.log('Reading track at offset:', reader.offset);
        detectBox3D.track = parseDetectTrack(reader)

        return detectBox3D;
    } catch (error) {
        console.error('Error parsing box at offset:', reader.offset);
        console.error('Error details:', error);
        throw error;
    }
}

export default async function boxes3dstream(socketUrl, onMessage) {
    const boxes = {}
    boxes.msg = {}
    boxes.msg.boxes = []
    boxes.needsUpdate = false
    const socket = new WebSocket(socketUrl);
    socket.binaryType = "arraybuffer";

    socket.onopen = function () {
        console.log('WebSocket connection opened to ' + socketUrl);
    };

    socket.onmessage = (event) => {
        const arrayBuffer = event.data;
        console.log('Received binary data length:', arrayBuffer.byteLength);
        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));
        console.log('First bytes:', Array.from(firstBytes));

        const dataView = new DataView(arrayBuffer);
        const reader = new CdrReader(dataView);
        let boxmsg = {};
        try {
            console.log('Starting to parse CDR message');
            boxmsg.header = parseHeader(reader);
            console.log('Parsed header:', boxmsg.header);

            console.log('Reading input_timestamp at offset:', reader.offset);
            boxmsg.input_timestamp = parseTime(reader);

            console.log('Reading model_time at offset:', reader.offset);
            boxmsg.model_time = parseTime(reader);

            console.log('Reading output_time at offset:', reader.offset);
            boxmsg.output_time = parseTime(reader);

            console.log('Reading sequence length at offset:', reader.offset);
            const arrlen = reader.sequenceLength();
            console.log('Number of boxes in message:', arrlen);

            boxmsg.boxes = [];
            for (let i = 0; i < arrlen; i++) {
                console.log(`Parsing box ${i} at offset:`, reader.offset);
                const box = parseDetectBoxes3D(reader);
                console.log('Parsed box:', box);
                boxmsg.boxes.push(box);
            }
            boxes.msg = boxmsg;
            console.log('Successfully parsed message:', boxes.msg);
        } catch (error) {
            console.error("Failed to deserialize box data:", error);
            console.error("Error occurred at position:", reader.offset);
            const errorBytes = new Uint8Array(arrayBuffer.slice(Math.max(0, reader.offset - 8), reader.offset + 8));
            console.error("Bytes around error:", Array.from(errorBytes));
            return;
        }
        if (onMessage) {
            onMessage(boxes.msg);
        }
        boxes.needsUpdate = true;
    };

    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function () {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };
    return boxes;
} 
