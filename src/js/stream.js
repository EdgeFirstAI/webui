// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js';
import { CdrReader } from './Cdr.js';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 8000;

/**
 * @param {string} socketUrl - WebSocket URL for the H.264 stream
 * @param {number} width - Initial video width
 * @param {number} height - Initial video height
 * @param {number} fps - Frames per second for timestamp calculation
 * @param {function} onMessage - Callback receiving a timing object. When captureFrames=true,
 *     timing.bitmap is an ImageBitmap that the consumer is responsible for closing via bitmap.close().
 * @param {boolean} [captureFrames=false] - When true, produce ImageBitmap frames instead of
 *     drawing to the canvas texture. The consumer handles display.
 */
export default async function h264stream(socketUrl, width, height, fps, onMessage, captureFrames = false) {

    // Canvas and texture are always created (used as the return value and for the
    // non-capture path). In captureFrames mode the consumer handles display instead.
    const canvas = document.createElement("canvas");
    canvas.hidden = false;
    const ctx = canvas.getContext("2d");

    canvas.width = width || 1920;
    canvas.height = height || 1080;

    const texture_canvas = new THREE.CanvasTexture(canvas);
    texture_canvas.needsUpdate = false
    let start = performance.now()
    function handleVideoFrame(videoFrame, ctx, canvas, texture_canvas, frameTiming, frameStart, onMessage) {
        if (captureFrames) {
            const width = videoFrame.displayWidth || videoFrame.codedWidth || 0
            const height = videoFrame.displayHeight || videoFrame.codedHeight || 0

            if (width <= 0 || height <= 0) {
                console.warn('Invalid video frame dimensions:', width, height)
                videoFrame.close()
                return
            }

            // frameTiming is already a per-frame snapshot; frameStart is captured at message arrival
            createImageBitmap(videoFrame).then((bitmap) => {
                frameTiming.decode_time = performance.now() - frameStart
                frameTiming.bitmap = bitmap
                if (onMessage) {
                    onMessage(frameTiming)
                }
                videoFrame.close()
            }).catch((err) => {
                videoFrame.close()
                console.warn('Failed to create ImageBitmap:', err)
            })
        } else {
            try {
                const width = videoFrame.displayWidth || videoFrame.codedWidth || 0;
                const height = videoFrame.displayHeight || videoFrame.codedHeight || 0;

                if (width > 0 && height > 0) {
                    if (canvas.width !== width || canvas.height !== height) {
                        canvas.width = width;
                        canvas.height = height;
                        console.log('Canvas resized to:', width, height);
                    }
                    ctx.drawImage(videoFrame, 0, 0);

                    texture_canvas.dispose();
                    texture_canvas.needsUpdate = true;

                    if (onMessage) {
                        frameTiming.decode_time = performance.now() - frameStart;
                        onMessage(frameTiming);
                    }
                } else {
                    console.warn('Invalid video frame dimensions:', width, height);
                }
            } finally {
                // Ensure VideoFrame is closed even if an error occurs
                videoFrame.close();
            }
        }
    }

    let h264decoder = new VideoDecoder({
        output: (videoFrame) => handleVideoFrame(videoFrame, ctx, canvas, texture_canvas, latestFrameTiming, latestFrameStart, onMessage),
        error: e => console.error(e)
    });

    h264decoder.configure({
        codec: 'avc1.42001E',
        codedWidth: width,
        codedHeight: height,
        optimizeForLatency: true
    });

    let framesProcessed = 0;
    const timing = {}
    // Per-frame snapshot variables consumed by the VideoDecoder output callback.
    // In captureFrames mode these hold a fresh object per frame to avoid race
    // conditions with the async ImageBitmap path; in default mode they reference
    // the shared timing object.
    let latestFrameTiming = timing
    let latestFrameStart = start
    let stopped = false;
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer = null;
    let socket = null;

    function connect() {
        if (stopped) return;

        // H.264 is already compressed; skip permessage-deflate to save CPU
        const wsUrl = socketUrl.includes('compress=') ? socketUrl : socketUrl + (socketUrl.includes('?') ? '&' : '?') + 'compress=false';
        socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";

        socket.onopen = function (event) {
            console.log('WebSocket connection opened to ' + socketUrl);
            reconnectDelay = RECONNECT_MIN_MS;
        };

        socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                start = performance.now()
                const arrayBuffer = event.data;
                const dataView = new DataView(arrayBuffer);
                const reader = new CdrReader(dataView);
                let image_data;
                try {
                    const header_stamp_sec = reader.uint32(); // Read header.stamp.sec
                    const header_stamp_nsec = reader.uint32(); // Read header.stamp.nsec
                    const header_frame_id = reader.string(); // Read header.frame_id
                    image_data = reader.uint8Array(); // Read image data
                    timing.rosTimeSec = header_stamp_sec
                    timing.rosTimeNsec = header_stamp_nsec
                } catch (error) {
                    console.error("Failed to deserialize image data:", error);
                    return;
                }

                // In captureFrames mode, create a per-frame timing snapshot and
                // capture start so the async .then() sees stable values even if
                // the next message arrives before the promise resolves.
                latestFrameTiming = captureFrames
                    ? { rosTimeSec: timing.rosTimeSec, rosTimeNsec: timing.rosTimeNsec }
                    : timing
                latestFrameStart = start

                const chunk = new EncodedVideoChunk({
                    type: "key",
                    timestamp: framesProcessed * (1000 / fps),
                    data: image_data
                });
                framesProcessed++;
                if (h264decoder.state == "closed") {
                    console.error("decoder state:", h264decoder.state);
                    h264decoder = new VideoDecoder({
                        output: (videoFrame) => handleVideoFrame(videoFrame, ctx, canvas, texture_canvas, latestFrameTiming, latestFrameStart, onMessage),
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
                } catch (e) {
                    console.error("Decoding error:", e);
                }
            } else {
                console.log("Received non-ArrayBuffer data:", event.data);
            }
        };

        socket.onerror = function (error) {
            console.error(`WebSocket ${socketUrl} error:`, error);
        };

        socket.onclose = function (event) {
            if (stopped) return;
            console.log(`WebSocket ${socketUrl} closed — reconnecting in ${reconnectDelay / 1000}s`);
            reconnectTimer = setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        };
    }

    connect();

    // Attach cleanup method to texture so callers can stop the stream
    texture_canvas._stopReconnect = () => {
        stopped = true;
        clearTimeout(reconnectTimer);
        if (socket && socket.readyState <= WebSocket.OPEN) {
            socket.close();
        }
    };
    return texture_canvas;
}
