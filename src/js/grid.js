// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Radar point cloud viewer. Draws the selected radar PointCloud2 stream
// (raw targets, DBSCAN clusters, or fusion-enriched radar) on top of a polar
// range/bearing grid, with colour modes discovered from the fields present in
// the stream. Mirrors the controls and behaviour of lidar.js.

import * as THREE from './three.js'
import { OrbitControls } from './OrbitControls.js'
import ModelInfo from './modelInfo.js'
import SpriteText from './three-spritetext.js'
import { PolarGridFan } from './polarGridFan.js'
import { mask_colors } from './utils.js'
import { parsePointCloud2, extractFieldArray, readField } from './pointcloud2.js'
import {
    distanceColor, divergingColor, clusterColor, getFixedColor, neutralGrey,
    resolveIsDark, getBgColorFromCSS
} from './pointColors.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SOURCES = {
    targets: { url: '/api/rt/radar/targets/', label: 'Radar targets' },
    clusters: { url: '/api/rt/radar/clusters/', label: 'Radar clusters' },
    fusion: { url: '/api/rt/fusion/radar/', label: 'Fusion radar' },
}
const SOURCE_HINTS = {
    clusters: 'Radar clusters unavailable — enable Clustering in the Radar settings',
    fusion: 'Fusion radar unavailable — is the fusion service running?',
}

// Polar grid extents (metres / degrees). The DRVEGRD ultra-short sweep tops
// out near 20 m and the azimuth field of view is roughly ±65°; the fan is
// drawn to ±70° so spokes land on multiples of 10° with one at 0°.
const GRID_RANGE_MAX = 20
const GRID_RANGE_STEP = 0.5
const GRID_RANGE_LABEL_STEP = 2
const GRID_ANGLE_LIMIT = 70
const GRID_ANGLE_STEP = 10
const GRID_ANGLE_LABEL_STEP = 20
const GRID_RING_DIVISIONS = 64

const HFOV_DEG = 82
const UNAVAILABLE_TIMEOUT_MS = 2000
const FUSION_WARNING_DURATION_MS = 5000
const RECONNECT_DELAY_MS = 3000

// Radar returns a few dozen points per frame, so draw them considerably
// larger than the LiDAR page's 3–4 px.
const POINT_SIZE_DARK = 8
const POINT_SIZE_LIGHT = 9

// Colour modes. `field` is the PointCloud2 field that must be present for the
// mode to be offered; null means always available.
const COLOR_MODES = [
    { value: 'fixed',        label: 'Fixed',        field: null },
    { value: 'distance',     label: 'Distance',     field: null },
    { value: 'speed',        label: 'Speed',        field: 'speed' },
    { value: 'power',        label: 'Power',        field: 'power' },
    { value: 'rcs',          label: 'RCS',          field: 'rcs' },
    { value: 'cluster',      label: 'Cluster',      field: 'cluster_id' },
    { value: 'vision_class', label: 'Vision Class', field: 'vision_class' },
    { value: 'track_id',     label: 'Track ID',     field: 'track_id' },
    { value: 'instance_id',  label: 'Instance ID',  field: 'instance_id' },
]
const DEFAULT_COLOR_MODE = 'distance'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentSource = 'targets'
let currentColorMode = DEFAULT_COLOR_MODE
let showElevation = false
let drawBackground = false
let cachedIsDark = true
let lastParsed = null        // most recent parsePointCloud2 result
let socket = null
let unavailableTimer = null
let fusionWarningTimer = null
let gridGroup = null
let pointCloud = null

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const viewport = document.getElementById('grid-viewport')
const sourceSelect = document.getElementById('source-select')
const colorModeSelect = document.getElementById('color-mode')
const showElevationCheckbox = document.getElementById('show-elevation')
const bgFilter = document.getElementById('bg-filter')
const showBgCheckbox = document.getElementById('show-background')
const fusionWarning = document.getElementById('fusion-warning')
const gridUnavailable = document.getElementById('grid-unavailable')

// ---------------------------------------------------------------------------
// Scene setup & render loop
// ---------------------------------------------------------------------------
cachedIsDark = resolveIsDark()

const renderer = new THREE.WebGLRenderer({ antialias: true })
viewport.insertBefore(renderer.domElement, viewport.firstChild)

const scene = new THREE.Scene()
scene.background = getBgColorFromCSS(cachedIsDark)

// Vertical FOV is derived from a fixed horizontal FOV so the whole fan stays
// in view regardless of the viewport aspect ratio.
function verticalFov(aspect) {
    return Math.atan(Math.tan(HFOV_DEG * Math.PI / 360) / aspect) * 360 / Math.PI
}

// Start high above the fan, tilted slightly so OrbitControls has a defined
// "up" and the whole 0–20 m fan is in view.
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
camera.position.set(0, 26, 4)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0, GRID_RANGE_MAX / 2)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.screenSpacePanning = true
controls.maxDistance = 100
controls.update()

function handleResize() {
    const w = viewport.clientWidth
    const h = viewport.clientHeight
    camera.aspect = w / h
    camera.fov = verticalFov(camera.aspect)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
}
window.addEventListener('resize', handleResize)
handleResize()

function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
}
animate()

// ---------------------------------------------------------------------------
// Polar grid
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the range/bearing fan and its labels. Line colours are
 * theme dependent and baked into vertex colours, so the fan is rebuilt on
 * theme change.
 */
function buildGrid() {
    if (gridGroup) {
        gridGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
                if (child.material.map) child.material.map.dispose()
                child.material.dispose()
            }
        })
        scene.remove(gridGroup)
    }
    gridGroup = new THREE.Group()

    // Minor rings/spokes (odd index) are fainter than major ones (even index)
    // so the half-metre rings recede behind the metre rings.
    const major = cachedIsDark ? 0x8c8ca0 : 0x8a8aa0
    const minor = cachedIsDark ? 0x4e4e5e : 0xc0c0d0
    const sectors = Math.ceil(2 * GRID_ANGLE_LIMIT / GRID_ANGLE_STEP)
    const rings = Math.ceil(GRID_RANGE_MAX / GRID_RANGE_STEP)
    const fan = new PolarGridFan(0, GRID_RANGE_MAX,
        GRID_ANGLE_LIMIT * Math.PI / 180, -GRID_ANGLE_LIMIT * Math.PI / 180,
        sectors, rings, GRID_RING_DIVISIONS, minor, major)
    fan.material.transparent = true
    fan.material.opacity = cachedIsDark ? 0.55 : 0.7
    fan.material.depthWrite = false
    fan.position.z = 0.002
    gridGroup.add(fan)

    const labelColor = cachedIsDark ? '#8c8ca0' : '#6b6b80'
    const labelHeight = 0.03

    // Range labels down both edges of the fan.
    for (const side of [1, -1]) {
        const edge = side * (GRID_ANGLE_LIMIT + 1) * Math.PI / 180
        const out = side * (GRID_ANGLE_LIMIT + 91) * Math.PI / 180
        for (let r = GRID_RANGE_LABEL_STEP; r <= GRID_RANGE_MAX; r += GRID_RANGE_LABEL_STEP) {
            const text = new SpriteText(r.toFixed(0) + 'm', labelHeight, labelColor)
            text.material.sizeAttenuation = false
            text.position.x = Math.sin(edge) * r + Math.sin(out) * 0.16
            text.position.z = Math.cos(edge) * r + Math.cos(out) * 0.16
            gridGroup.add(text)
        }
    }

    // Bearing labels along the outer arc, centred on 0°.
    const firstLabel = -Math.floor(GRID_ANGLE_LIMIT / GRID_ANGLE_LABEL_STEP) * GRID_ANGLE_LABEL_STEP
    for (let a = firstLabel; a <= GRID_ANGLE_LIMIT; a += GRID_ANGLE_LABEL_STEP) {
        const pad = a < 0 ? '' : ' '
        const text = new SpriteText(pad + a.toFixed(0) + '°', labelHeight, labelColor)
        text.material.sizeAttenuation = false
        const rad = -a * Math.PI / 180
        text.position.x = Math.sin(rad) * (GRID_RANGE_MAX + 0.2)
        text.position.y = 0.2
        text.position.z = Math.cos(rad) * (GRID_RANGE_MAX + 0.2)
        gridGroup.add(text)
    }

    scene.add(gridGroup)
}

// ---------------------------------------------------------------------------
// Point rendering
// ---------------------------------------------------------------------------

/** Round sprite so large points read as dots rather than squares. */
function makeCircleTexture() {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.fill()
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

function pointSize() {
    return cachedIsDark ? POINT_SIZE_DARK : POINT_SIZE_LIGHT
}

const pointMaterial = new THREE.PointsMaterial({
    size: pointSize(),
    sizeAttenuation: false,
    vertexColors: true,
    map: makeCircleTexture(),
    alphaTest: 0.5,
    transparent: false,
    depthWrite: true,
})

/**
 * Read a numeric field into a Float32Array (extractFieldArray truncates to
 * int32, which would discard the fractional part of speed/rcs).
 */
function extractFloatArray(parsed, fieldName) {
    const field = parsed.fieldMap[fieldName]
    if (!field) return new Float32Array(0)
    const values = new Float32Array(parsed.totalPoints)
    for (let i = 0; i < parsed.totalPoints; i++) {
        values[i] = readField(parsed, i, field)
    }
    return values
}

/**
 * Build positions in the grid frame from the ROS-convention radar frame.
 * ROS: x forward, y left, z up. Grid scene: +z forward, +x lateral, +y up.
 */
function buildPositions(parsed) {
    const n = parsed.totalPoints
    const xs = extractFloatArray(parsed, 'x')
    const ys = extractFloatArray(parsed, 'y')
    const zs = extractFloatArray(parsed, 'z')
    const positions = new Float32Array(n * 3)
    const ranges = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        positions[i * 3] = ys[i]
        positions[i * 3 + 1] = showElevation ? zs[i] : 0
        positions[i * 3 + 2] = xs[i]
        ranges[i] = Math.sqrt(xs[i] * xs[i] + ys[i] * ys[i] + zs[i] * zs[i])
    }
    return { positions, ranges }
}

function fillColor(colors, i, c) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
}

/** Colour every point according to the current colour mode. */
function buildColors(parsed, ranges) {
    const n = parsed.totalPoints
    const colors = new Float32Array(n * 3)
    const mode = currentColorMode
    const isDark = cachedIsDark

    if (mode === 'fixed') {
        const c = getFixedColor(isDark)
        for (let i = 0; i < n; i++) fillColor(colors, i, c)
    } else if (mode === 'distance') {
        // Normalise to the grid extent rather than the per-frame maximum so
        // colours stay stable as sparse radar returns come and go.
        for (let i = 0; i < n; i++) {
            fillColor(colors, i, distanceColor(ranges[i] / GRID_RANGE_MAX, isDark))
        }
    } else if (mode === 'speed') {
        const speeds = extractFloatArray(parsed, 'speed')
        let maxAbs = 1.0   // floor so stationary scenes don't amplify noise
        for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(speeds[i]))
        for (let i = 0; i < n; i++) {
            fillColor(colors, i, divergingColor(speeds[i] / maxAbs, isDark))
        }
    } else if (mode === 'power' || mode === 'rcs') {
        const values = extractFloatArray(parsed, mode)
        let min = Infinity
        let max = -Infinity
        for (let i = 0; i < n; i++) {
            if (values[i] < min) min = values[i]
            if (values[i] > max) max = values[i]
        }
        const span = Math.max(max - min, 1e-3)
        for (let i = 0; i < n; i++) {
            fillColor(colors, i, distanceColor((values[i] - min) / span, isDark))
        }
    } else if (mode === 'cluster') {
        const ids = extractFieldArray(parsed, 'cluster_id')
        for (let i = 0; i < n; i++) fillColor(colors, i, clusterColor(ids[i], isDark))
    } else if (mode === 'vision_class') {
        const classes = extractFieldArray(parsed, 'vision_class')
        const gr = neutralGrey(isDark)
        const grey = { r: gr, g: gr, b: gr }
        const generic = getFixedColor(isDark)
        for (let i = 0; i < n; i++) {
            const cls = classes[i]
            if (ModelInfo.isBackground(cls) && !drawBackground) {
                fillColor(colors, i, grey)
            } else if (cls >= 0 && cls < mask_colors.length) {
                fillColor(colors, i, mask_colors[cls])
            } else {
                fillColor(colors, i, generic)
            }
        }
    } else if (mode === 'track_id' || mode === 'instance_id') {
        const ids = extractFieldArray(parsed, mode)
        const gr = neutralGrey(isDark)
        const grey = { r: gr, g: gr, b: gr }
        for (let i = 0; i < n; i++) {
            fillColor(colors, i, ids[i] === 0 ? grey : clusterColor(ids[i], isDark))
        }
    }
    return colors
}

/** Rebuild the point cloud from the last received frame. */
function rebuildPointCloud() {
    if (!lastParsed) return
    const { positions, ranges } = buildPositions(lastParsed)
    const colors = buildColors(lastParsed, ranges)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    if (pointCloud) {
        pointCloud.geometry.dispose()
        scene.remove(pointCloud)
    }
    pointMaterial.size = pointSize()
    pointMaterial.needsUpdate = true
    pointCloud = new THREE.Points(geometry, pointMaterial)
    pointCloud.frustumCulled = false
    scene.add(pointCloud)
}

function clearPointCloud() {
    if (!pointCloud) return
    pointCloud.geometry.dispose()
    scene.remove(pointCloud)
    pointCloud = null
}

// ---------------------------------------------------------------------------
// Colour-mode dropdown
// ---------------------------------------------------------------------------

/**
 * Offer exactly the colour modes whose fields exist in the current stream.
 * Falls back to the default mode if the selected one disappears.
 */
function updateAvailableColorModes(fieldMap) {
    for (const mode of COLOR_MODES) {
        if (!mode.field) continue
        const available = Boolean(fieldMap[mode.field])
        let option = colorModeSelect.querySelector(`option[value="${mode.value}"]`)
        if (available && !option) {
            option = document.createElement('option')
            option.value = mode.value
            option.textContent = mode.label
            colorModeSelect.appendChild(option)
        } else if (!available && option) {
            option.remove()
        }
    }
    if (!colorModeSelect.querySelector(`option[value="${currentColorMode}"]`)) {
        currentColorMode = DEFAULT_COLOR_MODE
        colorModeSelect.value = currentColorMode
        updateBgFilterVisibility()
    }
}

function updateBgFilterVisibility() {
    bgFilter.style.display = (currentColorMode === 'vision_class' && ModelInfo.hasBackground)
        ? 'flex' : 'none'
}

// ---------------------------------------------------------------------------
// Status banners
// ---------------------------------------------------------------------------
function showFusionWarning(message) {
    if (fusionWarningTimer) clearTimeout(fusionWarningTimer)
    fusionWarning.textContent = message
    fusionWarning.style.display = 'block'
    fusionWarningTimer = setTimeout(() => {
        fusionWarning.style.display = 'none'
        fusionWarningTimer = null
    }, FUSION_WARNING_DURATION_MS)
}

function markUnavailable() {
    gridUnavailable.style.display = 'flex'
    clearPointCloud()
    const hint = SOURCE_HINTS[currentSource]
    if (hint) showFusionWarning(hint)
}

function armUnavailableTimer() {
    clearTimeout(unavailableTimer)
    unavailableTimer = setTimeout(markUnavailable, UNAVAILABLE_TIMEOUT_MS)
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
function connectSocket() {
    if (socket) {
        socket.onmessage = null
        socket.onclose = null
        socket.onerror = null
        socket.close()
        socket = null
    }

    const url = SOURCES[currentSource].url
    socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    armUnavailableTimer()

    socket.onmessage = (event) => {
        gridUnavailable.style.display = 'none'
        armUnavailableTimer()
        try {
            lastParsed = parsePointCloud2(event.data)
            updateAvailableColorModes(lastParsed.fieldMap)
            rebuildPointCloud()
        } catch (error) {
            console.error('Failed to parse radar point cloud:', error)
        }
    }

    socket.onerror = (error) => {
        console.error(`Radar WebSocket ${url} error:`, error)
    }

    socket.onclose = () => {
        console.log(`Radar WebSocket ${url} closed — reconnecting in ${RECONNECT_DELAY_MS / 1000} s`)
        setTimeout(connectSocket, RECONNECT_DELAY_MS)
    }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
sourceSelect.addEventListener('change', () => {
    currentSource = sourceSelect.value
    lastParsed = null
    clearPointCloud()
    fusionWarning.style.display = 'none'
    connectSocket()
})

colorModeSelect.addEventListener('change', () => {
    currentColorMode = colorModeSelect.value
    updateBgFilterVisibility()
    rebuildPointCloud()
})

showElevationCheckbox.addEventListener('change', () => {
    showElevation = showElevationCheckbox.checked
    rebuildPointCloud()
})

showBgCheckbox.addEventListener('change', () => {
    drawBackground = showBgCheckbox.checked
    rebuildPointCloud()
})

// ---------------------------------------------------------------------------
// Theme integration
// ---------------------------------------------------------------------------
document.addEventListener('themechange', () => {
    cachedIsDark = resolveIsDark()
    scene.background = getBgColorFromCSS(cachedIsDark)
    buildGrid()
    rebuildPointCloud()
})

// ---------------------------------------------------------------------------
// ModelInfo — show/hide "Draw Background" toggle when background is detected
// ---------------------------------------------------------------------------
ModelInfo.onChange(() => {
    updateBgFilterVisibility()
    rebuildPointCloud()
})
ModelInfo.connect('/api/rt/model/info/')

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
buildGrid()
connectSocket()
