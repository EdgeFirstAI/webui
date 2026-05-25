// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import modelstream from './model.js'
import ModelInfo from './modelInfo.js'
import { createSegOverlay, clusterColor, trackIdToHash } from './segOverlay.js'
import Stats, { fpsUpdate } from './Stats.js'
import droppedframes from './droppedframes.js'

const PI = Math.PI

const stats = new Stats()
const cameraPanel = stats.addPanel(new Stats.Panel('cameraFPS', '#fff', '#222'))
const modelPanel = stats.addPanel(new Stats.Panel('modelFPS', '#f4f', '#210'))
stats.dom.style.cssText = 'position: absolute; top: 0px; right: 0px; opacity: 0.9; z-index: 10000;'
stats.showPanel([])
document.querySelector('main').appendChild(stats.dom)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa0a0a0)
const playerCanvas = document.getElementById('player')
const width = 1920
const height = 1080
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: playerCanvas })
renderer.setSize(width, height)
renderer.domElement.style.cssText = ''

const camera = new THREE.PerspectiveCamera(46.4, width / height, 0.1, 1000)
camera.rotation.z = PI
camera.rotation.x = PI

const boxCanvas = document.getElementById('boxes')
boxCanvas.width = width
boxCanvas.height = height
const boxCtx = boxCanvas.getContext('2d')

let texture_camera
let material_proj
let modelData = null

const socketUrlH264 = '/api/rt/camera/h264/'
const socketUrlModel = '/api/rt/model/output/'
const socketUrlModelInfo = '/api/rt/model/info/'
const socketUrlErrors = '/api/ws/dropped'

const DRAW_BOX = false
const DRAW_BOX_TEXT = true

droppedframes(socketUrlErrors, playerCanvas)

THREE.Cache.enabled = true

const quad = new THREE.PlaneGeometry(width / height * 500, 500)

const cameraUpdate = fpsUpdate(cameraPanel)
const videoManager = new SmartVideoManager()

videoManager.init(() => {
    cameraUpdate()
    resetTimeout()
    if (!videoManager.loggedMode && videoManager.mode) {
        console.log(`Video Mode: ${videoManager.mode === 'tiles' ? '4K Tiles' : 'H.264 Fallback'}`)
        videoManager.loggedMode = true
    }
}, h264Stream).then((tex) => {
    texture_camera = tex
    material_proj = new ProjectedMaterial({
        camera: camera,
        texture: texture_camera,
        color: '#000',
        transparent: true,
    })
    const mesh_cam = new THREE.Mesh(quad, material_proj)
    mesh_cam.needsUpdate = true
    mesh_cam.position.z = 50
    mesh_cam.rotation.x = PI
    mesh_cam.renderOrder = 0
    scene.add(mesh_cam)
})

const segOverlay = createSegOverlay(scene, camera)

const modelFPSUpdate = fpsUpdate(modelPanel)
modelstream(socketUrlModel, (msg) => {
    modelData = msg
    modelFPSUpdate()
})

ModelInfo.connect(socketUrlModelInfo)

function colorToCSS(c) {
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
}

function renderBoxes() {
    boxCtx.clearRect(0, 0, width, height)
    if (!modelData || !modelData.boxes || modelData.boxes.length === 0) return

    boxCtx.font = '48px monospace'
    for (const box of modelData.boxes) {
        const x = (box.center_x - box.width / 2) * width
        const y = (box.center_y - box.height / 2) * height
        const w = box.width * width
        const h = box.height * height

        let color = 'white'
        if (box.track && box.track.id) {
            color = colorToCSS(clusterColor(trackIdToHash(box.track.id)))
        }

        if (DRAW_BOX) {
            boxCtx.strokeStyle = color
            boxCtx.lineWidth = 4
            boxCtx.strokeRect(x, y, w, h)
        }

        if (DRAW_BOX_TEXT) {
            const text = box.track && box.track.id ? box.track.id.substring(0, 8) : box.label
            if (text) {
                boxCtx.fillStyle = color
                boxCtx.fillText(text, x, y)
            }
        }
    }
}

renderer.setAnimationLoop(() => {
    if (texture_camera) {
        texture_camera.needsUpdate = true
    }
    if (modelData) {
        segOverlay.update(modelData)
        renderBoxes()
    }
    renderer.render(scene, camera)
})

let timeoutId
function resetTimeout() {
    clearTimeout(timeoutId)
    const el = document.getElementById('timeout')
    if (el) {
        el.innerText = ''
        timeoutId = setTimeout(() => {
            const el2 = document.getElementById('timeout')
            if (el2) el2.innerText = 'Timeout: Verify if camera service is running'
        }, 15000)
    }
}
