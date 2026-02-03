// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

let timeoutId;

function resetTimeout() {
    clearTimeout(timeoutId);
    document.getElementById('timeout').innerText = '';
    timeoutId = setTimeout(() => {
        document.getElementById('timeout').innerText = 'Timeout: Verify if camera service is running';
    }, 15000);
}

export default async function h264stream(socketUrl, width, height, fps, canvas) {
    canvas.width = width;
    canvas.height = height;
    canvas.hidden = false;
    const ctx = canvas.getContext("2d");

    let h264decoder = new VideoDecoder({
        output: (videoFrame) => {
            ctx.drawImage(videoFrame, 0, 0);
            videoFrame.close()
        },
        error: e => console.error(e)
    });

    h264decoder.configure({
        codec: 'avc1.42001E',
        codedWidth: width,
        codedHeight: height,
        optimizeForLatency: true
    });

    const socket = new WebSocket(socketUrl);
    socket.binaryType = "arraybuffer";
    let framesProcessed = 0;

    socket.onopen = function (event) {
        console.log('WebSocket connection opened to ' + socketUrl);
        resetTimeout();
    };

    socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            const arrayBuffer = event.data;
            const dataView = new DataView(arrayBuffer);
            const reader = new CdrReader(dataView);
            let image_data;
            try {
                const header_stamp_sec = reader.uint32(); // Read header.stamp.sec
                const header_stamp_nsec = reader.uint32(); // Read header.stamp.nsec
                const header_frame_id = reader.string(); // Read header.frame_id
                image_data = reader.uint8Array(); // Read image data
            } catch (error) {
                console.error("Failed to deserialize image data:", error);
                return;
            }
            const chunk = new EncodedVideoChunk({
                type: "key",
                timestamp: framesProcessed * (1000 / fps),
                data: image_data
            });
            framesProcessed++;
            if (h264decoder.state == "closed") {
                console.error("decoder state:", h264decoder.state);
                h264decoder = new VideoDecoder({
                    output: (videoFrame) => {
                        ctx.drawImage(videoFrame, 0, 0);
                        videoFrame.close()
                    },
                    error: e => console.error(e)
                });

                h264decoder.configure({
                    codec: 'avc1.42001E',
                    codedWidth: width,
                    codedHeight: height,
                    optimizeForLatency: true
                });
            }
            try {
                h264decoder.decode(chunk);
                resetTimeout();
            } catch (e) {
                console.error("Decoding error:", e);
            }
            resetTimeout();
        } else {
            console.log("Received non-ArrayBuffer data:", event.data);
        }
    };

    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function (event) {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };
    return ctx;
}
