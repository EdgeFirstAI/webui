// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { CdrReader } from './Cdr.js';
export function quaternionToEuler(x, y, z, w) {
    const roll = Math.atan2(2.0 * (w * x + y * z), 1.0 - 2.0 * (x * x + y * y)) * (180 / Math.PI);
    const pitch = Math.asin(2.0 * (w * y - z * x)) * (180 / Math.PI);
    const yaw = Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z)) * (180 / Math.PI);

    return { roll, pitch, yaw };
}


function deserialize_pointfield(reader) {
    const pointfield = {};
    pointfield.name = reader.string()
    pointfield.offset = reader.uint32()
    pointfield.datatype = reader.uint8()
    pointfield.count = reader.uint32()
    return pointfield
}

function deserialize_pcd(reader) {
    const data = {};
    data.header_stamp_sec = reader.uint32() // Read header.stamp.sec
    data.header_stamp_nsec = reader.uint32() // Read header.stamp.nsec
    data.header_frame_id = reader.string()

    data.height = reader.uint32()
    data.width = reader.uint32()

    const field_count = reader.sequenceLength()
    data.fields = []
    for (let i = 0; i < field_count; i++) {
        data.fields.push(deserialize_pointfield(reader))
    }

    data.is_bigendian = reader.int8() > 0
    data.point_step = reader.uint32()
    data.row_step = reader.uint32()
    data.data = reader.uint8Array()
    data.is_dense = reader.int8() > 0
    return data
}

function pcd_to_points(radar_data) {
    const radar_points = []
    const view = new DataView(new ArrayBuffer(radar_data.data.length));
    // set bytes
    radar_data.data.forEach(function (b, i) {
        view.setUint8(i, b);
    });

    for (let i = 0; i < radar_data.height; i++) {
        for (let j = 0; j < radar_data.width; j++) {
            const radar_point = {}
            radar_point
            const point_start = (i * radar_data.width + j) * radar_data.point_step
            for (const f of radar_data.fields) {
                let val = 0

                switch (f.datatype) {
                    case 1: // INT8
                        {
                            val = view.getInt8(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 2: // UINT8
                        {
                            val = view.getUint8(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 3: // INT16
                        {
                            val = view.getInt16(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 4: // UINT16
                        {
                            val = view.getUint16(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 5: // INT32
                        {
                            val = view.getInt32(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 6: // UINT32
                        {
                            val = view.getUint32(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    case 7: // float32 
                        {
                            val = view.getFloat32(point_start + f.offset, !radar_data.is_bigendian);
                            break
                        }
                    case 8: // float64
                        {
                            val = view.getFloat64(point_start + f.offset, !radar_data.is_bigendian)
                            break
                        }
                    default:
                        {
                            console.warn("NotImplemented: Unknown PointCloud2 Datatype.")
                        }
                }
                radar_point[f.name] = val
            }
            radar_points.push(radar_point)
        }
    }
    return radar_points
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
        const arrayBuffer = event.data;
        const dataView = new DataView(arrayBuffer);
        const reader = new CdrReader(dataView);

        try {
            // Deserialize PCD data
            const pcd = deserialize_pcd(reader)
            radar_data.points = pcd_to_points(pcd)
            for (let p of radar_data.points) {
                if (typeof p.range == "undefined") {
                    p.range = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
                }   
                if (typeof p.angle == "undefined") {
                    p.angle = Math.atan2(p.y, p.x)
                }
            }

            
        } catch (error) {
            console.error("Failed to deserialize PCD data:", error);
        }

        if (onMessage) {
            onMessage()
        }
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

