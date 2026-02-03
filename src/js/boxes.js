// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

const CHARCODE_MINUS = "-".charCodeAt(0);
const CHARCODE_DOT = ".".charCodeAt(0);
const CHARCODE_a = "a".charCodeAt(0);
const CHARCODE_A = "A".charCodeAt(0);
const CHARCODE_0 = "0".charCodeAt(0);
function uuid_to_color(id) {
    let hexcode = 0;
    let bytes = 0;
    for (const char of id) {
        const c = char.charCodeAt(0);
        if (c === CHARCODE_MINUS || c === CHARCODE_DOT) {
            continue;
        }
        let val = 0;
        if (c >= CHARCODE_a) {
            val = c - CHARCODE_a + 10;
        } else if (c >= CHARCODE_A) {
            val = c - CHARCODE_A + 10;
        } else if (c >= CHARCODE_0) {
            val = c - CHARCODE_0;
        }
        hexcode = (hexcode << 4) + val;

        // printf("c: %c val: %i hexcode: %x\n", c, val, hexcode);
        bytes++;
        if (bytes >= 8) {
            break;
        }
    }

    return `rgb(${((hexcode >> 24) & 0xff)} ${((hexcode >> 16) & 0xff)} ${((hexcode >> 8) & 0xff)})`
}

function drawBoxes(drawBoxSettings, message) {
    if (!message) {
        return;
    }
    if (!message.boxes) {
        return;
    } 
    if (!Array.isArray(message.boxes)) {
        return;
    }

    const canvas = drawBoxSettings.canvas;
    const ctx = canvas.getContext("2d");
    if (ctx == null) {
        return
    }

    ctx.font = "48px monospace";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < message.boxes.length; i++) {
        const box = message.boxes[i];
        let text
        let color_box = "white"
        let color_text = "black"
        if (box.track.id) {
            text = box.track.id.substring(0,8);
            color_box = uuid_to_color(box.track.id)
            color_text = uuid_to_color(box.track.id)
        } else {
            text = box.label;
        }

        let x = box.center_x;
        if (drawBoxSettings.mirror) {
            x = 1.0 - x;
        }

        if (drawBoxSettings.drawBox) {
            ctx.beginPath();
            ctx.rect((x - box.width / 2) * canvas.width, (box.center_y - box.height / 2) * canvas.height, box.width * canvas.width, box.height * canvas.height);
            ctx.strokeStyle = color_box;
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        if (drawBoxSettings.drawBoxText) {
            ctx.fillStyle = color_text;
            ctx.fillText(text, (x - box.width / 2) * canvas.width, (box.center_y - box.height / 2) * canvas.height)
        }
        
    }
}

function parseTime(reader) {
    let time = {}
    time.sec = reader.int32()
    time.nanosec = reader.uint32()
    return time
}

function parseHeader(reader) {
    let header = {};
    header.header_time = parseTime(reader)
    header.header_frame = reader.string()
    return header
}

function parseDetectTrack(reader) {
    let detectTrack = {};
    detectTrack.id = reader.string()
    detectTrack.lifetime = reader.int32()
    detectTrack.created = parseTime(reader)
    return detectTrack
}

function parseDetectBoxes2D(reader) {
    let detectBox2D = {};
    detectBox2D.center_x = reader.float32()
    detectBox2D.center_y = reader.float32()
    detectBox2D.width = reader.float32()
    detectBox2D.height = reader.float32()
    detectBox2D.label = reader.string()
    detectBox2D.score = reader.float32()
    detectBox2D.distance = reader.float32()
    detectBox2D.speed = reader.float32()
    detectBox2D.track = parseDetectTrack(reader)
    return detectBox2D
}

export default async function boxesstream(socketUrl, drawBoxSettings, onMessage) {
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
        const dataView = new DataView(arrayBuffer);
        const reader = new CdrReader(dataView);
        let boxmsg = {};
        try {
            boxmsg.header = parseHeader(reader)
            boxmsg.input_timestamp = parseTime(reader)
            boxmsg.model_time = parseTime(reader)
            boxmsg.output_time = parseTime(reader)
            const arrlen = reader.sequenceLength()
            boxmsg.boxes = []
            for (let i = 0; i < arrlen; i++) {
                boxmsg.boxes.push(parseDetectBoxes2D(reader))
            }
            if (drawBoxSettings) {
                drawBoxes(drawBoxSettings, boxmsg)
            }
            boxes.msg = boxmsg
        } catch (error) {
            console.error("Failed to deserialize image data:", error);
            return;
        }
        if (onMessage) {
            onMessage()
        }
        boxes.needsUpdate = true
    };

    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function () {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };
    return boxes;
}
