// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import ProjectedMask from './ProjectedMask.js'
import segstream, { get_shape } from './mask.js'
import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import boxesstream from './boxes.js'
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
let socketUrlMask = '/rt/detect/mask/'
let socketUrlMaskCompressed = '/rt/model/mask_compressed/'
let socketUrlDetect = '/rt/detect/boxes2d/'
let socketUrlLidar = '/rt/lidar/points/'
let socketUrlLidarCluster = '/rt/lidar/clusters/'
let socketUrlTfStatic = '/rt/tf_static/'
let socketUrlCameraInfo = '/rt/camera/info/'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mirror = false
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
let boxData = null
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
const segOptions = document.getElementById('segmentation-options')
const segSourceSelect = document.getElementById('segmentation-source')

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

// Box + LiDAR overlay canvas sizing
boxCanvas.width = width
boxCanvas.height = height
lidarCanvas.width = width
lidarCanvas.height = height

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------
function initConfig(config) {
    if (config.H264_TOPIC) socketUrlH264 = config.H264_TOPIC
    if (config.MASK_TOPIC) socketUrlMask = config.MASK_TOPIC
    if (config.DETECT_TOPIC) socketUrlDetect = config.DETECT_TOPIC
    if (config.LIDAR_TOPIC) socketUrlLidar = config.LIDAR_TOPIC
    if (config.CLUSTER_TOPIC) socketUrlLidarCluster = config.CLUSTER_TOPIC
    if (config.CAMERA_INFO_TOPIC) socketUrlCameraInfo = config.CAMERA_INFO_TOPIC
    if (typeof config.MIRROR === 'boolean') mirror = config.MIRROR
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
            flip: mirror,
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
// Segmentation Overlay
// ---------------------------------------------------------------------------
function startSegmentation() {
    const topic = segSourceSelect.value === 'compressed'
        ? socketUrlMaskCompressed : socketUrlMask

    const quad = new THREE.PlaneGeometry(width / height * 500, 500)

    get_shape(topic, (h, w, length, mask) => {
        const classes = Math.round(mask.length / h / w)
        segstream(topic, h, w, classes, () => {}).then((texture_mask) => {
            const material = new ProjectedMask({
                camera: camera,
                texture: texture_mask,
                transparent: true,
                flip: mirror,
                colors: mask_colors,
            })
            segMesh = new THREE.Mesh(quad, material)
            segMesh.needsUpdate = true
            segMesh.position.z = 50
            segMesh.rotation.x = PI
            segMesh.renderOrder = 1
            scene.add(segMesh)
        })
    })
}

function stopSegmentation() {
    if (segMesh) {
        scene.remove(segMesh)
        segMesh.geometry.dispose()
        segMesh.material.dispose()
        segMesh = null
    }
}

// ---------------------------------------------------------------------------
// Bounding Box Overlay
// ---------------------------------------------------------------------------
function startBoxes() {
    const drawBoxSettings = {
        canvas: boxCanvas,
        drawBox: true,
        drawBoxText: showLabels,
        mirror: mirror,
    }
    boxesstream(socketUrlDetect, drawBoxSettings).then((b) => {
        boxData = b
    })
}

function stopBoxes() {
    const ctx = boxCanvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, boxCanvas.width, boxCanvas.height)
    boxData = null
}

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
    console.log('LiDAR→camera matrix:')
    console.log(`  [${m[0].toFixed(4)}, ${m[4].toFixed(4)}, ${m[8].toFixed(4)}, ${m[12].toFixed(4)}]`)
    console.log(`  [${m[1].toFixed(4)}, ${m[5].toFixed(4)}, ${m[9].toFixed(4)}, ${m[13].toFixed(4)}]`)
    console.log(`  [${m[2].toFixed(4)}, ${m[6].toFixed(4)}, ${m[10].toFixed(4)}, ${m[14].toFixed(4)}]`)
    console.log(`  Using: "${lidarTransform.childFrameId}" and "${cameraTransform.childFrameId}"`)
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

let lidarLoggedSample = false

/**
 * Project LiDAR points onto the camera image and draw on canvas.
 * Called from the animation loop when lidarEnabled && lidarPoints.
 */
let lidarLoggedStatus = false

function renderLidarOverlay() {
    if (!lidarPoints || !lidarToCameraMatrix || !cameraIntrinsics) {
        if (!lidarLoggedStatus && lidarToCameraMatrix) {
            console.log(`LiDAR overlay waiting: points=${!!lidarPoints} matrix=${!!lidarToCameraMatrix} intrinsics=${!!cameraIntrinsics}`)
            lidarLoggedStatus = true
        }
        return
    }

    const { fx, fy, cx, cy } = cameraIntrinsics
    const m = lidarToCameraMatrix

    // Use cluster data when available and mode needs it, otherwise raw points
    const useCluster = (lidarColorMode === 'cluster' || lidarColorMode === 'vision_class') && lidarClusterPoints
    const rawData = useCluster ? lidarClusterPoints : lidarPoints

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

    if (!lidarLoggedSample) {
        console.log(`LiDAR cloud: ${totalPoints} pts, fields: [${Object.keys(fieldMap).join(', ')}]`)
    }

    lidarCtx.clearRect(0, 0, width, height)

    // Determine max distance for distance coloring
    const maxDist = 30.0 // metres

    // Log a sample point once for debugging
    let loggedCount = 0

    for (let i = 0; i < totalPoints; i++) {
        // Read LiDAR-frame coordinates
        const lx = readField(i, hasX)
        const ly = readField(i, hasY)
        const lz = readField(i, hasZ)

        // Skip invalid points
        if (!isFinite(lx) || !isFinite(ly) || !isFinite(lz)) continue

        // Filter noise/ground by cluster_id when in cluster mode
        if (hasClusterId && (lidarColorMode === 'cluster' || lidarColorMode === 'vision_class')) {
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

        // Pinhole projection
        // When mirror=false (Maivin default), the video is displayed mirrored
        // but the camera_optical transform is for the un-mirrored view, so flip u.
        // When mirror=true, the video is un-mirrored to match the transform.
        let u = fx * (camX / camZ) + cx
        if (!mirror) u = width - u
        const v = fy * (camY / camZ) + cy

        // Log sample points once
        if (!lidarLoggedSample && loggedCount < 3) {
            console.log(`LiDAR sample[${i}]: lidar(${lx.toFixed(2)},${ly.toFixed(2)},${lz.toFixed(2)}) → cam(${camX.toFixed(2)},${camY.toFixed(2)},${camZ.toFixed(2)}) → px(${u.toFixed(0)},${v.toFixed(0)})`)
            loggedCount++
        }

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
            color = cls > 0 && cls < mask_colors.length
                ? { r: mask_colors[cls][0] / 255, g: mask_colors[cls][1] / 255, b: mask_colors[cls][2] / 255 }
                : { r: 0.5, g: 0.5, b: 0.5 }
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

    if (!lidarLoggedSample && loggedCount > 0) {
        lidarLoggedSample = true
    }
}

// ---------------------------------------------------------------------------
// LiDAR Overlay — WebSocket Management
// ---------------------------------------------------------------------------
let lidarPointsSocket = null   // always subscribed to /lidar/points
let lidarClusterSocket = null  // subscribed to /lidar/clusters when needed
let lidarClusterPoints = null  // latest cluster data (or null)

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
        console.log(`Subscribing to camera_info: ${socketUrlCameraInfo}`)
        cameraInfoSocket = new WebSocket(socketUrlCameraInfo)
        cameraInfoSocket.binaryType = 'arraybuffer'
        cameraInfoSocket.onopen = () => console.log('camera_info WebSocket connected')
        cameraInfoSocket.onmessage = (event) => {
            parseCameraInfo(event.data)
        }
        cameraInfoSocket.onerror = (e) => console.warn('camera_info WebSocket error:', e)
        cameraInfoSocket.onclose = (e) => console.log(`camera_info WebSocket closed: code=${e.code}`)
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
    connectClusterSocket()
}

function connectClusterSocket() {
    if (lidarClusterSocket) {
        lidarClusterSocket.onclose = null
        lidarClusterSocket.close()
        lidarClusterSocket = null
    }
    lidarClusterPoints = null

    if (lidarColorMode === 'cluster' || lidarColorMode === 'vision_class') {
        lidarClusterSocket = new WebSocket(socketUrlLidarCluster)
        lidarClusterSocket.binaryType = 'arraybuffer'
        lidarClusterSocket.onmessage = (event) => {
            lidarClusterPoints = event.data
        }
        lidarClusterSocket.onerror = (e) => console.warn('LiDAR cluster WebSocket error:', e)
    }
}

function stopLidar() {
    if (lidarPointsSocket) {
        lidarPointsSocket.onclose = null
        lidarPointsSocket.close()
        lidarPointsSocket = null
    }
    if (lidarClusterSocket) {
        lidarClusterSocket.onclose = null
        lidarClusterSocket.close()
        lidarClusterSocket = null
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
    lidarClusterPoints = null
    lidarTransform = null
    cameraTransform = null
    lidarToCameraMatrix = null
    cameraIntrinsics = null
    lidarLoggedSample = false
    lidarLoggedStatus = false

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

        console.log(`tf_static: "${frameId}" → "${childFrameId}" t=[${tx.toFixed(3)}, ${ty.toFixed(3)}, ${tz.toFixed(3)}] q=[${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)}, ${rw.toFixed(4)}]`)

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

        console.log(`camera_info: frame="${ciFrameId}" ${imgWidth}x${imgHeight} model="${distModel}" D[${dLen}] K=[${k.map(v => v.toFixed(1)).join(', ')}]`)

        if (fx > 0 && fy > 0) {
            cameraIntrinsics = { fx, fy, cx, cy }
            console.log(`Camera intrinsics: fx=${fx.toFixed(1)} fy=${fy.toFixed(1)} cx=${cx.toFixed(1)} cy=${cy.toFixed(1)}`)

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

wireToggle(overlaySegToggle, overlaySegSection, segOptions, (on) => {
    segEnabled = on
    if (on) startSegmentation()
    else stopSegmentation()
})

segSourceSelect.addEventListener('change', () => {
    if (segEnabled) {
        stopSegmentation()
        startSegmentation()
    }
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
    lidarLoggedSample = false
    if (lidarEnabled) connectClusterSocket()
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
    renderer.render(scene, camera)

    // Render LiDAR overlay on 2D canvas
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
