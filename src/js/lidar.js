// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as THREE from './three.js'
import { OrbitControls } from './OrbitControls.js'
import { PCDLoader } from './PCDLoader.js'
import { mask_colors } from './utils.js'
import { parsePointCloud2, extractFieldArray } from './pointcloud2.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RAW_TOPIC = '/api/rt/lidar/points/'
const CLUSTER_TOPIC = '/api/rt/lidar/clusters/'
const FUSION_TOPIC = '/api/rt/fusion/lidar/'
const UNAVAILABLE_TIMEOUT_MS = 1000
const FUSION_WARNING_DURATION_MS = 5000
const RECONNECT_DELAY_MS = 3000

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
let showNoise = true
let showGround = true
let lastPositions = null  // Float32Array of original XYZ positions

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const viewport = document.getElementById('lidar-viewport')
const colorModeSelect = document.getElementById('color-mode')
const fusionWarning = document.getElementById('fusion-warning')
const lidarUnavailable = document.getElementById('lidar-unavailable')
const clusterFilters = document.getElementById('cluster-filters')
const showNoiseCheckbox = document.getElementById('show-noise')
const showGroundCheckbox = document.getElementById('show-ground')
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
// Dynamic Colour Mode Detection
// ---------------------------------------------------------------------------

// Enriched field names → dropdown option value and label
const ENRICHED_COLOR_MODES = [
    { value: 'cluster',      label: 'Cluster',      field: 'cluster_id' },
    { value: 'vision_class', label: 'Vision Class',  field: 'vision_class' },
    { value: 'track_id',     label: 'Track ID',      field: 'track_id' },
    { value: 'instance_id',  label: 'Instance ID',   field: 'instance_id' },
]

/**
 * Update the colour-mode dropdown to show only modes whose fields exist in
 * the current PointCloud2 data. fixed/distance are always present.
 */
function updateAvailableColorModes(fieldMap) {
    for (const mode of ENRICHED_COLOR_MODES) {
        if (!fieldMap[mode.field]) continue
        let option = colorModeSelect.querySelector(`option[value="${mode.value}"]`)
        if (!option) {
            option = document.createElement('option')
            option.value = mode.value
            option.textContent = mode.label
            colorModeSelect.appendChild(option)
        }
    }
}

/**
 * Remove all enriched colour-mode options (called on topic switch so that
 * newly detected fields from the new topic populate the dropdown fresh).
 */
function resetEnrichedColorModes() {
    for (const mode of ENRICHED_COLOR_MODES) {
        const option = colorModeSelect.querySelector(`option[value="${mode.value}"]`)
        if (option) option.remove()
    }
}

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
            const hasData = lastParsedPoints.length > 0
            if (!hasData) showFusionWarning()

            const gr = cachedIsDark ? 0.35 : 0.7
            const generic = getFixedColor()
            for (let i = 0; i < count; i++) {
                const cls = (hasData && i < lastParsedPoints.length)
                    ? lastParsedPoints[i] : 0

                if (cls <= 0) {
                    colors[i * 3] = gr
                    colors[i * 3 + 1] = gr
                    colors[i * 3 + 2] = gr
                } else if (cls < mask_colors.length) {
                    const mc = mask_colors[cls]
                    colors[i * 3] = mc.r
                    colors[i * 3 + 1] = mc.g
                    colors[i * 3 + 2] = mc.b
                } else {
                    colors[i * 3] = generic.r
                    colors[i * 3 + 1] = generic.g
                    colors[i * 3 + 2] = generic.b
                }
            }
        } else if (currentColorMode === 'track_id') {
            const hasData = lastParsedPoints.length > 0
            if (!hasData) showFusionWarning()

            const gr = cachedIsDark ? 0.35 : 0.7
            for (let i = 0; i < count; i++) {
                const tid = (hasData && i < lastParsedPoints.length)
                    ? lastParsedPoints[i] : 0
                if (tid === 0) {
                    colors[i * 3] = gr
                    colors[i * 3 + 1] = gr
                    colors[i * 3 + 2] = gr
                } else {
                    const c = clusterColor(tid)
                    colors[i * 3] = c.r
                    colors[i * 3 + 1] = c.g
                    colors[i * 3 + 2] = c.b
                }
            }
        } else if (currentColorMode === 'instance_id') {
            const hasData = lastParsedPoints.length > 0
            if (!hasData) showFusionWarning()

            const gr = cachedIsDark ? 0.35 : 0.7
            for (let i = 0; i < count; i++) {
                const iid = (hasData && i < lastParsedPoints.length)
                    ? lastParsedPoints[i] : 0
                if (iid === 0) {
                    colors[i * 3] = gr
                    colors[i * 3 + 1] = gr
                    colors[i * 3 + 2] = gr
                } else {
                    const c = clusterColor(iid)
                    colors[i * 3] = c.r
                    colors[i * 3 + 1] = c.g
                    colors[i * 3 + 2] = c.b
                }
            }
        }

        child.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        child.material.vertexColors = true
        child.material.needsUpdate = true
    })
}

/**
 * Hide noise/ground points by setting their positions to NaN (GPU discards them).
 * Restores original positions first so toggling back on works correctly.
 */
function filterClusterPoints(group) {
    if (currentColorMode !== 'cluster') return
    if (!lastPositions) return

    group.traverse((child) => {
        if (!(child instanceof THREE.Points)) return
        const posAttr = child.geometry.attributes.position
        if (!posAttr) return

        // Restore original positions first (undo previous NaN filtering)
        posAttr.array.set(lastPositions)

        const count = posAttr.count
        const hasData = lastParsedPoints.length > 0

        for (let i = 0; i < count; i++) {
            const id = (hasData && i < lastParsedPoints.length)
                ? lastParsedPoints[i] : 0
            if ((id === 0 && !showNoise) || (id === 1 && !showGround)) {
                posAttr.setXYZ(i, NaN, NaN, NaN)
            }
        }
        posAttr.needsUpdate = true
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
    }, FUSION_WARNING_DURATION_MS)
}

// Colour mode selector
colorModeSelect.addEventListener('change', () => {
    currentColorMode = colorModeSelect.value
    updateClusterFiltersVisibility()
    switchTopic()

    // When switching to a mode that needs a different topic, wait for the first
    // frame from that topic rather than recolouring stale data.
    const needsNewTopic = ['vision_class', 'cluster', 'track_id', 'instance_id'].includes(currentColorMode)
    if (!needsNewTopic && pointsGroup) {
        applyColorMode(pointsGroup)
    }
})

function updateClusterFiltersVisibility() {
    clusterFilters.style.display = currentColorMode === 'cluster' ? 'flex' : 'none'
}

showNoiseCheckbox.addEventListener('change', () => {
    showNoise = showNoiseCheckbox.checked
    if (pointsGroup) {
        applyColorMode(pointsGroup)
        filterClusterPoints(pointsGroup)
    }
})

showGroundCheckbox.addEventListener('change', () => {
    showGround = showGroundCheckbox.checked
    if (pointsGroup) {
        applyColorMode(pointsGroup)
        filterClusterPoints(pointsGroup)
    }
})

// ---------------------------------------------------------------------------
// Part C: WebSocket & Point Cloud Rendering
// ---------------------------------------------------------------------------

/**
 * Return the active WebSocket topic based on current colour mode.
 */
function getActiveTopic() {
    if (['vision_class', 'track_id', 'instance_id'].includes(currentColorMode)) return socketUrlFusion
    if (currentColorMode === 'cluster') return socketUrlCluster
    return socketUrlRaw
}

/**
 * Open (or re-open) the WebSocket connection for the active topic.
 */
function connectSocket() {
    // Close existing socket cleanly — null handlers to prevent late messages/reconnect
    if (socket) {
        socket.onmessage = null
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
    }, UNAVAILABLE_TIMEOUT_MS)

    socket.onmessage = (event) => {
        lidarUnavailable.style.display = 'none'
        clearTimeout(unavailableTimer)
        unavailableTimer = setTimeout(() => {
            lidarUnavailable.style.display = 'flex'
        }, UNAVAILABLE_TIMEOUT_MS)
        updatePointCloud(event.data)
    }

    socket.onerror = (error) => {
        console.error('LiDAR WebSocket error:', error)
        if (['vision_class', 'cluster', 'track_id', 'instance_id'].includes(currentColorMode)) {
            showFusionWarning()
        }
    }

    socket.onclose = () => {
        console.log('LiDAR WebSocket connection closed — reconnecting in 3 s')
        setTimeout(connectSocket, RECONNECT_DELAY_MS)
    }
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
            const parsed = parsePointCloud2(event.data)
            updateAvailableColorModes(parsed.fieldMap)
        } catch (_) { /* topic may not be available */ }
        ws.close()
    }
    ws.onerror = () => {
        clearTimeout(probeTimeout)
        ws.onmessage = null
        ws.onerror = null
        ws.close()
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

        // Reuse the parsed result from PCDLoader (avoids double-parsing)
        const parsed = pcdLoader.lastParsed

        // Update available colour modes based on detected fields
        updateAvailableColorModes(parsed.fieldMap)

        // Extract per-point field for modes that need it
        const fieldForMode = {
            vision_class: 'vision_class',
            cluster: 'cluster_id',
            track_id: 'track_id',
            instance_id: 'instance_id',
        }
        const targetField = fieldForMode[currentColorMode]
        if (targetField) {
            lastParsedPoints = extractFieldArray(parsed, targetField)
        }

        // Orient the cloud
        group.rotation.set(0, Math.PI / 2, 0)

        // Save original positions before applyColorMode (which may NaN-hide
        // points) — must happen first so the array sizes always match the
        // current frame, even when the topic changes and point count differs.
        group.traverse((child) => {
            if (child instanceof THREE.Points) {
                const posAttr = child.geometry.attributes.position
                if (posAttr) lastPositions = new Float32Array(posAttr.array)
                // Pre-compute bounding sphere from clean positions so that
                // NaN-hidden points don't trigger a recomputation later —
                // THREE.js skips computeBoundingSphere when it's already set.
                child.geometry.computeBoundingSphere()
            }
        })

        // Apply colour
        applyColorMode(group)
        filterClusterPoints(group)

        // Set point material properties — larger in light mode for visibility
        const ptSize = cachedIsDark ? 3 : 4
        group.traverse((child) => {
            if (child instanceof THREE.Points) {
                child.material.size = ptSize
                child.material.sizeAttenuation = false
                child.material.transparent = false
                child.material.blending = THREE.NormalBlending
                child.material.needsUpdate = true
                // NaN-hidden points break computeBoundingSphere — skip frustum
                // culling since the point cloud is always in view.
                child.frustumCulled = false
            }
        })

        // Replace old point cloud in the scene
        if (pointsGroup) {
            pointsGroup.traverse((child) => {
                if (child instanceof THREE.Points) {
                    child.geometry.dispose()
                    child.material.dispose()
                }
            })
            scene.remove(pointsGroup)
        }
        pointsGroup = group
        scene.add(pointsGroup)
    } catch (error) {
        console.error('Error updating point cloud:', error)
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
// Initialisation
// ---------------------------------------------------------------------------
connectSocket()
probeTopicFields(socketUrlCluster)
probeTopicFields(socketUrlFusion)
