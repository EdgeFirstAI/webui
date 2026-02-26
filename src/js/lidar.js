// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as THREE from './three.js'
import { OrbitControls } from './OrbitControls.js'
import { PCDLoader } from './PCDLoader.js'
import { mask_colors } from './utils.js'
import { CdrReader } from './Cdr.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RAW_TOPIC = '/rt/lidar/points/'
const CLUSTER_TOPIC = '/rt/lidar/clusters/'
const FUSION_TOPIC = '/rt/fusion/lidar/'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentColorMode = 'distance'
let lastParsedPoints = new Int32Array(0)  // flat array of per-point class/id values
let pointsGroup = null
let socket = null
let socketUrlRaw = RAW_TOPIC
let socketUrlCluster = CLUSTER_TOPIC
let socketUrlFusion = FUSION_TOPIC
let fusionWarningTimer = null
let cachedIsDark = true   // cached theme state — updated on themechange

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const viewport = document.getElementById('lidar-viewport')
const colorModeSelect = document.getElementById('color-mode')
const fusionWarning = document.getElementById('fusion-warning')
const lidarUnavailable = document.getElementById('lidar-unavailable')
let unavailableTimer = null

// ---------------------------------------------------------------------------
// Part A: Scene Setup & Render Loop
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true })
viewport.insertBefore(renderer.domElement, viewport.firstChild)

const camera = new THREE.PerspectiveCamera(60, viewport.clientWidth / viewport.clientHeight, 0.1, 1000)
camera.position.set(0, 5, 10)
camera.lookAt(0, 0, 0)

const scene = new THREE.Scene()
scene.background = getBgColorFromCSS()

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.screenSpacePanning = true
controls.maxDistance = 100
controls.maxPolarAngle = Math.PI

const pcdLoader = new PCDLoader()

function handleResize() {
    const w = viewport.clientWidth
    const h = viewport.clientHeight
    camera.aspect = w / h
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
// Part B: Colour Mode Logic
// ---------------------------------------------------------------------------

/**
 * Attempt to read the CSS variable --color-bg-base from the root element and
 * return a THREE.Color. Falls back to a sensible dark/light default.
 */
function getBgColorFromCSS() {
    const style = getComputedStyle(document.documentElement)
    const raw = style.getPropertyValue('--color-bg-base').trim()
    if (raw) {
        try {
            return new THREE.Color(raw)
        } catch (_) { /* fall through */ }
    }
    // Fallback
    return cachedIsDark ? new THREE.Color(0x1a1625) : new THREE.Color(0xf0f2f5)
}

/**
 * Polynomial approximation of the Turbo colourmap.
 * Input: t in [0, 1]. Output: { r, g, b } each in [0, 1].
 */
function turboColormap(t) {
    t = Math.max(0, Math.min(1, t))

    const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))
    const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))
    const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))

    return {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b))
    }
}

/**
 * Apply the distance colourmap. In dark mode we use turbo directly; in light
 * mode we darken and saturate the output so points are vivid against the
 * bright background.
 */
function distanceColor(t) {
    const c = turboColormap(t)
    if (cachedIsDark) return c

    // Light mode: increase saturation and darken to improve contrast
    const max = Math.max(c.r, c.g, c.b, 1e-6)
    const boost = 1.0 / max           // normalise so the brightest channel = 1
    let r = c.r * boost
    let g = c.g * boost
    let b = c.b * boost

    // Then darken by 30 % so the colours are rich, not washed-out
    const darken = 0.70
    r *= darken
    g *= darken
    b *= darken

    return {
        r: Math.max(0, Math.min(1, r)),
        g: Math.max(0, Math.min(1, g)),
        b: Math.max(0, Math.min(1, b))
    }
}

/**
 * Generate a distinct colour for a cluster ID using golden-angle hue spacing.
 * Returns { r, g, b } each in [0, 1].
 */
function clusterColor(id) {
    if (id <= 0) return cachedIsDark ? { r: 0.3, g: 0.3, b: 0.35 } : { r: 0.6, g: 0.6, b: 0.65 }

    // Golden angle gives good hue separation between adjacent IDs
    const hue = (id * 137.508) % 360
    const sat = cachedIsDark ? 0.75 : 0.85
    const light = cachedIsDark ? 0.60 : 0.45

    // HSL → RGB
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

/**
 * Resolve the current theme to a boolean (hits DOM + matchMedia).
 * Call sparingly — use cachedIsDark in hot paths.
 */
function resolveIsDark() {
    const theme = document.documentElement.getAttribute('data-theme') || 'auto'
    return window.ThemeManager ? window.ThemeManager.isDark(theme) : true
}

// Initialise the cache now that DOM is ready
cachedIsDark = resolveIsDark()

/**
 * Fixed colour — lavender for dark theme, deep purple for light theme.
 */
function getFixedColor() {
    return cachedIsDark ? new THREE.Color(0xE6E6FA) : new THREE.Color(0x3E3371)
}

/**
 * Apply the current colour mode to every Points child inside a Three.js group.
 */
function applyColorMode(group) {
    group.traverse((child) => {
        if (!(child instanceof THREE.Points)) return

        const posAttr = child.geometry.attributes.position
        if (!posAttr) return

        const count = posAttr.count
        const colors = new Float32Array(count * 3)

        if (currentColorMode === 'fixed') {
            const c = getFixedColor()
            for (let i = 0; i < count; i++) {
                colors[i * 3] = c.r
                colors[i * 3 + 1] = c.g
                colors[i * 3 + 2] = c.b
            }
        } else if (currentColorMode === 'distance') {
            // Find max distance for normalisation
            let maxDist = 0
            for (let i = 0; i < count; i++) {
                const x = posAttr.getX(i)
                const y = posAttr.getY(i)
                const z = posAttr.getZ(i)
                const d = Math.sqrt(x * x + y * y + z * z)
                if (d > maxDist) maxDist = d
            }
            maxDist = Math.max(maxDist, 1e-3)

            for (let i = 0; i < count; i++) {
                const x = posAttr.getX(i)
                const y = posAttr.getY(i)
                const z = posAttr.getZ(i)
                const t = Math.min(Math.sqrt(x * x + y * y + z * z) / maxDist, 1.0)
                const c = distanceColor(t)
                colors[i * 3] = c.r
                colors[i * 3 + 1] = c.g
                colors[i * 3 + 2] = c.b
            }
        } else if (currentColorMode === 'cluster') {
            const hasData = lastParsedPoints.length > 0

            if (!hasData) {
                showFusionWarning()
            }

            for (let i = 0; i < count; i++) {
                const id = (hasData && i < lastParsedPoints.length)
                    ? lastParsedPoints[i] : 0
                const c = clusterColor(id)
                colors[i * 3] = c.r
                colors[i * 3 + 1] = c.g
                colors[i * 3 + 2] = c.b
            }
        } else if (currentColorMode === 'vision_class') {
            const hasVisionClass = lastParsedPoints.length > 0

            if (!hasVisionClass) {
                showFusionWarning()
            }

            // Generic colour for class 0 / fallback
            const generic = getFixedColor()
            const gr = generic.r, gg = generic.g, gb = generic.b

            for (let i = 0; i < count; i++) {
                const cls = (hasVisionClass && i < lastParsedPoints.length)
                    ? lastParsedPoints[i] : 0

                if (cls > 0 && cls < mask_colors.length) {
                    const mc = mask_colors[cls]
                    colors[i * 3] = mc.r
                    colors[i * 3 + 1] = mc.g
                    colors[i * 3 + 2] = mc.b
                } else {
                    colors[i * 3] = gr
                    colors[i * 3 + 1] = gg
                    colors[i * 3 + 2] = gb
                }
            }
        }

        child.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        child.material.vertexColors = true
        child.material.needsUpdate = true
    })
}

/**
 * Show the fusion warning banner for 5 seconds.
 */
function showFusionWarning() {
    if (fusionWarningTimer) clearTimeout(fusionWarningTimer)
    fusionWarning.style.display = 'block'
    fusionWarningTimer = setTimeout(() => {
        fusionWarning.style.display = 'none'
        fusionWarningTimer = null
    }, 5000)
}

// Colour mode selector
colorModeSelect.addEventListener('change', () => {
    currentColorMode = colorModeSelect.value
    switchTopic()

    // When switching to a mode that needs a different topic, wait for the first
    // frame from that topic rather than recolouring stale data.
    const needsNewTopic = currentColorMode === 'vision_class' || currentColorMode === 'cluster'
    if (!needsNewTopic && pointsGroup) {
        applyColorMode(pointsGroup)
    }
})

// ---------------------------------------------------------------------------
// Part C: WebSocket & Point Cloud Rendering
// ---------------------------------------------------------------------------

/**
 * Return the active WebSocket topic based on current colour mode.
 */
function getActiveTopic() {
    if (currentColorMode === 'vision_class') return socketUrlFusion
    if (currentColorMode === 'cluster') return socketUrlCluster
    return socketUrlRaw
}

/**
 * Open (or re-open) the WebSocket connection for the active topic.
 */
function connectSocket() {
    // Close existing socket cleanly — null onclose to prevent auto-reconnect
    if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
    }

    const topic = getActiveTopic()
    socket = new WebSocket(topic)
    socket.binaryType = 'arraybuffer'

    clearTimeout(unavailableTimer)
    unavailableTimer = setTimeout(() => {
        lidarUnavailable.style.display = 'flex'
    }, 1000)

    socket.onmessage = (event) => {
        lidarUnavailable.style.display = 'none'
        clearTimeout(unavailableTimer)
        unavailableTimer = setTimeout(() => {
            lidarUnavailable.style.display = 'flex'
        }, 1000)
        updatePointCloud(event.data)
    }

    socket.onerror = (error) => {
        console.error('LiDAR WebSocket error:', error)
        if (currentColorMode === 'vision_class' || currentColorMode === 'cluster') {
            showFusionWarning()
        }
    }

    socket.onclose = () => {
        console.log('LiDAR WebSocket connection closed — reconnecting in 3 s')
        setTimeout(connectSocket, 3000)
    }
}

/**
 * Switch to the appropriate topic (called when colour mode changes).
 */
function switchTopic() {
    connectSocket()
}

/**
 * Parse incoming binary data into a Three.js point cloud and add to scene.
 */
function updatePointCloud(arrayBuffer) {
    try {
        const group = pcdLoader.parse(arrayBuffer)

        // Extract per-point field for modes that need it
        if (currentColorMode === 'vision_class') {
            extractField(arrayBuffer, 'vision_class')
        } else if (currentColorMode === 'cluster') {
            extractField(arrayBuffer, 'cluster_id')
        }

        // Orient the cloud
        group.rotation.set(0, Math.PI / 2, 0)

        // Apply colour
        applyColorMode(group)

        // Set point material properties — larger in light mode for visibility
        const ptSize = cachedIsDark ? 3 : 4
        group.traverse((child) => {
            if (child instanceof THREE.Points) {
                child.material.size = ptSize
                child.material.sizeAttenuation = false
                child.material.transparent = false
                child.material.blending = THREE.NormalBlending
                child.material.needsUpdate = true
            }
        })

        // Replace old point cloud in the scene
        if (pointsGroup) {
            scene.remove(pointsGroup)
        }
        pointsGroup = group
        scene.add(pointsGroup)
    } catch (error) {
        console.error('Error updating point cloud:', error)
    }
}

/**
 * Re-parse CDR binary data to extract a single named field for each point.
 * Populates `lastParsedPoints` as a flat Int32Array (one entry per point).
 */
function extractField(arrayBuffer, fieldName) {
    try {
        const dataView = new DataView(arrayBuffer)
        const reader = new CdrReader(dataView)

        // Deserialize PointCloud2 header
        reader.uint32() // header.stamp.sec
        reader.uint32() // header.stamp.nsec
        reader.string() // header.frame_id

        const height = reader.uint32()
        const width = reader.uint32()

        // Fields — find target field offset and datatype
        const fieldCount = reader.sequenceLength()
        let fieldOffset = -1
        let fieldDatatype = 0
        for (let i = 0; i < fieldCount; i++) {
            const name = reader.string()
            const offset = reader.uint32()
            const datatype = reader.uint8()
            reader.uint32() // count
            if (name === fieldName) {
                fieldOffset = offset
                fieldDatatype = datatype
            }
        }

        const is_bigendian = reader.int8() > 0
        const point_step = reader.uint32()
        reader.uint32() // row_step
        const rawData = reader.uint8Array()

        const totalPoints = height * width

        if (fieldOffset < 0) {
            lastParsedPoints = new Int32Array(0)
            return
        }

        // Zero-copy: wrap the underlying buffer directly
        const rawBuf = rawData.buffer
        const rawBase = rawData.byteOffset
        const view = new DataView(rawBuf, rawBase, rawData.length)
        const le = !is_bigendian

        const values = new Int32Array(totalPoints)

        for (let i = 0; i < totalPoints; i++) {
            const o = i * point_step + fieldOffset
            switch (fieldDatatype) {
                case 1: values[i] = view.getInt8(o); break
                case 2: values[i] = view.getUint8(o); break
                case 3: values[i] = view.getInt16(o, le); break
                case 4: values[i] = view.getUint16(o, le); break
                case 5: values[i] = view.getInt32(o, le); break
                case 6: values[i] = view.getUint32(o, le); break
                case 7: values[i] = view.getFloat32(o, le); break
                case 8: values[i] = view.getFloat64(o, le); break
                default: values[i] = 0
            }
        }

        lastParsedPoints = values
    } catch (error) {
        console.error('Error extracting field:', fieldName, error)
        lastParsedPoints = new Int32Array(0)
    }
}

// ---------------------------------------------------------------------------
// Theme Integration
// ---------------------------------------------------------------------------
document.addEventListener('themechange', (e) => {
    cachedIsDark = resolveIsDark()
    scene.background = getBgColorFromCSS()

    // Recolour & resize points — colours and size vary with theme
    if (pointsGroup) {
        applyColorMode(pointsGroup)
        const ptSize = cachedIsDark ? 3 : 4
        pointsGroup.traverse((child) => {
            if (child instanceof THREE.Points) {
                child.material.size = ptSize
                child.material.needsUpdate = true
            }
        })
    }
})

// ---------------------------------------------------------------------------
// Config Loading & Initialisation
// ---------------------------------------------------------------------------
fetch('/config/webui/details')
    .then((res) => res.json())
    .then((config) => {
        if (config.LIDAR_TOPIC) {
            socketUrlRaw = config.LIDAR_TOPIC
        }
        if (config.CLUSTER_TOPIC) {
            socketUrlCluster = config.CLUSTER_TOPIC
        }
        if (config.FUSION_TOPIC) {
            socketUrlFusion = config.FUSION_TOPIC
        }
        connectSocket()
    })
    .catch((err) => {
        console.warn('Could not load config — using defaults:', err)
        connectSocket()
    })
