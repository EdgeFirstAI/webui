// Copyright (C) 2026 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { POINT_FIELD_DATATYPE } from '../../src/js/vocabulary.js'
import { parsePointCloud2, readField } from '../../src/js/pointcloud2.js'

const snapshot = JSON.parse(readFileSync(new URL('./fixtures/vocabulary.json', import.meta.url), 'utf8'))

test('PointField datatypes match the edgefirst-schemas snapshot', () => {
    assert.deepEqual({ ...POINT_FIELD_DATATYPE }, snapshot.point_field_datatype.codes)
})

test('PointField datatype table is frozen', () => {
    assert.ok(Object.isFrozen(POINT_FIELD_DATATYPE))
})

// A one-point little-endian PointCloud2 with one field per datatype, built by
// hand so the test does not depend on a CDR writer.
function pointCloudWithEveryDatatype() {
    const fields = [
        ['i8', 0, POINT_FIELD_DATATYPE.INT8],
        ['u8', 1, POINT_FIELD_DATATYPE.UINT8],
        ['i16', 2, POINT_FIELD_DATATYPE.INT16],
        ['u16', 4, POINT_FIELD_DATATYPE.UINT16],
        ['i32', 8, POINT_FIELD_DATATYPE.INT32],
        ['u32', 12, POINT_FIELD_DATATYPE.UINT32],
        ['f32', 16, POINT_FIELD_DATATYPE.FLOAT32],
        ['f64', 24, POINT_FIELD_DATATYPE.FLOAT64],
    ]
    const pointStep = 32
    const point = new DataView(new ArrayBuffer(pointStep))
    point.setInt8(0, -5)
    point.setUint8(1, 250)
    point.setInt16(2, -1234, true)
    point.setUint16(4, 60000, true)
    point.setInt32(8, -123456, true)
    point.setUint32(12, 4000000000, true)
    point.setFloat32(16, 1.5, true)
    point.setFloat64(24, -2.25, true)

    const bytes = []
    const pad = (n) => { while ((bytes.length - 4) % n) bytes.push(0) }
    const u32 = (v) => { pad(4); bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff) }
    const str = (s) => { u32(s.length + 1); for (const c of s) bytes.push(c.charCodeAt(0)); bytes.push(0) }

    bytes.push(0, 1, 0, 0) // CDR little-endian encapsulation
    u32(0); u32(0); str('') // header
    u32(1); u32(1) // height, width
    u32(fields.length)
    for (const [name, offset, datatype] of fields) {
        str(name); u32(offset); bytes.push(datatype); u32(1)
    }
    bytes.push(0) // is_bigendian
    u32(pointStep); u32(pointStep)
    u32(pointStep); bytes.push(...new Uint8Array(point.buffer))
    bytes.push(1) // is_dense
    return new Uint8Array(bytes).buffer
}

test('readField decodes every PointField datatype', () => {
    const parsed = parsePointCloud2(pointCloudWithEveryDatatype())
    const value = (name) => readField(parsed, 0, parsed.fieldMap[name])
    assert.equal(value('i8'), -5)
    assert.equal(value('u8'), 250)
    assert.equal(value('i16'), -1234)
    assert.equal(value('u16'), 60000)
    assert.equal(value('i32'), -123456)
    assert.equal(value('u32'), 4000000000)
    assert.equal(value('f32'), 1.5)
    assert.equal(value('f64'), -2.25)
})
