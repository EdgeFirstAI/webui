// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import pcdStream, { preprocessPoints } from './pcd.js'
import { project_points_onto_box } from './classify.js'
import modelstream from './model.js'
import { createSegOverlay, clusterColor, trackIdToHash } from './segOverlay.js'
import Stats, { fpsUpdate } from "./Stats.js"
import droppedframes from './droppedframes.js'
import { OrbitControls } from './OrbitControls.js'
import { clearThree, color_points_class, color_points_field } from './utils.js'
import { grid_set_radarpoints, init_grid } from './grid_render.js'
import createSyncedVideo from './SyncedVideo.js'
import StampBuffer, { selectDerived, selectSensor, sensorToleranceMs } from './StampBuffer.js'
import { stampToMs } from './stamp.js'

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

let material_proj;
let radar_points;
let modelData = null;

let CAMERA_DRAW_PCD = "disabled"
let CAMERA_PCD_LABEL = "disabled"
let DRAW_BOX = true
let DRAW_BOX_TEXT = true

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
 * project_points_onto_box (which writes a `text` field with range/speed and
 * adds boxes for unmatched points) on a per-frame copy of the boxes.
 * Otherwise we fall back to the box's own `distance` and `speed` fields,
 * which the fusion service populates in the unified Model.msg.
 */
function drawBoxesSpeedDistance(canvas, boxes, radarPoints, drawBoxSettings) {
    if (!boxes) return
    const ctx = canvas.getContext("2d");
    if (ctx == null) return
    ctx.font = "48px monospace";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // The model message is buffered and drawn for several frames; project
    // the radar labels onto a copy so each frame starts from the model's boxes.
    const drawn = boxes.map((b) => ({ ...b, text: undefined }))
    if (radarPoints && radarPoints.length > 0) {
        project_points_onto_box(radarPoints, drawn)
    }

    for (let box of drawn) {
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

const cameraUpdate = fpsUpdate(cameraPanel)
const video = createSyncedVideo({
    onFrame: () => {
        cameraUpdate();
        resetTimeout();
    },
    onTexture: (tex) => {
        if (material_proj) {
            material_proj.uniforms.tex.value = tex
            material_proj.needsUpdate = true
            return
        }
        const quad = new THREE.PlaneGeometry(width / height * 500, 500);
        material_proj = new ProjectedMaterial({
            camera: camera,
            texture: tex,
            color: '#000',
            transparent: true,
        })
        const mesh_cam = new THREE.Mesh(quad, material_proj);
        mesh_cam.position.z = 50;
        mesh_cam.rotation.x = PI;
        mesh_cam.renderOrder = 0;
        scene.add(mesh_cam);
    },
})

const segOverlay = createSegOverlay(scene, camera)

const modelBuffer = new StampBuffer({ capacity: 32 })
const modelFPSUpdate = fpsUpdate(modelPanel)
modelstream(socketUrlModel, (msg) => {
    const stampMs = stampToMs(msg.header.time.sec, msg.header.time.nanosec)
    video.clock.observe('model', stampMs, performance.now())
    modelBuffer.push(stampMs, msg)
    modelFPSUpdate()
})

const drawBoxSettings = {
    drawBox: DRAW_BOX,
    drawBoxText: DRAW_BOX_TEXT,
}

// The bird's-eye grid shows the latest radar data; the video overlay uses
// the sample nearest the displayed frame. Radar runs near 18 Hz, so 64
// entries (about 3.5 s) cover the same display lag as 32 model entries.
const radarBuffer = new StampBuffer({ capacity: 64 })
let radarFpsFn = fpsUpdate(radarPanel);
pcdStream(socketUrlPcd, ({ stampMs, points }) => {
    radarFpsFn();
    const filtered = preprocessPoints(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1], points)
    if (radar_points) radar_points.points = filtered
    video.clock.observe('radar', stampMs, performance.now())
    radarBuffer.push(stampMs, filtered)
    video.clock.setTolerance('radar', sensorToleranceMs(radarBuffer))
}).then((pcd) => {
    radar_points = pcd;
    grid_set_radarpoints(radar_points)
})

THREE.Cache.enabled = true;

const rendered = []

renderer.setAnimationLoop(animate);

function animate() {
    const displayed = video.tick()
    const model = selectDerived(modelBuffer, displayed)
    const radar = selectSensor(radarBuffer, displayed)
    const radarPoints = radar ? radar.value : null
    modelData = model ? model.value : null

    segOverlay.update(modelData)
    const boxCtx = boxCanvas.getContext("2d")
    boxCtx.clearRect(0, 0, boxCanvas.width, boxCanvas.height)
    if (modelData) {
        drawBoxesSpeedDistance(boxCanvas, modelData.boxes, radarPoints, drawBoxSettings)
    }

    rendered.forEach((cell) => { clearThree(cell) })
    rendered.length = 0
    if (CAMERA_DRAW_PCD !== "disabled" && radarPoints && radarPoints.length > 0) {
        if (CAMERA_DRAW_PCD.endsWith("class")) {
            color_points_class(radarPoints, CAMERA_DRAW_PCD, scene, rendered, true, CAMERA_PCD_LABEL)
        } else {
            // Sorts in place; the buffered sample must keep its order.
            color_points_field(radarPoints.slice(), CAMERA_DRAW_PCD, scene, rendered, true, CAMERA_PCD_LABEL)
        }
    }
    renderer.render(scene, camera)
    video.reportSync({ model, radar })
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
