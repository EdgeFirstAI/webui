// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Rigid transforms and pinhole projection for drawing sensor points over the
// camera image. Matrices are 4x4, column-major, in a Float64Array[16].
// No DOM or three.js dependency.

/**
 * Build a 4x4 matrix from a translation and a quaternion. Non-unit
 * quaternions are normalised first.
 * @param {{x:number,y:number,z:number}} t
 * @param {{x:number,y:number,z:number,w:number}} q
 * @returns {Float64Array}
 */
export function tfToMatrix(t, q) {
    const { x: tx, y: ty, z: tz } = t
    let { x: qx, y: qy, z: qz, w: qw } = q

    const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
    if (len > 1e-9) { qx /= len; qy /= len; qz /= len; qw /= len }

    const xx = qx * qx, yy = qy * qy, zz = qz * qz
    const xy = qx * qy, xz = qx * qz, yz = qy * qz
    const wx = qw * qx, wy = qw * qy, wz = qw * qz

    return new Float64Array([
        1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
        2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
        2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
        tx, ty, tz, 1,
    ])
}

/**
 * Invert a rigid-body transform: R^-1 = R^T, t^-1 = -R^T * t.
 * @param {Float64Array} m
 * @returns {Float64Array}
 */
export function invertRigidTransform(m) {
    const r00 = m[0], r01 = m[4], r02 = m[8]
    const r10 = m[1], r11 = m[5], r12 = m[9]
    const r20 = m[2], r21 = m[6], r22 = m[10]
    const tx = m[12], ty = m[13], tz = m[14]

    return new Float64Array([
        r00, r01, r02, 0,
        r10, r11, r12, 0,
        r20, r21, r22, 0,
        -(r00 * tx + r10 * ty + r20 * tz),
        -(r01 * tx + r11 * ty + r21 * tz),
        -(r02 * tx + r12 * ty + r22 * tz),
        1,
    ])
}

/**
 * Multiply two 4x4 matrices: A * B.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
export function multiplyMatrices(a, b) {
    const out = new Float64Array(16)
    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            out[col * 4 + row] =
                a[0 * 4 + row] * b[col * 4 + 0] +
                a[1 * 4 + row] * b[col * 4 + 1] +
                a[2 * 4 + row] * b[col * 4 + 2] +
                a[3 * 4 + row] * b[col * 4 + 3]
        }
    }
    return out
}

/**
 * Sensor frame to camera optical frame, from the two /tf_static transforms
 * that share a parent (base_link): p_cam = inv(T_base_cam) * T_base_sensor * p.
 * @param {{translation:object, rotation:object}|null} sensorTf base_link → sensor
 * @param {{translation:object, rotation:object}|null} cameraTf base_link → camera optical
 * @returns {Float64Array|null} null when either transform is missing
 */
export function sensorToCameraMatrix(sensorTf, cameraTf) {
    if (!sensorTf || !cameraTf) return null
    const baseFromSensor = tfToMatrix(sensorTf.translation, sensorTf.rotation)
    const camFromBase = invertRigidTransform(tfToMatrix(cameraTf.translation, cameraTf.rotation))
    return multiplyMatrices(camFromBase, baseFromSensor)
}

/**
 * Project a sensor-frame point to image pixels with the pinhole model. In the
 * optical frame Z is forward, X right and Y down.
 * @param {Float64Array} m sensor → camera optical matrix
 * @param {{fx:number,fy:number,cx:number,cy:number}} k camera intrinsics
 * @returns {{u:number, v:number, depth:number}|null} null for points on or behind the camera plane
 */
export function projectToImage(m, k, x, y, z) {
    const camZ = m[2] * x + m[6] * y + m[10] * z + m[14]
    if (!(camZ > 0)) return null
    const camX = m[0] * x + m[4] * y + m[8] * z + m[12]
    const camY = m[1] * x + m[5] * y + m[9] * z + m[13]
    return { u: k.fx * (camX / camZ) + k.cx, v: k.fy * (camY / camZ) + k.cy, depth: camZ }
}

/**
 * True when two /tf_static transforms have the same translation and
 * rotation values (two nulls are the same).
 * @param {{translation:object, rotation:object}|null} a
 * @param {{translation:object, rotation:object}|null} b
 */
export function sameTransform(a, b) {
    if (!a || !b) return a === b
    const t = a.translation, u = b.translation, q = a.rotation, r = b.rotation
    return t.x === u.x && t.y === u.y && t.z === u.z &&
        q.x === r.x && q.y === r.y && q.z === r.z && q.w === r.w
}
