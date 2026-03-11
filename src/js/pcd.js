// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { parsePointCloud2, toPointArray } from './pointcloud2.js'

export function quaternionToEuler(x, y, z, w) {
    const roll = Math.atan2(2.0 * (w * x + y * z), 1.0 - 2.0 * (x * x + y * y)) * (180 / Math.PI);
    const pitch = Math.asin(2.0 * (w * y - z * x)) * (180 / Math.PI);
    const yaw = Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z)) * (180 / Math.PI);

    return { roll, pitch, yaw };
}

export function preprocessPoints(range_min, range_max, points) {
    let filteredPoints = []
    for (let p of points) {
        const range = p.range
        if (range < range_min || range_max < range) {
            continue
        }
        filteredPoints.push(JSON.parse(JSON.stringify(p))) // deepclone the point
    }
    return filteredPoints
}

export default async function pcdStream(socketUrl, onMessage) {
    let radar_data = {}
    radar_data.points = []
    let socket = new WebSocket(socketUrl);

    socket.binaryType = 'arraybuffer'; // Receive data as ArrayBuffer

    socket.onopen = function (event) {
        console.log('WebSocket connection opened to ' + socketUrl);
    };

    socket.onmessage = function (event) {
        try {
            const parsed = parsePointCloud2(event.data)
            radar_data.points = toPointArray(parsed)
            for (let p of radar_data.points) {
                if (typeof p.range === "undefined") {
                    p.range = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
                }
                if (typeof p.angle === "undefined") {
                    p.angle = Math.atan2(p.y, p.x)
                }
            }
        } catch (error) {
            console.error("Failed to deserialize PCD data:", error)
        }
        if (onMessage) onMessage()
        radar_data.needsUpdate = true
    };

    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function (event) {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };

    return radar_data
}

