// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CdrReader } from './Cdr.js'

// PointCloud2 field datatype constants
const INT8 = 1
const UINT8 = 2
const INT16 = 3
const UINT16 = 4
const INT32 = 5
const UINT32 = 6
const FLOAT32 = 7
const FLOAT64 = 8

/**
 * Parse a PointCloud2 CDR message from a binary ArrayBuffer.
 *
 * Returns a parsed descriptor with zero-copy DataView over the raw point data.
 */
export function parsePointCloud2(arrayBuffer) {
    const view = new DataView(arrayBuffer)
    const reader = new CdrReader(view)

    // Header
    reader.uint32() // stamp.sec
    reader.uint32() // stamp.nsec
    reader.string() // frame_id

    const height = reader.uint32()
    const width = reader.uint32()

    // Point field descriptors
    const fieldCount = reader.sequenceLength()
    const fields = []
    const fieldMap = {}
    for (let i = 0; i < fieldCount; i++) {
        const name = reader.string()
        const offset = reader.uint32()
        const datatype = reader.uint8()
        const count = reader.uint32()
        const field = { name, offset, datatype, count }
        fields.push(field)
        fieldMap[name] = field
    }

    const isBigEndian = reader.int8() > 0
    const pointStep = reader.uint32()
    reader.uint32() // row_step
    const rawData = reader.uint8Array()
    reader.int8() // is_dense — consumed but unused

    const totalPoints = height * width
    const littleEndian = !isBigEndian

    // Zero-copy DataView over the raw point data
    const dataView = new DataView(rawData.buffer, rawData.byteOffset, rawData.length)

    return { totalPoints, pointStep, littleEndian, fields, fieldMap, dataView }
}

/**
 * Read a single typed value from a specific point and field.
 *
 * `parsed` is the object returned by parsePointCloud2.
 * `field` is a descriptor from parsed.fieldMap (must have offset and datatype).
 */
export function readField(parsed, pointIndex, field) {
    const { pointStep, littleEndian, dataView } = parsed
    const o = pointIndex * pointStep + field.offset

    switch (field.datatype) {
        case INT8:    return dataView.getInt8(o)
        case UINT8:   return dataView.getUint8(o)
        case INT16:   return dataView.getInt16(o, littleEndian)
        case UINT16:  return dataView.getUint16(o, littleEndian)
        case INT32:   return dataView.getInt32(o, littleEndian)
        case UINT32:  return dataView.getUint32(o, littleEndian)
        case FLOAT32: return dataView.getFloat32(o, littleEndian)
        case FLOAT64: return dataView.getFloat64(o, littleEndian)
        default:      return 0
    }
}

/**
 * Extract all values of a single named field into an Int32Array.
 *
 * Returns an empty Int32Array if the field is not found.
 */
export function extractFieldArray(parsed, fieldName) {
    const field = parsed.fieldMap[fieldName]
    if (!field) return new Int32Array(0)

    const { totalPoints, pointStep, littleEndian, dataView } = parsed
    const values = new Int32Array(totalPoints)
    const fieldOffset = field.offset
    const dt = field.datatype

    for (let i = 0; i < totalPoints; i++) {
        const o = i * pointStep + fieldOffset
        switch (dt) {
            case INT8:    values[i] = dataView.getInt8(o); break
            case UINT8:   values[i] = dataView.getUint8(o); break
            case INT16:   values[i] = dataView.getInt16(o, littleEndian); break
            case UINT16:  values[i] = dataView.getUint16(o, littleEndian); break
            case INT32:   values[i] = dataView.getInt32(o, littleEndian); break
            case UINT32:  values[i] = dataView.getUint32(o, littleEndian); break
            case FLOAT32: values[i] = dataView.getFloat32(o, littleEndian); break
            case FLOAT64: values[i] = dataView.getFloat64(o, littleEndian); break
            default:      values[i] = 0
        }
    }

    return values
}

/**
 * Convert parsed PointCloud2 data to an array of plain objects.
 *
 * Each object has one property per field (keyed by field name).
 * Used by legacy consumers that expect [{x, y, z, ...}, ...] format.
 */
export function toPointArray(parsed) {
    const { totalPoints, fields } = parsed
    const points = []

    for (let i = 0; i < totalPoints; i++) {
        const point = {}
        for (const f of fields) {
            point[f.name] = readField(parsed, i, f)
        }
        points.push(point)
    }

    return points
}
