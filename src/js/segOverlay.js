// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Segmentation overlay for unified Model.msg masks.
//
// Renders both instance (boxed) and semantic (full-frame) masks using a
// single ShaderMaterial whose DataArrayTexture atlas holds up to MAX_SEG_MASKS
// layers.  Caller drives the per-frame update by passing the latest Model
// message into update().

import * as THREE from './three.js'
import ModelInfo from './modelInfo.js'
import { mask_colors } from './utils.js'

const MAX_SEG_MASKS = 32

// Maximum overlay opacity (~75%). Capping below 1.0 ensures overlapping masks
// blend via source-over rather than one fully replacing the other.
const MASK_MAX_ALPHA = 0.75

const VERTEX_SHADER = `
    out vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const FRAGMENT_SHADER = `
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
        // Camera has rotation.z=PI + rotation.x=PI, so right axis is -X → flip U.
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);

        if (isInstance) {
            vec4 result = vec4(0.0);
            for (int i = 0; i < ${MAX_SEG_MASKS}; i++) {
                if (i >= maskCount) break;
                vec4 bb = bboxes[i];
                if (uv.x < bb.x || uv.x > bb.x + bb.z ||
                    uv.y < bb.y || uv.y > bb.y + bb.w) continue;
                vec2 maskUV = (uv - bb.xy) / bb.zw * maskScales[i];
                float sig = texture(masks, vec3(maskUV, float(i))).r;
                float edge = smoothstep(0.5, 0.65, sig);
                if (edge <= 0.0) continue;
                float a = edge * colors[i].a;
                result.rgb = colors[i].rgb * a + result.rgb * (1.0 - a);
                result.a = a + result.a * (1.0 - a);
            }
            pc_fragColor = result;
        } else {
            float maxVal = 0.0;
            int maxIdx = 0;
            for (int i = 0; i < ${MAX_SEG_MASKS}; i++) {
                if (i >= maskCount) break;
                float val = texture(masks, vec3(uv, float(i))).r;
                if (val > maxVal) { maxVal = val; maxIdx = i; }
            }
            float edge = smoothstep(0.5, 0.65, maxVal);
            if (edge <= 0.0) {
                pc_fragColor = vec4(0.0);
            } else {
                pc_fragColor = vec4(colors[maxIdx].rgb, colors[maxIdx].a * edge);
            }
        }
    }
`

/**
 * Convert a UUID/track-ID string to a uint32 hash.  Matches the hashing the
 * fusion service uses on its track_id field so a given track gets the same
 * cluster colour across LiDAR and mask overlays.
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

/**
 * Create a segmentation overlay mesh attached to `scene`, sized to fill the
 * camera's frustum at the given z-offset.  Caller must invoke `update(modelData)`
 * before each render with the latest parsed Model.msg.
 *
 * @param {THREE.Scene}              scene
 * @param {THREE.PerspectiveCamera}  camera
 * @param {object}                   [options]
 * @param {number}                   [options.zOffset=50]      z-position of the overlay plane
 * @param {number}                   [options.renderOrder=1]   THREE renderOrder
 * @param {boolean}                  [options.drawBackground]  paint background classes
 */
export function createSegOverlay(scene, camera, options = {}) {
    const zOffset = options.zOffset ?? 50
    const renderOrder = options.renderOrder ?? 1
    let drawBackground = options.drawBackground ?? false

    const fovRad = camera.fov * Math.PI / 180
    const planeH = 2 * zOffset * Math.tan(fovRad / 2)
    const planeW = planeH * camera.aspect
    const quad = new THREE.PlaneGeometry(planeW, planeH)

    // Placeholder texture so the sampler2DArray binding is valid before any
    // mask data has arrived from the model topic.
    const placeholder = new THREE.DataArrayTexture(new Uint8Array(1), 1, 1, 1)
    placeholder.format = THREE.RedFormat
    placeholder.internalFormat = 'R8'
    placeholder.type = THREE.UnsignedByteType
    placeholder.needsUpdate = true

    const colorsArr = new Float32Array(MAX_SEG_MASKS * 4)
    const bboxesArr = new Float32Array(MAX_SEG_MASKS * 4)
    const scalesArr = new Float32Array(MAX_SEG_MASKS * 2).fill(1.0)

    const material = new THREE.ShaderMaterial({
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
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        glslVersion: THREE.GLSL3,
    })

    const mesh = new THREE.Mesh(quad, material)
    mesh.position.z = zOffset
    mesh.rotation.x = Math.PI
    mesh.renderOrder = renderOrder
    mesh.visible = false
    scene.add(mesh)

    // Atlas texture, sized to the largest mask seen so far (per page session).
    let atlas = null
    let atlasW = 0
    let atlasH = 0

    function ensureAtlas(w, h) {
        if (atlas && atlasW === w && atlasH === h) return
        if (atlas) atlas.dispose()
        const data = new Uint8Array(w * h * MAX_SEG_MASKS)
        atlas = new THREE.DataArrayTexture(data, w, h, MAX_SEG_MASKS)
        atlas.format = THREE.RedFormat
        atlas.internalFormat = 'R8'
        atlas.type = THREE.UnsignedByteType
        atlas.minFilter = THREE.LinearFilter
        atlas.magFilter = THREE.LinearFilter
        atlas.needsUpdate = true
        atlasW = w
        atlasH = h
    }

    function update(modelData) {
        if (!modelData || !modelData.masks || modelData.masks.length === 0) {
            mesh.visible = false
            return
        }
        const { boxes, masks } = modelData
        const isInstance = masks[0].boxed
        const maskCount = Math.min(masks.length, MAX_SEG_MASKS)

        // Instance masks have per-box crop dimensions; find the max so every
        // layer fits in a single shared atlas texture.
        let maxW = 0, maxH = 0
        for (let i = 0; i < maskCount; i++) {
            if (masks[i].width > maxW) maxW = masks[i].width
            if (masks[i].height > maxH) maxH = masks[i].height
        }
        if (maxW === 0 || maxH === 0) {
            mesh.visible = false
            return
        }

        // 1px transparent border on every side so GPU bilinear interpolation
        // blends to zero at the crop edge.
        const padW = maxW + 2
        const padH = maxH + 2
        ensureAtlas(padW, padH)

        const buf = atlas.image.data
        const layerSize = padW * padH
        buf.fill(0)
        for (let i = 0; i < maskCount; i++) {
            const m = masks[i]
            if (!m.mask || m.mask.length === 0) continue
            const w = m.width
            const h = m.height
            const layerOffset = i * layerSize
            for (let row = 0; row < h; row++) {
                const srcStart = row * w
                const dstStart = layerOffset + (row + 1) * padW + 1
                for (let col = 0; col < w; col++) {
                    buf[dstStart + col] = srcStart + col < m.mask.length ? m.mask[srcStart + col] : 0
                }
            }
        }
        atlas.needsUpdate = true

        const u = material.uniforms
        u.masks.value = atlas
        u.isInstance.value = isInstance
        u.maskCount.value = maskCount

        for (let i = 0; i < maskCount; i++) {
            const base = i * 4
            if (isInstance) {
                const m = masks[i]
                scalesArr[i * 2]     = (m.width + 2) / padW
                scalesArr[i * 2 + 1] = (m.height + 2) / padH

                const box = boxes && boxes[i] ? boxes[i] : null
                let cr, cg, cb
                if (box && box.track && box.track.id) {
                    const c = clusterColor(trackIdToHash(box.track.id))
                    cr = c.r; cg = c.g; cb = c.b
                } else {
                    cr = 0; cg = 1; cb = 0.4
                }
                colorsArr[base]     = cr
                colorsArr[base + 1] = cg
                colorsArr[base + 2] = cb
                colorsArr[base + 3] = MASK_MAX_ALPHA

                if (box) {
                    const pixelW = box.width / m.width
                    const pixelH = box.height / m.height
                    bboxesArr[base]     = box.center_x - box.width / 2 - pixelW
                    bboxesArr[base + 1] = box.center_y - box.height / 2 - pixelH
                    bboxesArr[base + 2] = box.width + 2 * pixelW
                    bboxesArr[base + 3] = box.height + 2 * pixelH
                } else {
                    bboxesArr[base]     = 0
                    bboxesArr[base + 1] = 0
                    bboxesArr[base + 2] = 1
                    bboxesArr[base + 3] = 1
                }
            } else {
                const isBg = ModelInfo.isBackground(i)
                const cls = Math.min(i, mask_colors.length - 1)
                const mc = mask_colors[cls]
                colorsArr[base]     = mc.r
                colorsArr[base + 1] = mc.g
                colorsArr[base + 2] = mc.b
                colorsArr[base + 3] = (isBg && !drawBackground) ? 0.0 : 0.7

                bboxesArr[base]     = 0
                bboxesArr[base + 1] = 0
                bboxesArr[base + 2] = 1
                bboxesArr[base + 3] = 1
            }
        }

        mesh.visible = true
    }

    function setVisible(v) { mesh.visible = !!v }
    function setDrawBackground(v) { drawBackground = !!v }

    function dispose() {
        scene.remove(mesh)
        quad.dispose()
        material.dispose()
        placeholder.dispose()
        if (atlas) {
            atlas.dispose()
            atlas = null
        }
    }

    return {
        mesh,
        update,
        setVisible,
        setDrawBackground,
        dispose,
        trackIdToHash,
        clusterColor,
    }
}

export { trackIdToHash, clusterColor, MASK_MAX_ALPHA }
