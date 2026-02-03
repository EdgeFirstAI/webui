// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';

export function quaternionToEuler(x, y, z, w) {
    const roll = Math.atan2(2.0 * (w * x + y * z), 1.0 - 2.0 * (x * x + y * y)) * (180 / Math.PI);
    const pitch = Math.asin(2.0 * (w * y - z * x)) * (180 / Math.PI);
    const yaw = Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z)) * (180 / Math.PI);

    return { roll, pitch, yaw };
}


export async function ImuStream(socketUrl) {
    const imuData = {};
    imuData.header_stamp_sec = 0
    imuData.header_stamp_nsec = 0
    imuData.header_frame_id = ""

    imuData.orientation_x = 0
    imuData.orientation_y = 0
    imuData.orientation_z = 0
    imuData.orientation_w = 0

    imuData.angular_velocity_x = 0
    imuData.angular_velocity_y = 0
    imuData.angular_velocity_z = 0

    imuData.linear_acceleration_x = 0
    imuData.linear_acceleration_y = 0
    imuData.linear_acceleration_z = 0


    let socket = new WebSocket(socketUrl);

    socket.binaryType = 'arraybuffer'; // Receive data as ArrayBuffer

    socket.onopen = function (event) {
        console.log('WebSocket connection opened to ' + socketUrl);
    };

    socket.onmessage = function (event) {
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);
        const reader = new CdrReader(dataView);

        try {
            // Deserialize IMU data
            imuData.header_stamp_sec = reader.uint32(); // Read header.stamp.sec
            imuData.header_stamp_nsec = reader.uint32(); // Read header.stamp.nsec
            imuData.header_frame_id = reader.string(); // Read header.frame_id

            imuData.orientation_x = reader.float64(); // Read orientation.x
            imuData.orientation_y = reader.float64(); // Read orientation.y
            imuData.orientation_z = reader.float64(); // Read orientation.z
            imuData.orientation_w = reader.float64(); // Read orientation.w

            imuData.angular_velocity_x = reader.float64(); // Read angular_velocity.x
            imuData.angular_velocity_y = reader.float64(); // Read angular_velocity.y
            imuData.angular_velocity_z = reader.float64(); // Read angular_velocity.z

            imuData.linear_acceleration_x = reader.float64(); // Read linear_acceleration.x
            imuData.linear_acceleration_y = reader.float64(); // Read linear_acceleration.y
            imuData.linear_acceleration_z = reader.float64(); // Read linear_acceleration.z

        } catch (error) {
            console.error("Failed to deserialize IMU data:", error);
        }
    };

    socket.onerror = function (error) {
        console.error(`WebSocket ${socketUrl} error: ${error}`);
    };

    socket.onclose = function (event) {
        console.log(`WebSocket ${socketUrl} connection closed`);
    };

    return imuData
}

