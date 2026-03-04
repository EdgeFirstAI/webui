// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import modelstream from './model.js'
import { mask_colors } from './utils.js'
import { CdrReader } from './Cdr.js'
import { parseNumbersInObject } from './parseNumbersInObject.js'

const PI = Math.PI
const UNAVAILABLE_TIMEOUT_MS = 15000
const LIDAR_DOT_RADIUS = 3

// ---------------------------------------------------------------------------
// Configurable topic URLs (overridden by /config/webui/details)
// ---------------------------------------------------------------------------
let socketUrlH264 = '/rt/camera/h264/'
let socketUrlLidar = '/rt/lidar/points/'
let socketUrlLidarCluster = '/rt/lidar/clusters/'
let socketUrlFusion = '/rt/fusion/lidar/'
let socketUrlModel = '/rt/model/output/'
let socketUrlTfStatic = '/rt/tf_static/'
let socketUrlCameraInfo = '/rt/camera/info/'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let texture_camera = null

// Overlay enabled state
let segEnabled = false
let boxEnabled = false
let lidarEnabled = false
let lidarColorMode = 'distance'
let showLabels = true
let showConfidence = true
let lidarShowNoise = true
let lidarShowGround = true

// Overlay scene objects (for cleanup)
let segMesh = null
let modelData = null
let modelSocket = null
let tfStaticSocket = null
let cameraInfoSocket = null
let lidarTransform = null
let cameraTransform = null
let lidarPoints = null

// Camera intrinsics from /camera/info
let cameraIntrinsics = null // { fx, fy, cx, cy }

// Computed LiDAR→camera 4x4 matrix (Float64Array[16], column-major)
let lidarToCameraMatrix = null

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const viewport = document.getElementById('camera-viewport')
const playerCanvas = document.getElementById('player')
const boxCanvas = document.getElementById('boxes')
const lidarCanvas = document.getElementById('lidar-overlay')
const lidarCtx = lidarCanvas.getContext('2d')
const cameraUnavailable = document.getElementById('camera-unavailable')

// Overlay controls
const overlaySegToggle = document.getElementById('overlay-segmentation')
const overlaySegSection = overlaySegToggle.closest('.camera-controls__section')

const overlayBoxToggle = document.getElementById('overlay-box2d')
const overlayBoxSection = overlayBoxToggle.closest('.camera-controls__section')
const boxOptions = document.getElementById('box2d-options')
const boxLabelsCheckbox = document.getElementById('box2d-show-labels')
const boxConfidenceCheckbox = document.getElementById('box2d-show-confidence')

const overlayLidarToggle = document.getElementById('overlay-lidar')
const overlayLidarSection = overlayLidarToggle.closest('.camera-controls__section')
const lidarOptions = document.getElementById('lidar-options')
const lidarColorSelect = document.getElementById('lidar-color-mode')
const lidarClusterFilters = document.getElementById('lidar-cluster-filters')
const lidarNoiseCheckbox = document.getElementById('lidar-show-noise')
const lidarGroundCheckbox = document.getElementById('lidar-show-ground')

// ---------------------------------------------------------------------------
// THREE.js Scene
// ---------------------------------------------------------------------------
const width = 1920
const height = 1080

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: playerCanvas })
renderer.setSize(width, height)
renderer.domElement.style.cssText = ''

const camera = new THREE.PerspectiveCamera(46.4, width / height, 0.1, 1000)
camera.rotation.z = PI
camera.rotation.x = PI

// Overlay canvas sizing
boxCanvas.width = width
boxCanvas.height = height
lidarCanvas.width = width
lidarCanvas.height = height

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------
function initConfig(config) {
    if (config.H264_TOPIC) socketUrlH264 = config.H264_TOPIC
    if (config.MODEL_TOPIC) socketUrlModel = config.MODEL_TOPIC
    if (config.LIDAR_TOPIC) socketUrlLidar = config.LIDAR_TOPIC
    if (config.CLUSTER_TOPIC) socketUrlLidarCluster = config.CLUSTER_TOPIC
    if (config.FUSION_TOPIC) socketUrlFusion = config.FUSION_TOPIC
    if (config.CAMERA_INFO_TOPIC) socketUrlCameraInfo = config.CAMERA_INFO_TOPIC
}

// ---------------------------------------------------------------------------
// Video Stream
// ---------------------------------------------------------------------------
function initVideoStream() {
    const quad = new THREE.PlaneGeometry(width / height * 500, 500)

    const videoManager = new SmartVideoManager()
    videoManager.init((timing) => {
        resetTimeout()
        if (timing.mode && !videoManager.loggedMode) {
            console.log(`Video Mode: ${timing.mode === 'tiles' ? '4K Tiles' : 'H.264 Fallback'}`)
            videoManager.loggedMode = true
        }
    }, h264Stream).then((tex) => {
        texture_camera = tex
        const material = new ProjectedMaterial({
            camera: camera,
            texture: texture_camera,
            color: '#000',
            transparent: true,
        })
        const mesh = new THREE.Mesh(quad, material)
        mesh.needsUpdate = true
        mesh.position.z = 50
        mesh.rotation.x = PI
        mesh.renderOrder = 0
        scene.add(mesh)
    })
}

// ---------------------------------------------------------------------------
// Segmentation Overlay (unified shader — handles both instance and semantic)
// ---------------------------------------------------------------------------
const MAX_SEG_MASKS = 32
let segTexture = null
let segTextureW = 0
let segTextureH = 0
function ensureSegTexture(w, h) {
    if (segTexture && segTextureW === w && segTextureH === h) return
    if (segTexture) segTexture.dispose()

    // Allocate max depth once so we don't recreate when detection count changes
    const data = new Uint8Array(w * h * MAX_SEG_MASKS)
    segTexture = new THREE.DataArrayTexture(data, w, h, MAX_SEG_MASKS)
    segTexture.format = THREE.RedFormat
    segTexture.internalFormat = 'R8'
    segTexture.type = THREE.UnsignedByteType
    segTexture.minFilter = THREE.LinearFilter
    segTexture.magFilter = THREE.LinearFilter
    segTexture.needsUpdate = true

    segTextureW = w
    segTextureH = h
}

const SEG_VERTEX_SHADER = `
    out vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const SEG_FRAGMENT_SHADER = `
    precision highp sampler2DArray;

    uniform sampler2DArray masks;
    uniform vec4 colors[${MAX_SEG_MASKS}];
    uniform vec4 bboxes[${MAX_SEG_MASKS}];
    uniform int maskCount;
    uniform bool isInstance;

    in vec2 vUv;
    out vec4 pc_fragColor;

    void main() {
        // Camera has rotation.z=PI + rotation.x=PI → right axis is -X, so flip U
        // vUv.y already maps correctly: screen top → vUv.y=0 → image top
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);

        if (isInstance) {
            // Instance mode: composite masks within their bounding boxes
            vec4 result = vec4(0.0);
            for (int i = 0; i < ${MAX_SEG_MASKS}; i++) {
                if (i >= maskCount) break;
                vec4 bb = bboxes[i];
                // Check if fragment is within this mask's bbox
                if (uv.x < bb.x || uv.x > bb.x + bb.z ||
                    uv.y < bb.y || uv.y > bb.y + bb.w) continue;
                // Map UV to mask-local coordinates
                vec2 maskUV = (uv - bb.xy) / bb.zw;
                float sig = texture(masks, vec3(maskUV, float(i))).r;
                // Normalize from uint8 [0,255] → [0,1] sigmoid
                float sigNorm = sig;
                float a = sigNorm * colors[i].a;
                // Source-over composite (premultiplied)
                result.rgb = colors[i].rgb * a + result.rgb * (1.0 - a);
                result.a = a + result.a * (1.0 - a);
            }
            pc_fragColor = result;
        } else {
            // Semantic mode: argmax across all mask layers
            float maxVal = 0.0;
            int maxIdx = 0;
            for (int i = 0; i < ${MAX_SEG_MASKS}; i++) {
                if (i >= maskCount) break;
                float val = texture(masks, vec3(uv, float(i))).r;
                if (val > maxVal) { maxVal = val; maxIdx = i; }
            }
            // Show only if above threshold (sigmoid > 0.5 ≈ normalized 0.5)
            if (maxVal > 0.5) {
                pc_fragColor = vec4(colors[maxIdx].rgb, colors[maxIdx].a);
            } else {
                pc_fragColor = vec4(0.0);
            }
        }
    }
`

function ensureSegMesh() {
    if (segMesh) return
    // Size quad to exactly fill the camera frustum at z=50 so geometry UVs
    // map 1:1 to normalized image coordinates (0,0)→(1,1)
    const fovRad = camera.fov * Math.PI / 180
    const planeH = 2 * 50 * Math.tan(fovRad / 2)
    const planeW = planeH * camera.aspect
    const quad = new THREE.PlaneGeometry(planeW, planeH)

    // Build initial uniform arrays (flat vec4 arrays → Float32Array)
    const colorsArr = new Float32Array(MAX_SEG_MASKS * 4)
    const bboxesArr = new Float32Array(MAX_SEG_MASKS * 4)

    // Create a 1x1x1 placeholder so the sampler2DArray binding is valid
    // before real mask data arrives
    const placeholder = new THREE.DataArrayTexture(new Uint8Array(1), 1, 1, 1)
    placeholder.format = THREE.RedFormat
    placeholder.internalFormat = 'R8'
    placeholder.type = THREE.UnsignedByteType
    placeholder.needsUpdate = true

    const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            masks: { value: placeholder },
            colors: { value: colorsArr },
            bboxes: { value: bboxesArr },
            maskCount: { value: 0 },
            isInstance: { value: true },
        },
        vertexShader: SEG_VERTEX_SHADER,
        fragmentShader: SEG_FRAGMENT_SHADER,
        glslVersion: THREE.GLSL3,
    })
    segMesh = new THREE.Mesh(quad, mat)
    segMesh.position.z = 50
    segMesh.rotation.x = PI
    segMesh.renderOrder = 1
    segMesh.visible = false
    scene.add(segMesh)
}

function renderSegmentation() {
    if (!modelData) {
        if (segMesh) segMesh.visible = false
        return
    }

    const { boxes, masks } = modelData
    if (!masks || masks.length === 0) {
        if (segMesh) segMesh.visible = false
        return
    }

    const isInstance = masks[0].boxed
    const maskCount = Math.min(masks.length, MAX_SEG_MASKS)

    // All masks share dimensions (proto res for instance, model res for semantic)
    const mW = masks[0].width
    const mH = masks[0].height
    if (mW === 0 || mH === 0) return

    // Pad each mask with a 1px transparent border so GPU bilinear
    // interpolation blends to zero at the crop boundary instead of
    // clamping the edge texels (matches old canvas padding approach)
    const padW = mW + 2
    const padH = mH + 2

    ensureSegTexture(padW, padH)

    // Copy mask data into DataArrayTexture buffer with 1px zero border
    const buf = segTexture.image.data
    const layerSize = padW * padH
    // Clear entire buffer (sets borders + unused layers to zero)
    buf.fill(0)
    for (let i = 0; i < maskCount; i++) {
        const mask = masks[i]
        if (!mask.mask || mask.mask.length === 0) continue
        const layerOffset = i * layerSize
        // Copy mask data starting at row+1, col+1 within padded layer
        for (let row = 0; row < mH; row++) {
            const srcStart = row * mW
            const dstStart = layerOffset + (row + 1) * padW + 1
            for (let col = 0; col < mW; col++) {
                buf[dstStart + col] = srcStart + col < mask.mask.length ? mask.mask[srcStart + col] : 0
            }
        }
    }
    segTexture.needsUpdate = true

    // Update uniforms
    const uniforms = segMesh.material.uniforms
    uniforms.masks.value = segTexture
    uniforms.isInstance.value = isInstance
    uniforms.maskCount.value = maskCount

    const colorsArr = uniforms.colors.value
    const bboxesArr = uniforms.bboxes.value

    for (let i = 0; i < maskCount; i++) {
        const base = i * 4

        if (isInstance) {
            // Instance color from track ID
            const box = boxes && boxes[i] ? boxes[i] : null
            let cr, cg, cb
            if (box && box.track && box.track.id) {
                const c = clusterColor(trackIdToHash(box.track.id))
                cr = c.r; cg = c.g; cb = c.b
            } else {
                cr = 0; cg = 1; cb = 0.4  // default green
            }
            colorsArr[base] = cr
            colorsArr[base + 1] = cg
            colorsArr[base + 2] = cb
            colorsArr[base + 3] = MASK_MAX_ALPHA

            // Bbox expanded by 1 mask pixel for transparent border padding
            if (box) {
                const pixelW = box.width / mW
                const pixelH = box.height / mH
                bboxesArr[base] = box.center_x - box.width / 2 - pixelW
                bboxesArr[base + 1] = box.center_y - box.height / 2 - pixelH
                bboxesArr[base + 2] = box.width + 2 * pixelW
                bboxesArr[base + 3] = box.height + 2 * pixelH
            } else {
                bboxesArr[base] = 0
                bboxesArr[base + 1] = 0
                bboxesArr[base + 2] = 1
                bboxesArr[base + 3] = 1
            }
        } else {
            // Semantic color from mask_colors
            const cls = Math.min(i, mask_colors.length - 1)
            const mc = mask_colors[cls]
            colorsArr[base] = mc.r
            colorsArr[base + 1] = mc.g
            colorsArr[base + 2] = mc.b
            colorsArr[base + 3] = i === 0 ? 0.0 : 0.7  // class 0 is background → transparent

            // Full-frame for semantic
            bboxesArr[base] = 0
            bboxesArr[base + 1] = 0
            bboxesArr[base + 2] = 1
            bboxesArr[base + 3] = 1
        }
    }

    segMesh.visible = true
}

function startSegmentation() {
    ensureModelSocket()
    ensureSegMesh()
}

function stopSegmentation() {
    if (segMesh) {
        segMesh.visible = false
    }
    if (segTexture) {
        segTexture.dispose()
        segTexture = null
        segTextureW = 0
        segTextureH = 0
    }
    maybeCloseModelSocket()
}

// ---------------------------------------------------------------------------
// Shared Model WebSocket (used by Bounding Boxes + Segmentation)
// ---------------------------------------------------------------------------
function ensureModelSocket() {
    if (modelSocket) return
    modelSocket = modelstream(socketUrlModel, (msg) => {
        modelData = msg
    })
}

function maybeCloseModelSocket() {
    if (boxEnabled || segEnabled) return
    if (modelSocket) {
        modelSocket.onclose = null
        modelSocket.close()
        modelSocket = null
    }
    modelData = null
}

// ---------------------------------------------------------------------------
// Bounding Box Overlay
// ---------------------------------------------------------------------------
const boxCtx = boxCanvas.getContext('2d')

function startBoxes() {
    ensureModelSocket()
}

function stopBoxes() {
    boxCtx.clearRect(0, 0, boxCanvas.width, boxCanvas.height)
    maybeCloseModelSocket()
}

function renderBoxes() {
    if (!modelData) return

    const { boxes } = modelData
    if (!boxes || boxes.length === 0) return

    boxCtx.clearRect(0, 0, width, height)

    for (const box of boxes) {
        const x = (box.center_x - box.width / 2) * width
        const y = (box.center_y - box.height / 2) * height
        const w = box.width * width
        const h = box.height * height

        // Determine color from track ID (matching fusion clusterColor) or default green
        let color
        if (box.track && box.track.id) {
            const c = clusterColor(trackIdToHash(box.track.id))
            color = colorToCSS(c)
        } else {
            color = '#00ff66'
        }

        // Draw bounding box
        boxCtx.strokeStyle = color
        boxCtx.lineWidth = 2
        boxCtx.strokeRect(x, y, w, h)

        // Build label text
        const parts = []
        if (showLabels && box.label) parts.push(box.label)
        if (showConfidence && box.score > 0) parts.push(`${Math.round(box.score * 100)}%`)
        const label = parts.join(' ')

        if (label) {
            boxCtx.font = '14px sans-serif'
            const textMetrics = boxCtx.measureText(label)
            const textH = 18
            const textW = textMetrics.width + 8

            // Label background
            boxCtx.fillStyle = color
            boxCtx.fillRect(x, y - textH, textW, textH)

            // Label text
            boxCtx.fillStyle = '#000'
            boxCtx.fillText(label, x + 4, y - 4)
        }
    }
}

/**
 * Convert a UUID/track-ID string to a uint32 hash.
 * Extracts the first 8 hex nibbles (skipping dashes/dots) so the result
 * matches the fusion service's track_id field, allowing clusterColor() to
 * produce the same colour for a given track in both LiDAR and mask overlays.
 */
function trackIdToHash(id) {
    const MINUS = 0x2D, DOT = 0x2E, a = 0x61, A = 0x41, ZERO = 0x30
    let hexcode = 0
    let nibbles = 0
    for (const char of id) {
        const c = char.charCodeAt(0)
        if (c === MINUS || c === DOT) continue
        let val = 0
        if (c >= a) val = c - a + 10
        else if (c >= A) val = c - A + 10
        else if (c >= ZERO) val = c - ZERO
        hexcode = (hexcode << 4) + val
        nibbles++
        if (nibbles >= 8) break
    }
    return hexcode >>> 0
}

// Maximum overlay opacity (~75%).  Capping below 1.0 ensures overlapping
// masks blend via source-over rather than one fully replacing the other.
const MASK_MAX_ALPHA = 0.75

// ---------------------------------------------------------------------------
// LiDAR Overlay — Transform Math
// ---------------------------------------------------------------------------

/**
 * Build a 4x4 column-major matrix from translation + quaternion.
 */
function tfToMatrix(t, q) {
    const { x: tx, y: ty, z: tz } = t
    let { x: qx, y: qy, z: qz, w: qw } = q

    // Normalize quaternion (some publishers send non-unit quaternions)
    const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw)
    if (len > 1e-9) { qx /= len; qy /= len; qz /= len; qw /= len }

    // Rotation matrix from quaternion
    const xx = qx * qx, yy = qy * qy, zz = qz * qz
    const xy = qx * qy, xz = qx * qz, yz = qy * qz
    const wx = qw * qx, wy = qw * qy, wz = qw * qz

    // Column-major 4x4
    return new Float64Array([
        1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
        2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
        2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
        tx, ty, tz, 1,
    ])
}

/**
 * Invert a 4x4 column-major rigid-body transform (rotation + translation).
 * For rigid transforms: R^-1 = R^T, t^-1 = -R^T * t
 */
function invertRigidTransform(m) {
    // Extract rotation (transposed) and translation
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
 * Multiply two 4x4 column-major matrices: result = A * B
 */
function multiplyMatrices(a, b) {
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
 * Recompute the LiDAR→camera optical transform from the two tf_static
 * transforms we've received:
 *   base_link → lidar  (lidarTransform)
 *   base_link → camera_optical  (cameraTransform)
 *
 * lidar_to_camera = inv(base_link→camera_optical) * (base_link→lidar)
 *                 = camera_optical_from_base * base_from_lidar... no:
 *
 * tf_static gives parent→child. So:
 *   T_base_lidar = base_link → lidar  (point in lidar frame → base frame)
 *   T_base_cam   = base_link → camera_optical
 *
 * To go from lidar frame to camera frame:
 *   p_cam = inv(T_base_cam) * T_base_lidar * p_lidar
 */
function computeLidarToCameraMatrix() {
    if (!lidarTransform || !cameraTransform) {
        lidarToCameraMatrix = null
        return
    }

    const T_base_lidar = tfToMatrix(lidarTransform.translation, lidarTransform.rotation)
    const T_base_cam = tfToMatrix(cameraTransform.translation, cameraTransform.rotation)
    const T_cam_base = invertRigidTransform(T_base_cam)

    lidarToCameraMatrix = multiplyMatrices(T_cam_base, T_base_lidar)

    // Log matrix in row-major for readability (col-major [0,4,8,12] = row 0)
    const m = lidarToCameraMatrix
}

// ---------------------------------------------------------------------------
// LiDAR Overlay — Color Functions
// ---------------------------------------------------------------------------

function turboColormap(t) {
    t = Math.max(0, Math.min(1, t))
    const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))
    const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))
    const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))
    return {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b)),
    }
}

function clusterColor(id) {
    if (id < 0) return { r: 0.5, g: 0.5, b: 0.55 }

    const hue = (id * 137.508) % 360
    const sat = 0.85
    const light = 0.55

    const c = (1 - Math.abs(2 * light - 1)) * sat
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = light - c / 2
    let r, g, b
    if (hue < 60) { r = c; g = x; b = 0 }
    else if (hue < 120) { r = x; g = c; b = 0 }
    else if (hue < 180) { r = 0; g = c; b = x }
    else if (hue < 240) { r = 0; g = x; b = c }
    else if (hue < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    return { r: r + m, g: g + m, b: b + m }
}

function colorToCSS(c) {
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
}

// ---------------------------------------------------------------------------
// LiDAR Overlay — Point Cloud Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a PointCloud2 CDR message and return raw point data.
 * Returns { points: [{x,y,z,...}], fields: [{name,offset,datatype}], ... }
 */
function parsePointCloud2(arrayBuffer) {
    const view = new DataView(arrayBuffer)
    const reader = new CdrReader(view)

    // Header
    reader.uint32() // stamp.sec
    reader.uint32() // stamp.nsec
    reader.string() // frame_id

    const pcHeight = reader.uint32()
    const pcWidth = reader.uint32()

    // Fields
    const fieldCount = reader.sequenceLength()
    const fields = []
    for (let i = 0; i < fieldCount; i++) {
        const name = reader.string()
        const offset = reader.uint32()
        const datatype = reader.uint8()
        reader.uint32() // count
        fields.push({ name, offset, datatype })
    }

    const isBigEndian = reader.int8() > 0
    const pointStep = reader.uint32()
    reader.uint32() // row_step
    const rawData = reader.uint8Array()
    // reader.int8() // is_dense — skip

    const totalPoints = pcHeight * pcWidth
    const le = !isBigEndian

    // Build field lookup
    const fieldMap = {}
    for (const f of fields) fieldMap[f.name] = f

    // Wrap raw data in a DataView for field extraction
    const rawBuf = rawData.buffer
    const rawBase = rawData.byteOffset
    const dataView2 = new DataView(rawBuf, rawBase, rawData.length)

    function readField(pointIndex, field) {
        const o = pointIndex * pointStep + field.offset
        switch (field.datatype) {
            case 1: return dataView2.getInt8(o)
            case 2: return dataView2.getUint8(o)
            case 3: return dataView2.getInt16(o, le)
            case 4: return dataView2.getUint16(o, le)
            case 5: return dataView2.getInt32(o, le)
            case 6: return dataView2.getUint32(o, le)
            case 7: return dataView2.getFloat32(o, le)
            case 8: return dataView2.getFloat64(o, le)
            default: return 0
        }
    }

    return { totalPoints, fieldMap, readField }
}

// ---------------------------------------------------------------------------
// LiDAR Overlay — Projection & Rendering
// ---------------------------------------------------------------------------

/**
 * Project LiDAR points onto the camera image and draw on canvas.
 * Called from the animation loop when lidarEnabled && lidarPoints.
 */

function renderLidarOverlay() {
    if (!lidarPoints || !lidarToCameraMatrix || !cameraIntrinsics) {
        return
    }

    const { fx, fy, cx, cy } = cameraIntrinsics
    const m = lidarToCameraMatrix

    // Use enriched data when available and mode needs it, otherwise raw points
    const needsEnriched = ['cluster', 'vision_class', 'track_id', 'instance_id'].includes(lidarColorMode)
    const useEnriched = needsEnriched && lidarEnrichedPoints
    const rawData = useEnriched ? lidarEnrichedPoints : lidarPoints

    let parsed
    try {
        parsed = parsePointCloud2(rawData)
    } catch (e) {
        console.warn('LiDAR parse error:', e)
        return
    }

    const { totalPoints, fieldMap, readField } = parsed
    const hasX = fieldMap.x, hasY = fieldMap.y, hasZ = fieldMap.z
    if (!hasX || !hasY || !hasZ) return

    const hasClusterId = fieldMap.cluster_id
    const hasVisionClass = fieldMap.vision_class
    const hasTrackId = fieldMap.track_id
    const hasInstanceId = fieldMap.instance_id

    lidarCtx.clearRect(0, 0, width, height)

    // Determine max distance for distance coloring
    const maxDist = 30.0 // metres

    for (let i = 0; i < totalPoints; i++) {
        // Read LiDAR-frame coordinates
        const lx = readField(i, hasX)
        const ly = readField(i, hasY)
        const lz = readField(i, hasZ)

        // Skip invalid points
        if (!isFinite(lx) || !isFinite(ly) || !isFinite(lz)) continue

        // Filter noise/ground by cluster_id when using enriched data
        if (hasClusterId && needsEnriched) {
            const cid = readField(i, hasClusterId)
            if (cid === 0 && !lidarShowNoise) continue
            if (cid === 1 && !lidarShowGround) continue
        }

        // Transform: p_cam = M * p_lidar (column-major multiply)
        const camX = m[0] * lx + m[4] * ly + m[8] * lz + m[12]
        const camY = m[1] * lx + m[5] * ly + m[9] * lz + m[13]
        const camZ = m[2] * lx + m[6] * ly + m[10] * lz + m[14]

        // In camera optical frame: Z is forward, X is right, Y is down
        // Points behind the camera
        if (camZ <= 0) continue

        // Pinhole projection — tf_static accounts for camera orientation
        const u = fx * (camX / camZ) + cx
        const v = fy * (camY / camZ) + cy

        // Clip to image bounds (with small margin)
        if (u < -LIDAR_DOT_RADIUS || u > width + LIDAR_DOT_RADIUS) continue
        if (v < -LIDAR_DOT_RADIUS || v > height + LIDAR_DOT_RADIUS) continue

        // Determine color (always falls back to distance if needed field is missing)
        let color
        if (lidarColorMode === 'fixed') {
            color = { r: 0.0, g: 1.0, b: 0.4 }
        } else if (lidarColorMode === 'cluster' && hasClusterId) {
            color = clusterColor(readField(i, hasClusterId))
        } else if (lidarColorMode === 'vision_class' && hasVisionClass) {
            const cls = readField(i, hasVisionClass)
            if (cls <= 0) continue
            color = cls < mask_colors.length
                ? { r: mask_colors[cls].r, g: mask_colors[cls].g, b: mask_colors[cls].b }
                : { r: 0.5, g: 0.5, b: 0.5 }
        } else if (lidarColorMode === 'track_id' && hasTrackId) {
            const tid = readField(i, hasTrackId)
            if (tid === 0) continue
            color = clusterColor(tid)
        } else if (lidarColorMode === 'instance_id' && hasInstanceId) {
            const iid = readField(i, hasInstanceId)
            if (iid === 0) continue
            color = clusterColor(iid)
        } else {
            // distance mode or fallback when cluster/vision_class field unavailable
            const dist = Math.sqrt(lx * lx + ly * ly + lz * lz)
            color = turboColormap(Math.min(dist / maxDist, 1.0))
        }

        // Draw dot
        lidarCtx.fillStyle = colorToCSS(color)
        lidarCtx.fillRect(
            Math.round(u) - LIDAR_DOT_RADIUS,
            Math.round(v) - LIDAR_DOT_RADIUS,
            LIDAR_DOT_RADIUS * 2 + 1,
            LIDAR_DOT_RADIUS * 2 + 1
        )
    }

}

// ---------------------------------------------------------------------------
// LiDAR Overlay — WebSocket Management
// ---------------------------------------------------------------------------
let lidarPointsSocket = null   // always subscribed to /lidar/points
let lidarEnrichedSocket = null  // subscribed to /lidar/clusters when needed
let lidarEnrichedPoints = null  // latest cluster data (or null)

function startLidar() {
    // Subscribe to tf_static for camera-LiDAR transform
    if (!tfStaticSocket) {
        tfStaticSocket = new WebSocket(socketUrlTfStatic)
        tfStaticSocket.binaryType = 'arraybuffer'
        tfStaticSocket.onmessage = (event) => {
            parseTfStatic(event.data)
        }
        tfStaticSocket.onerror = (e) => console.warn('tf_static WebSocket error:', e)
    }

    // Subscribe to camera_info for intrinsics
    if (!cameraInfoSocket) {
        cameraInfoSocket = new WebSocket(socketUrlCameraInfo)
        cameraInfoSocket.binaryType = 'arraybuffer'
        cameraInfoSocket.onmessage = (event) => {
            parseCameraInfo(event.data)
        }
        cameraInfoSocket.onerror = (e) => console.warn('camera_info WebSocket error:', e)
    }

    // Always subscribe to the raw points topic
    if (!lidarPointsSocket) {
        lidarPointsSocket = new WebSocket(socketUrlLidar)
        lidarPointsSocket.binaryType = 'arraybuffer'
        lidarPointsSocket.onmessage = (event) => {
            lidarPoints = event.data
        }
        lidarPointsSocket.onerror = (e) => console.warn('LiDAR points WebSocket error:', e)
    }

    // Subscribe to cluster topic if needed
    connectEnrichedSocket()
}

function connectEnrichedSocket() {
    if (lidarEnrichedSocket) {
        lidarEnrichedSocket.onclose = null
        lidarEnrichedSocket.close()
        lidarEnrichedSocket = null
    }
    lidarEnrichedPoints = null

    const needsEnriched = ['cluster', 'vision_class', 'track_id', 'instance_id'].includes(lidarColorMode)
    if (needsEnriched) {
        const enrichedUrl = lidarColorMode === 'cluster' ? socketUrlLidarCluster : socketUrlFusion
        lidarEnrichedSocket = new WebSocket(enrichedUrl)
        lidarEnrichedSocket.binaryType = 'arraybuffer'
        lidarEnrichedSocket.onmessage = (event) => {
            lidarEnrichedPoints = event.data
        }
        lidarEnrichedSocket.onerror = (e) => console.warn('LiDAR cluster WebSocket error:', e)
    }
}

function stopLidar() {
    if (lidarPointsSocket) {
        lidarPointsSocket.onclose = null
        lidarPointsSocket.close()
        lidarPointsSocket = null
    }
    if (lidarEnrichedSocket) {
        lidarEnrichedSocket.onclose = null
        lidarEnrichedSocket.close()
        lidarEnrichedSocket = null
    }
    if (tfStaticSocket) {
        tfStaticSocket.onclose = null
        tfStaticSocket.close()
        tfStaticSocket = null
    }
    if (cameraInfoSocket) {
        cameraInfoSocket.onclose = null
        cameraInfoSocket.close()
        cameraInfoSocket = null
    }
    lidarPoints = null
    lidarEnrichedPoints = null
    lidarTransform = null
    cameraTransform = null
    lidarToCameraMatrix = null
    cameraIntrinsics = null
    // Clear overlay canvas
    lidarCtx.clearRect(0, 0, width, height)
}

/**
 * Parse a single TransformStamped message from /tf_static.
 * Each WebSocket message is one transform (NOT a TFMessage sequence).
 *
 * CDR layout:
 *   uint32 stamp.sec, uint32 stamp.nanosec,
 *   string frame_id, string child_frame_id,
 *   float64 translation.{x,y,z}, float64 rotation.{x,y,z,w}
 */
function parseTfStatic(arrayBuffer) {
    try {
        const view = new DataView(arrayBuffer)
        const reader = new CdrReader(view)

        // Header
        reader.uint32() // stamp.sec
        reader.uint32() // stamp.nanosec
        const frameId = reader.string()
        const childFrameId = reader.string()

        // Transform
        const tx = reader.float64()
        const ty = reader.float64()
        const tz = reader.float64()
        const rx = reader.float64()
        const ry = reader.float64()
        const rz = reader.float64()
        const rw = reader.float64()

        const transform = {
            translation: { x: tx, y: ty, z: tz },
            rotation: { x: rx, y: ry, z: rz, w: rw },
            frameId,
            childFrameId,
        }

        // Store the base_link → lidar transform
        if (childFrameId.includes('lidar')) {
            lidarTransform = transform
            computeLidarToCameraMatrix()
        }

        // Store the base_link → camera optical transform
        // Prefer 'camera_optical' over 'base_link_optical' if both exist
        if (childFrameId.includes('optical')) {
            if (!cameraTransform || childFrameId.includes('camera')) {
                cameraTransform = transform
                computeLidarToCameraMatrix()
            }
        }
    } catch (e) {
        console.warn('Failed to parse tf_static:', e)
    }
}

/**
 * Parse CameraInfo CDR message to extract intrinsics (K matrix).
 *
 * CDR layout (sensor_msgs/msg/CameraInfo):
 *   Header header
 *   uint32 height, uint32 width
 *   string distortion_model
 *   float64[] d (sequence)
 *   float64[9] k
 *   float64[9] r
 *   float64[12] p
 *   uint32 binning_x, uint32 binning_y
 *   RegionOfInterest roi
 */
function parseCameraInfo(arrayBuffer) {
    try {
        const view = new DataView(arrayBuffer)
        const reader = new CdrReader(view)

        // Header
        reader.uint32() // stamp.sec
        reader.uint32() // stamp.nanosec
        const ciFrameId = reader.string()

        // Image dimensions
        const imgHeight = reader.uint32()
        const imgWidth = reader.uint32()

        // Distortion model
        const distModel = reader.string()

        // D (distortion coefficients) — variable-length sequence
        const dLen = reader.sequenceLength()
        for (let i = 0; i < dLen; i++) reader.float64()

        // K (intrinsic matrix) — fixed 9 float64s, no length prefix
        const k = []
        for (let i = 0; i < 9; i++) k.push(reader.float64())

        const fx = k[0]
        const fy = k[4]
        const cx = k[2]
        const cy = k[5]

        if (fx > 0 && fy > 0) {
            cameraIntrinsics = { fx, fy, cx, cy }

            // Once we have intrinsics, we can stop subscribing
            if (cameraInfoSocket) {
                cameraInfoSocket.onclose = null
                cameraInfoSocket.close()
                cameraInfoSocket = null
            }
        } else {
            console.warn('camera_info: uncalibrated (fx=0)')
        }
    } catch (e) {
        console.warn('Failed to parse camera_info:', e)
    }
}

// ---------------------------------------------------------------------------
// Toggle Wiring
// ---------------------------------------------------------------------------
function wireToggle(checkbox, section, options, onToggle) {
    checkbox.addEventListener('change', () => {
        const on = checkbox.checked
        section.setAttribute('data-active', on)
        options.setAttribute('data-visible', on)
        onToggle(on)
    })
}

overlaySegToggle.addEventListener('change', () => {
    segEnabled = overlaySegToggle.checked
    overlaySegSection.setAttribute('data-active', segEnabled)
    if (segEnabled) startSegmentation()
    else stopSegmentation()
})

wireToggle(overlayBoxToggle, overlayBoxSection, boxOptions, (on) => {
    boxEnabled = on
    if (on) startBoxes()
    else stopBoxes()
})

wireToggle(overlayLidarToggle, overlayLidarSection, lidarOptions, (on) => {
    lidarEnabled = on
    if (on) startLidar()
    else stopLidar()
})

lidarColorSelect.addEventListener('change', () => {
    lidarColorMode = lidarColorSelect.value
    lidarClusterFilters.setAttribute('data-visible', lidarColorMode === 'cluster')
    if (lidarEnabled) connectEnrichedSocket()
})

boxLabelsCheckbox.addEventListener('change', () => { showLabels = boxLabelsCheckbox.checked })
boxConfidenceCheckbox.addEventListener('change', () => { showConfidence = boxConfidenceCheckbox.checked })
lidarNoiseCheckbox.addEventListener('change', () => { lidarShowNoise = lidarNoiseCheckbox.checked })
lidarGroundCheckbox.addEventListener('change', () => { lidarShowGround = lidarGroundCheckbox.checked })

// ---------------------------------------------------------------------------
// Animation Loop
// ---------------------------------------------------------------------------
renderer.setAnimationLoop(() => {
    if (texture_camera) texture_camera.needsUpdate = true

    // Update segmentation uniforms before render (shader runs on GPU)
    if (segEnabled) {
        renderSegmentation()
    }

    renderer.render(scene, camera)

    // Render 2D canvas overlays after GL render
    if (boxEnabled) {
        renderBoxes()
    }
    if (lidarEnabled) {
        renderLidarOverlay()
    }
})

// ---------------------------------------------------------------------------
// Timeout / Unavailable
// ---------------------------------------------------------------------------
let unavailableTimer = null
function resetTimeout() {
    cameraUnavailable.style.display = 'none'
    clearTimeout(unavailableTimer)
    unavailableTimer = setTimeout(() => {
        cameraUnavailable.style.display = 'flex'
    }, UNAVAILABLE_TIMEOUT_MS)
}

// Show unavailable initially until first frame arrives
cameraUnavailable.style.display = 'flex'

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
fetch('/config/webui/details')
    .then((res) => res.json())
    .then((config) => {
        const parsed = parseNumbersInObject(config)
        initConfig(parsed)
        initVideoStream()
    })
    .catch((err) => {
        console.warn('Could not load config — using defaults:', err)
        initVideoStream()
    })
