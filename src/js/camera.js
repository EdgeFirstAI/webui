// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import modelstream from './model.js'
import ModelInfo from './modelInfo.js'
import { mask_colors } from './utils.js'
import { CdrReader } from './Cdr.js'
import { parsePointCloud2, readField } from './pointcloud2.js'
import createSyncedVideo from './SyncedVideo.js'
import StampBuffer, {
    LIDAR_BUFFER_CAPACITY, MODEL_BUFFER_CAPACITY, RADAR_BUFFER_CAPACITY, selectDerived, selectSensor, sensorToleranceMs,
} from './StampBuffer.js'
import { readHeaderStampMs, stampToMs } from './stamp.js'
import { sameTransform, sensorToCameraMatrix } from './projection.js'
import createReconnectingSocket from './reconnectingSocket.js'
import {
    TOPIC_POLL_MS, applyTopicPoll, classifyTopicResponse, createTopicGateState, decideSection, shouldPollTopics,
    topicStatusUrl,
} from './topicGate.js'
import {
    availableRadarColorModes, buildRadarFrame, normalizeRadarSettings, parseHexColor, readRadarColumns,
} from './radarOverlay.js'
import { loadMirror, mirrorCssTransform, mirrorScale, saveMirror } from './viewMirror.js'

const PI = Math.PI
const UNAVAILABLE_TIMEOUT_MS = 15000
const LIDAR_DOT_RADIUS = 3
// Radar returns tens of targets, so they are drawn well above LiDAR dot size.
const RADAR_DOT_RADIUS = 6
const RADAR_SETTINGS_KEY = 'camera.radarOverlay'
const MIRROR_KEY = 'camera.mirror'
const RADAR_CALIBRATION_WARN_MS = 5000

// ---------------------------------------------------------------------------
// Default topic URLs
// ---------------------------------------------------------------------------
let socketUrlLidar = '/api/rt/lidar/points/'
let socketUrlLidarCluster = '/api/rt/lidar/clusters/'
let socketUrlFusion = '/api/rt/fusion/lidar/'
let socketUrlModel = '/api/rt/model/output/'
let socketUrlModelInfo = '/api/rt/model/info/'
let socketUrlTfStatic = '/api/rt/tf_static/'
let socketUrlCameraInfo = '/api/rt/camera/info/'
let socketUrlRadar = '/api/rt/radar/targets/'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Overlay enabled state
let segEnabled = false
let boxEnabled = false
let lidarEnabled = false
let lidarColorMode = 'distance'
let showLabels = true
let showConfidence = true
let lidarShowNoise = true
let lidarShowGround = true
let drawBackground = false
const radarSettings = normalizeRadarSettings(loadRadarSettings())
let radarEnabled = false
let mirrorMode = loadMirror(MIRROR_KEY)

// Overlay scene objects (for cleanup)
let segMesh = null
let modelData = null
let modelSocket = null
let tfStaticSocket = null    // reconnecting socket handle
let cameraInfoSocket = null  // reconnecting socket handle
let lidarTransform = null
let cameraTransform = null
let lidarPoints = null

// Camera intrinsics from /camera/info
let cameraIntrinsics = null // { fx, fy, cx, cy }

// Computed LiDAR→camera 4x4 matrix (Float64Array[16], column-major)
let lidarToCameraMatrix = null

// Radar overlay: base_link → radar transform, radar→camera matrix, the
// sample drawn this frame, and the projected points cached per sample.
let radarTransform = null
let radarToCameraMatrix = null
let radarPoints = null
let radarSocket = null  // reconnecting socket handle
let radarLastArrivalMs = null
let radarWarnTimer = null
let cachedRadarRawRef = null
let cachedRadarColumns = null
let cachedRadarFrame = null
let cachedRadarFrameKey = null

// PointCloud2 parse cache — avoid re-parsing the same buffer every frame
let cachedLidarRawRef = null
let cachedLidarParsed = null

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const cameraStage = document.getElementById('camera-stage')
const playerCanvas = document.getElementById('player')
const boxCanvas = document.getElementById('boxes')
const lidarCanvas = document.getElementById('lidar-overlay')
const lidarCtx = lidarCanvas.getContext('2d')
const radarCanvas = document.getElementById('radar-overlay')
const radarCtx = radarCanvas.getContext('2d')
const cameraUnavailable = document.getElementById('camera-unavailable')
const syncStatsEl = document.getElementById('sync-stats')

// Overlay controls
const overlaySegToggle = document.getElementById('overlay-segmentation')
const overlaySegSection = overlaySegToggle.closest('.camera-controls__section')
const segOptions = document.getElementById('seg-options')
const segDrawBgCheckbox = document.getElementById('seg-draw-background')
const segDrawBgLabel = document.getElementById('seg-draw-bg-label')

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
const lidarDrawBgCheckbox = document.getElementById('lidar-draw-background')
const lidarDrawBgLabel = document.getElementById('lidar-draw-bg-label')

const overlayRadarToggle = document.getElementById('overlay-radar')
const overlayRadarSection = overlayRadarToggle.closest('.camera-controls__section')
const radarOptions = document.getElementById('radar-options')
const radarColorSelect = document.getElementById('radar-color-mode')
const radarColorInput = document.getElementById('radar-color')
const radarColorLabel = document.getElementById('radar-color-label')
const mirrorSelect = document.getElementById('view-mirror')

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
radarCanvas.width = width
radarCanvas.height = height

// ---------------------------------------------------------------------------
// Config Loading
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Video Stream
// ---------------------------------------------------------------------------
const modelBuffer = new StampBuffer({ capacity: MODEL_BUFFER_CAPACITY })
// Sensor buffers keep what the displayed frame can still reach, so they
// follow the display lag up to their capacity (see StampBuffer.js).
const lidarBuffer = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
const lidarEnrichedBuffer = new StampBuffer({ capacity: LIDAR_BUFFER_CAPACITY })
const radarBuffer = new StampBuffer({ capacity: RADAR_BUFFER_CAPACITY })
let lastStatsUpdate = 0

let videoMaterial = null
const video = createSyncedVideo({
    onFrame: () => resetTimeout(),
    onTexture: (tex) => {
        if (videoMaterial) {
            videoMaterial.uniforms.tex.value = tex
            videoMaterial.needsUpdate = true
            return
        }
        const quad = new THREE.PlaneGeometry(width / height * 500, 500)
        videoMaterial = new ProjectedMaterial({ camera, texture: tex, color: '#000', transparent: true })
        const mesh = new THREE.Mesh(quad, videoMaterial)
        mesh.position.z = 50
        mesh.rotation.x = PI
        mesh.renderOrder = 0
        scene.add(mesh)
    },
})

function renderSyncStats(stats) {
    const now = performance.now()
    if (now - lastStatsUpdate < 1000) return
    lastStatsUpdate = now
    const names = Object.keys(stats.streams)
    if (names.length === 0) {
        syncStatsEl.style.display = 'none'
        return
    }
    const lines = [`Delay:  ${stats.delayMs.toFixed(0)}ms`]
    for (const name of names) {
        lines.push(`${name.padEnd(6)} lag ${stats.streams[name].lagMs.toFixed(0)}ms`)
    }
    syncStatsEl.style.display = 'block'
    syncStatsEl.textContent = lines.join('\n')
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
    uniform vec2 maskScales[${MAX_SEG_MASKS}];
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
                // Map UV to mask-local coordinates, then scale to this
                // mask's subregion within the shared texture atlas
                vec2 maskUV = (uv - bb.xy) / bb.zw * maskScales[i];
                float sig = texture(masks, vec3(maskUV, float(i))).r;
                // Confidence threshold to eliminate background within the ROI.
                // Instance masks are low-res protos (~96px) upscaled ~12× via
                // bilinear filtering, so boundary gradients are wide. The lower
                // edge (0.5) matches HAL's sigmoid threshold; the upper edge
                // (0.65) ensures only confident foreground is fully opaque.
                float edge = smoothstep(0.5, 0.65, sig);
                if (edge <= 0.0) continue;
                float a = edge * colors[i].a;
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
            // Mask data is sigmoid probabilities — discard below 0.5,
            // fade to full opacity by 0.65 for anti-aliased edges
            float edge = smoothstep(0.5, 0.65, maxVal);
            if (edge <= 0.0) {
                pc_fragColor = vec4(0.0);
            } else {
                pc_fragColor = vec4(colors[maxIdx].rgb, colors[maxIdx].a * edge);
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
    // Per-mask UV scale: maps [0,1] to each mask's subregion in the atlas
    const scalesArr = new Float32Array(MAX_SEG_MASKS * 2).fill(1.0)

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
            maskScales: { value: scalesArr },
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

    // Instance masks have per-box crop dimensions; find the max so every
    // mask layer fits in the same DataArrayTexture atlas.
    let maxW = 0, maxH = 0
    for (let i = 0; i < maskCount; i++) {
        if (masks[i].width > maxW) maxW = masks[i].width
        if (masks[i].height > maxH) maxH = masks[i].height
    }
    if (maxW === 0 || maxH === 0) return

    // Pad with a 1px transparent border so GPU bilinear interpolation
    // blends to zero at the crop boundary
    const padW = maxW + 2
    const padH = maxH + 2

    ensureSegTexture(padW, padH)

    // Copy each mask into its DataArrayTexture layer using that mask's
    // own width/height (left-aligned at texel (1,1) within the layer)
    const buf = segTexture.image.data
    const layerSize = padW * padH
    buf.fill(0)
    for (let i = 0; i < maskCount; i++) {
        const mask = masks[i]
        if (!mask.mask || mask.mask.length === 0) continue
        const w = mask.width
        const h = mask.height
        const layerOffset = i * layerSize
        for (let row = 0; row < h; row++) {
            const srcStart = row * w
            const dstStart = layerOffset + (row + 1) * padW + 1
            for (let col = 0; col < w; col++) {
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
    const scalesArr = uniforms.maskScales.value

    for (let i = 0; i < maskCount; i++) {
        const base = i * 4

        if (isInstance) {
            const mask = masks[i]
            // UV scale: map [0,1] to this mask's padded subregion in the atlas
            scalesArr[i * 2]     = (mask.width + 2) / padW
            scalesArr[i * 2 + 1] = (mask.height + 2) / padH

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
                const pixelW = box.width / mask.width
                const pixelH = box.height / mask.height
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
            // Semantic color from mask_colors — all classes are valid unless
            // ModelInfo identifies them as background
            const isBg = ModelInfo.isBackground(i)
            const cls = Math.min(i, mask_colors.length - 1)
            const mc = mask_colors[cls]
            colorsArr[base] = mc.r
            colorsArr[base + 1] = mc.g
            colorsArr[base + 2] = mc.b
            colorsArr[base + 3] = (isBg && !drawBackground) ? 0.0 : 0.7

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
        const stampMs = stampToMs(msg.header.time.sec, msg.header.time.nanosec)
        video.clock.observe('model', stampMs, performance.now())
        modelBuffer.push(stampMs, msg)
    })
}

function maybeCloseModelSocket() {
    if (boxEnabled || segEnabled) return
    if (modelSocket) {
        modelSocket.close()
        modelSocket = null
    }
    modelData = null
    modelBuffer.clear()
    video.clock.remove('model')
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
    boxCtx.clearRect(0, 0, width, height)
    if (!modelData) return

    const { boxes } = modelData
    if (!boxes || boxes.length === 0) return

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

            // Label text, counter-mirrored about the label centre so it reads
            // correctly when the stage is mirrored.
            const { x: sx, y: sy } = mirrorScale(mirrorMode)
            boxCtx.save()
            boxCtx.translate(x + textW / 2, y - textH / 2)
            boxCtx.scale(sx, sy)
            boxCtx.fillStyle = '#000'
            boxCtx.fillText(label, -textW / 2 + 4, textH / 2 - 4)
            boxCtx.restore()
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
// Sensor Overlays — Transforms
// ---------------------------------------------------------------------------

/**
 * Store a /tf_static transform and recompute only the sensor→camera optical
 * matrices that depend on it. /tf_static repeats every transform about once
 * a second; a repeat with the same values keeps the existing matrix, so
 * caches keyed on the matrix stay valid until the calibration changes.
 * @param {'lidar'|'radar'|'camera'} which
 * @param {object|null} transform
 */
function setTransform(which, transform) {
    if (which === 'lidar') {
        if (sameTransform(lidarTransform, transform)) return
        lidarTransform = transform
        lidarToCameraMatrix = sensorToCameraMatrix(lidarTransform, cameraTransform)
    } else if (which === 'radar') {
        if (sameTransform(radarTransform, transform)) return
        radarTransform = transform
        radarToCameraMatrix = sensorToCameraMatrix(radarTransform, cameraTransform)
    } else {
        if (sameTransform(cameraTransform, transform)) return
        cameraTransform = transform
        lidarToCameraMatrix = sensorToCameraMatrix(lidarTransform, cameraTransform)
        radarToCameraMatrix = sensorToCameraMatrix(radarTransform, cameraTransform)
    }
}

// ---------------------------------------------------------------------------
// LiDAR Overlay — Dynamic Colour Mode Detection
// ---------------------------------------------------------------------------

const ENRICHED_COLOR_MODES = [
    { value: 'cluster',      label: 'Cluster',      field: 'cluster_id' },
    { value: 'vision_class', label: 'Vision Class',  field: 'vision_class' },
    { value: 'track_id',     label: 'Track ID',      field: 'track_id' },
    { value: 'instance_id',  label: 'Instance ID',   field: 'instance_id' },
]

/** True when the LiDAR colour mode is drawn from enriched points. */
function colorModeNeedsEnriched() {
    return ENRICHED_COLOR_MODES.some((mode) => mode.value === lidarColorMode)
}

/**
 * Update the LiDAR colour-mode dropdown to show only modes whose fields
 * exist in the current PointCloud2 data. fixed/distance are always present.
 */
function updateAvailableLidarColorModes(fieldMap) {
    for (const mode of ENRICHED_COLOR_MODES) {
        if (!fieldMap[mode.field]) continue
        let option = lidarColorSelect.querySelector(`option[value="${mode.value}"]`)
        if (!option) {
            option = document.createElement('option')
            option.value = mode.value
            option.textContent = mode.label
            lidarColorSelect.appendChild(option)
        }
    }
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
    if (id <= 0) return { r: 0.5, g: 0.5, b: 0.55 }

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
// LiDAR Overlay — Projection & Rendering
// ---------------------------------------------------------------------------

/**
 * Project LiDAR points onto the camera image and draw on canvas.
 * Called from the animation loop when lidarEnabled && lidarPoints.
 */

function renderLidarOverlay() {
    lidarCtx.clearRect(0, 0, width, height)
    if (!lidarPoints || !lidarToCameraMatrix || !cameraIntrinsics) {
        return
    }

    const { fx, fy, cx, cy } = cameraIntrinsics
    const m = lidarToCameraMatrix

    // Use enriched data when available and mode needs it, otherwise raw points
    const useEnriched = colorModeNeedsEnriched() && lidarEnrichedPoints
    const rawData = useEnriched ? lidarEnrichedPoints : lidarPoints

    let parsed
    if (rawData === cachedLidarRawRef) {
        parsed = cachedLidarParsed
    } else {
        try {
            parsed = parsePointCloud2(rawData)
        } catch (e) {
            console.warn('LiDAR parse error:', e)
            return
        }
        cachedLidarRawRef = rawData
        cachedLidarParsed = parsed
    }

    const { totalPoints, fieldMap } = parsed
    const hasX = fieldMap.x, hasY = fieldMap.y, hasZ = fieldMap.z
    if (!hasX || !hasY || !hasZ) return

    const hasClusterId = fieldMap.cluster_id
    const hasVisionClass = fieldMap.vision_class
    const hasTrackId = fieldMap.track_id
    const hasInstanceId = fieldMap.instance_id

    // Determine max distance for distance coloring
    const maxDist = 30.0 // metres

    for (let i = 0; i < totalPoints; i++) {
        // Read LiDAR-frame coordinates
        const lx = readField(parsed, i, hasX)
        const ly = readField(parsed, i, hasY)
        const lz = readField(parsed, i, hasZ)

        // Skip invalid points
        if (!isFinite(lx) || !isFinite(ly) || !isFinite(lz)) continue

        // Filter noise/ground by cluster_id when using enriched data
        if (hasClusterId && lidarColorMode === 'cluster') {
            const cid = readField(parsed, i, hasClusterId)
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
            color = clusterColor(readField(parsed, i, hasClusterId))
        } else if (lidarColorMode === 'vision_class' && hasVisionClass) {
            const cls = readField(parsed, i, hasVisionClass)
            if (ModelInfo.isBackground(cls) && !drawBackground) continue
            color = cls < mask_colors.length
                ? { r: mask_colors[cls].r, g: mask_colors[cls].g, b: mask_colors[cls].b }
                : { r: 0.5, g: 0.5, b: 0.5 }
        } else if (lidarColorMode === 'track_id' && hasTrackId) {
            const tid = readField(parsed, i, hasTrackId)
            if (tid === 0) continue
            color = clusterColor(tid)
        } else if (lidarColorMode === 'instance_id' && hasInstanceId) {
            const iid = readField(parsed, i, hasInstanceId)
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
let lidarPointsSocket = null   // handle for /lidar/points while LiDAR is on
let lidarEnrichedSocket = null  // handle for /lidar/clusters or /fusion/lidar when needed
let lidarEnrichedPoints = null  // latest cluster data (or null)
let lidarLastArrivalMs = null

/**
 * Open a reconnecting binary socket (see reconnectingSocket.js).
 * @returns {{socket: WebSocket|null, stopped: boolean, stop: () => void}}
 */
function reconnectingSocket(url, onmessage, shouldReconnect, label) {
    return createReconnectingSocket({ url, onmessage, shouldReconnect, label })
}

/** Stop a reconnecting socket handle, cancelling any pending reconnect. Returns null. */
function stopSocket(handle) {
    if (handle) handle.stop()
    return null
}

/** True for a handle that is connected or will reconnect. */
function socketLive(handle) {
    return Boolean(handle) && !handle.stopped
}

/** True while an overlay that projects sensor points is on. */
function projectionNeeded() {
    return lidarEnabled || radarEnabled
}

/** Subscribe to the extrinsics (/tf_static) and intrinsics (/camera/info). */
function ensureCalibrationSockets() {
    if (!socketLive(tfStaticSocket)) {
        tfStaticSocket = reconnectingSocket(
            socketUrlTfStatic,
            (event) => parseTfStatic(event.data),
            projectionNeeded,
            'tf_static'
        )
    }

    if (!socketLive(cameraInfoSocket) && !cameraIntrinsics) {
        cameraInfoSocket = reconnectingSocket(
            socketUrlCameraInfo,
            (event) => parseCameraInfo(event.data),
            () => projectionNeeded() && !cameraIntrinsics,
            'camera_info'
        )
    }
}

/** Close the calibration sockets and forget the camera calibration once no overlay projects. */
function maybeCloseCalibrationSockets() {
    if (projectionNeeded()) return
    tfStaticSocket = stopSocket(tfStaticSocket)
    cameraInfoSocket = stopSocket(cameraInfoSocket)
    setTransform('camera', null)
    cameraIntrinsics = null
}

function startLidar() {
    ensureCalibrationSockets()

    // Always subscribe to the raw points topic
    if (!socketLive(lidarPointsSocket)) {
        let rawFieldsDetected = false
        lidarPointsSocket = reconnectingSocket(
            socketUrlLidar,
            (event) => {
                const stampMs = readHeaderStampMs(event.data)
                lidarLastArrivalMs = performance.now()
                video.clock.observe('lidar', stampMs, lidarLastArrivalMs)
                lidarBuffer.push(stampMs, event.data)
                video.clock.setTolerance('lidar', sensorToleranceMs(lidarBuffer))
                if (!rawFieldsDetected) {
                    try {
                        const p = parsePointCloud2(event.data)
                        updateAvailableLidarColorModes(p.fieldMap)
                        rawFieldsDetected = true
                    } catch { /* ignore parse errors for detection */ }
                }
            },
            () => lidarEnabled,
            'LiDAR points'
        )
    }

    // Subscribe to enriched topic if an enriched color mode is active
    connectEnrichedSocket()

    // Probe cluster and fusion topics to discover available color modes
    probeTopicFields(socketUrlLidarCluster)
    probeTopicFields(socketUrlFusion)
}

/**
 * Open a temporary WebSocket to discover which PointCloud2 fields a topic
 * provides, then close the socket. Populates the colour-mode dropdown.
 */
function probeTopicFields(url) {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    const probeTimeout = setTimeout(() => ws.close(), 5000)
    ws.onmessage = (event) => {
        clearTimeout(probeTimeout)
        try {
            const p = parsePointCloud2(event.data)
            updateAvailableLidarColorModes(p.fieldMap)
        } catch { /* topic may not be available */ }
        ws.close()
    }
    ws.onerror = () => {
        clearTimeout(probeTimeout)
        ws.onmessage = null
        ws.onerror = null
        ws.close()
    }
}

function resetEnrichedColorModes() {
    for (const mode of ENRICHED_COLOR_MODES) {
        const option = lidarColorSelect.querySelector(`option[value="${mode.value}"]`)
        if (option) option.remove()
    }
}

function connectEnrichedSocket() {
    lidarEnrichedSocket = stopSocket(lidarEnrichedSocket)
    lidarEnrichedPoints = null
    lidarEnrichedBuffer.clear()
    video.clock.remove('lidarEnriched')

    if (colorModeNeedsEnriched()) {
        let fieldsDetected = false
        const enrichedUrl = lidarColorMode === 'cluster' ? socketUrlLidarCluster : socketUrlFusion
        lidarEnrichedSocket = reconnectingSocket(
            enrichedUrl,
            (event) => {
                const stampMs = readHeaderStampMs(event.data)
                video.clock.observe('lidarEnriched', stampMs, performance.now())
                lidarEnrichedBuffer.push(stampMs, event.data)
                video.clock.setTolerance('lidarEnriched', sensorToleranceMs(lidarEnrichedBuffer))
                if (!fieldsDetected) {
                    try {
                        const p = parsePointCloud2(event.data)
                        updateAvailableLidarColorModes(p.fieldMap)
                        fieldsDetected = true
                    } catch { /* ignore parse errors for detection */ }
                }
            },
            () => lidarEnabled,
            'LiDAR enriched'
        )
    }
}

function stopLidar() {
    // Setting lidarEnabled = false first stops reconnection via shouldReconnect checks
    lidarPointsSocket = stopSocket(lidarPointsSocket)
    lidarEnrichedSocket = stopSocket(lidarEnrichedSocket)
    lidarLastArrivalMs = null
    lidarPoints = null
    lidarEnrichedPoints = null
    lidarBuffer.clear()
    video.clock.remove('lidar')
    lidarEnrichedBuffer.clear()
    video.clock.remove('lidarEnriched')
    resetEnrichedColorModes()
    setTransform('lidar', null)
    maybeCloseCalibrationSockets()
    cachedLidarRawRef = null
    cachedLidarParsed = null
    // Clear overlay canvas
    lidarCtx.clearRect(0, 0, width, height)
}

// ---------------------------------------------------------------------------
// Radar Overlay
// ---------------------------------------------------------------------------

function loadRadarSettings() {
    try {
        return localStorage.getItem(RADAR_SETTINGS_KEY)
    } catch {
        return null
    }
}

function saveRadarSettings() {
    try {
        localStorage.setItem(RADAR_SETTINGS_KEY, JSON.stringify(radarSettings))
    } catch { /* storage unavailable: settings last for this page only */ }
}

/** Select the saved colour mode once it is offered, else Range. */
function syncRadarColorSelect() {
    const mode = radarSettings.colorMode
    radarColorSelect.value = radarColorSelect.querySelector(`option[value="${mode}"]`) ? mode : 'range'
    radarColorLabel.style.display = mode === 'fixed' ? '' : 'none'
}

/** Offer the colour modes whose fields the radar PointCloud2 carries. */
function updateAvailableRadarColorModes(fieldMap) {
    for (const mode of availableRadarColorModes(fieldMap)) {
        if (radarColorSelect.querySelector(`option[value="${mode.value}"]`)) continue
        const option = document.createElement('option')
        option.value = mode.value
        option.textContent = mode.label
        radarColorSelect.appendChild(option)
    }
    syncRadarColorSelect()
}

function resetRadarColorModes() {
    for (const option of [...radarColorSelect.options]) {
        if (option.value !== 'fixed' && option.value !== 'range') option.remove()
    }
    syncRadarColorSelect()
}

function warnIfRadarUncalibrated() {
    radarWarnTimer = null
    if (!radarEnabled) return
    const missing = []
    if (!radarTransform) missing.push('base_link → radar transform on /tf_static')
    if (!cameraTransform) missing.push('base_link → camera optical transform on /tf_static')
    if (!cameraIntrinsics) missing.push('calibrated /camera/info')
    if (missing.length > 0) {
        console.warn(`Radar overlay: no ${missing.join(', ')}; radar points are not drawn`)
    }
}

function startRadar() {
    ensureCalibrationSockets()
    if (!socketLive(radarSocket)) {
        let fieldsDetected = false
        radarSocket = reconnectingSocket(
            socketUrlRadar,
            (event) => {
                if (!radarEnabled) return
                const stampMs = readHeaderStampMs(event.data)
                radarLastArrivalMs = performance.now()
                video.clock.observe('radar', stampMs, radarLastArrivalMs)
                radarBuffer.push(stampMs, event.data)
                video.clock.setTolerance('radar', sensorToleranceMs(radarBuffer))
                if (!fieldsDetected) {
                    try {
                        updateAvailableRadarColorModes(parsePointCloud2(event.data).fieldMap)
                        fieldsDetected = true
                    } catch { /* ignore parse errors for detection */ }
                }
            },
            () => radarEnabled,
            'Radar targets'
        )
    }
    clearTimeout(radarWarnTimer)
    radarWarnTimer = setTimeout(warnIfRadarUncalibrated, RADAR_CALIBRATION_WARN_MS)
}

function stopRadar() {
    clearTimeout(radarWarnTimer)
    radarWarnTimer = null
    radarSocket = stopSocket(radarSocket)
    radarLastArrivalMs = null
    radarPoints = null
    radarBuffer.clear()
    video.clock.remove('radar')
    resetRadarColorModes()
    setTransform('radar', null)
    maybeCloseCalibrationSockets()
    cachedRadarRawRef = null
    cachedRadarColumns = null
    cachedRadarFrame = null
    cachedRadarFrameKey = null
    radarCtx.clearRect(0, 0, width, height)
}

/**
 * Draw the radar sample selected for the displayed frame. Columns are
 * parsed once per sample and the projected points rebuilt only when the
 * sample, calibration or colour settings change.
 */
function renderRadarOverlay() {
    radarCtx.clearRect(0, 0, width, height)
    if (!radarPoints || !radarToCameraMatrix || !cameraIntrinsics) return

    if (radarPoints !== cachedRadarRawRef) {
        cachedRadarRawRef = radarPoints
        cachedRadarFrame = null
        try {
            cachedRadarColumns = readRadarColumns(parsePointCloud2(radarPoints))
        } catch (e) {
            cachedRadarColumns = null
            console.warn('Radar parse error:', e)
        }
    }
    if (!cachedRadarColumns) return

    const key = [radarToCameraMatrix, cameraIntrinsics, radarSettings.colorMode, radarSettings.color]
    if (!cachedRadarFrame || !cachedRadarFrameKey.every((v, i) => v === key[i])) {
        cachedRadarFrame = buildRadarFrame(cachedRadarColumns, {
            matrix: radarToCameraMatrix,
            intrinsics: cameraIntrinsics,
            width,
            height,
            margin: RADAR_DOT_RADIUS,
            mode: radarSettings.colorMode,
            color: parseHexColor(radarSettings.color),
        })
        cachedRadarFrameKey = key
    }

    radarCtx.lineWidth = 1.5
    radarCtx.strokeStyle = 'rgba(0,0,0,0.8)'
    for (const p of cachedRadarFrame) {
        radarCtx.beginPath()
        radarCtx.arc(p.u, p.v, RADAR_DOT_RADIUS, 0, 2 * PI)
        radarCtx.fillStyle = p.css
        radarCtx.fill()
        radarCtx.stroke()
    }
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
            setTransform('lidar', transform)
        }

        // Store the base_link → radar transform
        if (childFrameId.includes('radar') && !childFrameId.includes('optical')) {
            setTransform('radar', transform)
        }

        // Store the base_link → camera optical transform
        // Prefer 'camera_optical' over 'base_link_optical' if both exist
        if (childFrameId.includes('optical')) {
            if (!cameraTransform || childFrameId.includes('camera')) {
                setTransform('camera', transform)
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
        reader.string() // frame_id

        // Image dimensions
        reader.uint32() // height
        reader.uint32() // width

        // Distortion model
        reader.string() // distortion_model

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
            cameraInfoSocket = stopSocket(cameraInfoSocket)
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
    segOptions.setAttribute('data-visible', segEnabled)
    if (segEnabled) startSegmentation()
    else stopSegmentation()
})

segDrawBgCheckbox.addEventListener('change', () => {
    drawBackground = segDrawBgCheckbox.checked
    lidarDrawBgCheckbox.checked = drawBackground
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

wireToggle(overlayRadarToggle, overlayRadarSection, radarOptions, (on) => {
    radarEnabled = on
    if (on) startRadar()
    else stopRadar()
})

radarColorSelect.addEventListener('change', () => {
    radarSettings.colorMode = radarColorSelect.value
    syncRadarColorSelect()
    saveRadarSettings()
})

radarColorInput.addEventListener('input', () => {
    if (!parseHexColor(radarColorInput.value)) return
    radarSettings.color = radarColorInput.value.toLowerCase()
    saveRadarSettings()
})

lidarColorSelect.addEventListener('change', () => {
    lidarColorMode = lidarColorSelect.value
    lidarClusterFilters.setAttribute('data-visible', lidarColorMode === 'cluster')
    updateLidarBgVisibility()
    if (lidarEnabled) connectEnrichedSocket()
})

boxLabelsCheckbox.addEventListener('change', () => { showLabels = boxLabelsCheckbox.checked })
boxConfidenceCheckbox.addEventListener('change', () => { showConfidence = boxConfidenceCheckbox.checked })
lidarNoiseCheckbox.addEventListener('change', () => { lidarShowNoise = lidarNoiseCheckbox.checked })
lidarGroundCheckbox.addEventListener('change', () => { lidarShowGround = lidarGroundCheckbox.checked })
lidarDrawBgCheckbox.addEventListener('change', () => {
    drawBackground = lidarDrawBgCheckbox.checked
    segDrawBgCheckbox.checked = drawBackground
})

function updateLidarBgVisibility() {
    lidarDrawBgLabel.style.display =
        (lidarColorMode === 'vision_class' && ModelInfo.hasBackground) ? '' : 'none'
}

radarColorInput.value = radarSettings.color
syncRadarColorSelect()

function applyMirror() {
    cameraStage.style.transform = mirrorCssTransform(mirrorMode)
}

mirrorSelect.addEventListener('change', () => {
    mirrorMode = mirrorSelect.value
    applyMirror()
    saveMirror(MIRROR_KEY, mirrorMode)
})

mirrorSelect.value = mirrorMode
applyMirror()

// ---------------------------------------------------------------------------
// Topic Availability Gating
// ---------------------------------------------------------------------------
// Sensor overlay sections start hidden and follow whether websrv has seen
// their topic in its periodic sampling (GET /api/topics/status, polled every
// 5 s), so a publisher started by hand is offered too. A section hides once
// websrv reports its topic gone for a full sampling cycle; an overlay that is
// on is then turned off, which closes its sockets and removes its stream from
// the playout clock. On a websrv without the endpoint the sections follow the
// systemd enabled state of the publisher instead (see topicGate.js).
const SECTION_GATES = [
    { topic: 'lidar/points', service: 'lidarpub', section: overlayLidarSection, toggle: overlayLidarToggle },
    { topic: 'radar/targets', service: 'radarpub', section: overlayRadarSection, toggle: overlayRadarToggle },
]
const TOPIC_STATUS_TIMEOUT_MS = TOPIC_POLL_MS
let topicGate = createTopicGateState(SECTION_GATES.map((g) => g.topic))

function applySectionGates() {
    const statuses = window.serviceCache ? window.serviceCache.serviceStatuses : null
    for (const { topic, service, section, toggle } of SECTION_GATES) {
        const next = decideSection(topicGate, topic, service, statuses, { visible: !section.hidden, on: toggle.checked })
        section.hidden = !next.visible
        if (next.stop) {
            toggle.checked = false
            toggle.dispatchEvent(new Event('change'))
        }
    }
}

/** Newest sample arrival of each overlay stream that is on. */
function localTopicSamples() {
    const samples = {}
    if (lidarEnabled && lidarLastArrivalMs != null) samples['lidar/points'] = lidarLastArrivalMs
    if (radarEnabled && radarLastArrivalMs != null) samples['radar/targets'] = radarLastArrivalMs
    return samples
}

async function fetchTopicStatus() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TOPIC_STATUS_TIMEOUT_MS)
    try {
        const res = await fetch(topicStatusUrl(topicGate.topics), { cache: 'no-store', signal: controller.signal })
        const body = await res.text()
        return classifyTopicResponse({ status: res.status, contentType: res.headers.get('content-type'), body })
    } catch {
        return classifyTopicResponse(null)
    } finally {
        clearTimeout(timer)
    }
}

async function pollTopicStatus() {
    const started = performance.now()
    if (shouldPollTopics(topicGate, started)) {
        const result = await fetchTopicStatus()
        const wasMode = topicGate.mode
        const visible = Object.fromEntries(SECTION_GATES.map((g) => [g.topic, !g.section.hidden]))
        topicGate = applyTopicPoll(topicGate, result, performance.now(), localTopicSamples(), visible)
        if (topicGate.mode !== wasMode) {
            console.log(topicGate.mode === 'topics'
                ? 'Overlay sections follow topic availability'
                : 'No /api/topics/status on this websrv; overlay sections follow the publisher services')
        }
        applySectionGates()
    }
    setTimeout(pollTopicStatus, Math.max(0, TOPIC_POLL_MS - (performance.now() - started)))
}

pollTopicStatus()
if (window.serviceCache) window.serviceCache.registerUpdateCallback(applySectionGates)

// ---------------------------------------------------------------------------
// Animation Loop
// ---------------------------------------------------------------------------
renderer.setAnimationLoop(() => {
    const displayed = video.tick()

    const model = (boxEnabled || segEnabled) ? selectDerived(modelBuffer, displayed) : null
    modelData = model ? model.value : null
    const lidar = lidarEnabled ? selectSensor(lidarBuffer, displayed) : null
    lidarPoints = lidar ? lidar.value : null
    const enriched = lidarEnabled ? selectSensor(lidarEnrichedBuffer, displayed) : null
    lidarEnrichedPoints = enriched ? enriched.value : null
    const lidarDrawn = lidar && colorModeNeedsEnriched() && enriched ? enriched : lidar
    const radar = radarEnabled ? selectSensor(radarBuffer, displayed) : null
    radarPoints = radar ? radar.value : null

    // Update segmentation uniforms before render (shader runs on GPU)
    if (segEnabled) renderSegmentation()

    renderer.render(scene, camera)

    // Render 2D canvas overlays after GL render
    if (boxEnabled) renderBoxes()
    if (lidarEnabled) renderLidarOverlay()
    if (radarEnabled) renderRadarOverlay()

    const syncStats = video.reportSync({ model, lidar: lidarDrawn, radar })
    window.overlaySync.horizonMisses = {
        lidar: lidarBuffer.horizonMisses + lidarEnrichedBuffer.horizonMisses,
        radar: radarBuffer.horizonMisses,
    }
    renderSyncStats(syncStats)
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
// ModelInfo — show/hide "Draw Background" toggle when background is detected
// ---------------------------------------------------------------------------
ModelInfo.onChange(() => {
    segDrawBgLabel.style.display = ModelInfo.hasBackground ? '' : 'none'
    updateLidarBgVisibility()
})
ModelInfo.connect(socketUrlModelInfo)
