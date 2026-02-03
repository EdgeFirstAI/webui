// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

function resetTimeout() {
    clearTimeout(timeoutId);
    document.getElementById('timeout').innerText = '';
    timeoutId = setTimeout(() => {
        document.getElementById('timeout').innerText = 'Timeout: Verify if camera service is running';
    }, 15000);
}


const FRAME_DROP_LIMIT = 5
export default async function droppedframes(socketUrl, parent) {
    const ctx = {}
    ctx.frames_dropped = 0
    const timeout = 5e3
    const p = document.createElement("p")



    p.style = "color: red;"
    p.style.cssText = "position: absolute; top: 0px; z-index: 10000; color:red; background-color: rgba(200,200,200,0.5);"
    p.innerText = '';
    document.querySelector('main').appendChild(p);

    function update() {
        if (ctx.frames_dropped > FRAME_DROP_LIMIT) {
            p.innerText = `Dropped more than ${FRAME_DROP_LIMIT} messages in the last ${timeout / 1000}s`
        } else {
            p.innerText = ''
        }
    }

    const socket = new WebSocket(socketUrl);
    socket.binaryType = "arraybuffer";

    socket.onopen = function (event) {
        console.log('WebSocket connection opened to ' + socketUrl);
    };
    setTimeout(() => {

        socket.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const arrayBuffer = event.data;
                const dataView = new DataView(arrayBuffer);
                const reader = new CdrReader(dataView);
                try {
                    const str = reader.string()
                    const data = JSON.parse(str)
                    ctx.frames_dropped += 1
                    update()
                    setTimeout(() => {
                        ctx.frames_dropped -= 1
                        update()
                    }, timeout)

                    console.log(data)
                } catch (error) {
                    console.error("Failed to deserialize data:", error);
                    return;
                }
            } else {
                console.log("Received non-ArrayBuffer data:", event.data);
            }
        };

    }, timeout)


    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function (event) {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };
    return;
}

