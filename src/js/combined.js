// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import pcdStream, { preprocessPoints } from './pcd.js'
import { project_points_onto_box } from './classify.js'
import modelstream from './model.js'
import { createSegOverlay, clusterColor, trackIdToHash } from './segOverlay.js'
import Stats, { fpsUpdate } from "./Stats.js"
import droppedframes from './droppedframes.js'
import { OrbitControls } from './OrbitControls.js'
import { clearThree, color_points_class, color_points_field } from './utils.js'
import { grid_set_radarpoints, init_grid } from './grid_render.js'

const PI = Math.PI

const stats = new Stats();
const cameraPanel = stats.addPanel(new Stats.Panel('cameraFPS', '#fff', '#222'));
const radarPanel = stats.addPanel(new Stats.Panel('radarFPS', '#ff4', '#220'));
const modelPanel = stats.addPanel(new Stats.Panel('modelFPS', '#f4f', '#210'));
stats.showPanel([])
stats.dom.style.cssText = "position: absolute; top: 0px; right: 0px; opacity: 0.9; z-index: 10000;";

document.querySelector('main').appendChild(stats.dom);

const grid_scene = new THREE.Scene()
grid_scene.background = new THREE.Color(0xa0a0a0)
const gridCanvas = document.getElementById("grid")

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa0a0a0)
const playerCanvas = document.getElementById("player")
const width = 1920;
const height = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: playerCanvas });
renderer.setSize(width, height)
renderer.domElement.style.cssText = ""

const boxCanvas = document.getElementById("boxes")
boxCanvas.width = width;
boxCanvas.height = height;

const camera = new THREE.PerspectiveCamera(46.4, width / height, 0.1, 1000);
camera.rotation.z = PI
camera.rotation.x = PI

let texture_camera;
let material_proj;
let radar_points;
let modelData = null;

let CAMERA_DRAW_PCD = "disabled"
let CAMERA_PCD_LABEL = "disabled"
let DRAW_BOX = true
let DRAW_BOX_TEXT = true

let socketUrlH264 = '/api/rt/camera/h264/'
let socketUrlPcd = '/api/rt/radar/targets/'
let socketUrlModel = '/api/rt/model/output/'
let socketUrlErrors = '/api/ws/dropped'
let RANGE_BIN_LIMITS = [0, 20]

droppedframes(socketUrlErrors, playerCanvas)

function colorToCSS(c) {
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
}

/**
 * Draw bounding boxes with text labels.
 *
 * If radar points are available we project them onto each box via
 * project_points_onto_box (which writes a `text` field with range/speed).
 * Otherwise we fall back to the box's own `distance` and `speed` fields,
 * which the fusion service populates in the unified Model.msg.
 */
function drawBoxesSpeedDistance(canvas, boxes, radarPoints, drawBoxSettings) {
    if (!boxes) return
    const ctx = canvas.getContext("2d");
    if (ctx == null) return
    ctx.font = "48px monospace";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (radarPoints && radarPoints.length > 0) {
        project_points_onto_box(radarPoints, boxes)
    }

    for (let box of boxes) {
        const x = box.center_x;
        let color
        if (box.track && box.track.id) {
            color = colorToCSS(clusterColor(trackIdToHash(box.track.id)))
        } else {
            color = "white"
        }

        if (drawBoxSettings.drawBox) {
            ctx.beginPath();
            ctx.rect(
                (x - box.width / 2) * canvas.width,
                (box.center_y - box.height / 2) * canvas.height,
                box.width * canvas.width,
                box.height * canvas.height
            );
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        if (!drawBoxSettings.drawBoxText) continue

        // Prefer the radar-projected text; fall back to the model's own
        // distance/speed (populated by fusion in the unified Model.msg).
        let text = box.text
        if (!text && (box.distance > 0 || box.speed > 0)) {
            text = `${box.distance.toFixed(1).padStart(5, " ")}m\n${box.speed.toFixed(1).padStart(5, " ")}m/s`
        }
        if (!text) continue

        const lines = text.split('\n');
        const lineheight = 40;
        ctx.fillStyle = "red";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        for (let i = 0; i < lines.length; i++) {
            const px = (x - box.width / 2) * canvas.width
            const py = (box.center_y - box.height / 2) * canvas.height + (lines.length - 1 - i * lineheight)
            ctx.fillText(lines[i], px, py);
            ctx.strokeText(lines[i], px, py);
        }
    }
}

const renderer_grid = new THREE.WebGLRenderer({ antialias: true, canvas: gridCanvas });
let gridCanvasWidth = gridCanvas.parentElement.offsetWidth
let gridCanvasHeight = gridCanvas.parentElement.offsetHeight
renderer_grid.setSize(gridCanvasWidth, gridCanvasHeight)

let aspect = gridCanvasWidth / gridCanvasHeight
let fov = 20

const camera_grid = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
camera_grid.position.y = 1.9;
camera_grid.position.z = -4;

const orbitControls = new OrbitControls(camera_grid, gridCanvas);
orbitControls.target = new THREE.Vector3(0, 0, 3.25);
orbitControls.update();

init_grid(grid_scene, renderer_grid, camera_grid, {})

const quad = new THREE.PlaneGeometry(width / height * 500, 500);
const cameraUpdate = fpsUpdate(cameraPanel)
const videoManager = new SmartVideoManager();

videoManager.init((timing) => {
    cameraUpdate();
    resetTimeout();
    if (timing.mode && !videoManager.loggedMode) {
        console.log(`Video Mode: ${timing.mode === 'tiles' ? '4K Tiles' : 'H.264 Fallback'}`);
        videoManager.loggedMode = true;
    }
}, h264Stream).then((tex) => {
    texture_camera = tex;
    material_proj = new ProjectedMaterial({
        camera: camera,
        texture: texture_camera,
        color: '#000',
        transparent: true,
    })
    const mesh_cam = new THREE.Mesh(quad, material_proj);
    mesh_cam.needsUpdate = true;
    mesh_cam.position.z = 50;
    mesh_cam.rotation.x = PI;
    mesh_cam.renderOrder = 0;
    scene.add(mesh_cam);
})

const segOverlay = createSegOverlay(scene, camera)

const modelFPSUpdate = fpsUpdate(modelPanel)
modelstream(socketUrlModel, (msg) => {
    modelData = msg
    modelFPSUpdate()
})

const drawBoxSettings = {
    drawBox: DRAW_BOX,
    drawBoxText: DRAW_BOX_TEXT,
}

let radarFpsFn = fpsUpdate(radarPanel);
pcdStream(socketUrlPcd, () => {
    radarFpsFn();
    radar_points.points = preprocessPoints(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1], radar_points.points)
}).then((pcd) => {
    radar_points = pcd;
    grid_set_radarpoints(radar_points)
})

THREE.Cache.enabled = true;

const rendered = []

renderer.setAnimationLoop(animate);

function animate() {
    if (modelData) {
        segOverlay.update(modelData)
        drawBoxesSpeedDistance(
            boxCanvas,
            modelData.boxes,
            radar_points ? radar_points.points : null,
            drawBoxSettings
        )
    }

    if (typeof radar_points !== "undefined") {
        if (CAMERA_DRAW_PCD !== "disabled" && radar_points.points.length > 0) {
            const points = radar_points.points
            rendered.forEach((cell) => { clearThree(cell) })
            if (CAMERA_DRAW_PCD.endsWith("class")) {
                color_points_class(points, CAMERA_DRAW_PCD, scene, rendered, true, CAMERA_PCD_LABEL)
            } else {
                color_points_field(points, CAMERA_DRAW_PCD, scene, rendered, true, CAMERA_PCD_LABEL)
            }
        }
    }
    renderer.render(scene, camera)
}

let timeoutId;
function resetTimeout() {
    clearTimeout(timeoutId);
    const timeoutElement = document.getElementById('timeout');
    if (timeoutElement) {
        timeoutElement.innerText = '';
        timeoutId = setTimeout(() => {
            const timeoutElementDelayed = document.getElementById('timeout');
            if (timeoutElementDelayed) {
                timeoutElementDelayed.innerText = 'Timeout: Verify if camera service is running';
            }
        }, 15000);
    }
}

window.addEventListener('resize', onWindowResize);
function onWindowResize() {
    let gridCanvasWidth = gridCanvas.parentElement.offsetWidth
    let gridCanvasHeight = gridCanvas.parentElement.offsetHeight
    camera_grid.aspect = gridCanvasWidth / gridCanvasHeight
    camera_grid.updateProjectionMatrix();
    renderer_grid.setSize(gridCanvasWidth, gridCanvasHeight)
}
