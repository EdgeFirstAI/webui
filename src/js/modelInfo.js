// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as THREE from './three.js';
import { CdrReader } from './Cdr.js';

export default async function modelInfo(socketUrl, onFirstMessage) {
    const modelShape = {}
    const socket = new WebSocket(socketUrl);
    socket.binaryType = "arraybuffer";
    socket.onopen = function (event) {
        console.log('WebSocket connection opened to ' + socketUrl);
    };
    socket.onmessage = (event) => {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);
        const reader = new CdrReader(dataView);
        let mask;
        try {
            const header_stamp_sec = reader.uint32() // Read header.stamp.sec
            const header_stamp_nsec = reader.uint32() // Read header.stamp.nsec
            const header_frame_id = reader.string()

            const input_shape = reader.uint32Array()
            const input_type = reader.uint8()

            const output_shape = reader.uint32Array()
            const output_type = reader.uint8()

            const labels = reader.stringArray()

            const model_type = reader.string()
            const model_format = reader.string()
            const model_name = reader.string()
        } catch (error) {
            console.error("Failed to deserialize model info:", error);
            return;
        }
        onFirstMessage(output_shape)
        socket.close()
    };
    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function (event) {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };

    return;
}

