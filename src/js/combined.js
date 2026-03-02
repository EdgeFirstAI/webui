// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import ProjectedMask from './ProjectedMask.js'
import segstream, { get_shape } from './mask.js'
import h264Stream from './stream.js'
import SmartVideoManager from './SmartVideoManager.js'
import pcdStream, { preprocessPoints } from './pcd.js'
import { project_points_onto_box } from './classify.js'
import boxesstream from './boxes.js'
import Stats, { fpsUpdate } from "./Stats.js"
import droppedframes from './droppedframes.js'
import { parseNumbersInObject } from './parseNumbersInObject.js';
import { OrbitControls } from './OrbitControls.js'
import { clearThree, color_points_class, color_points_field, mask_colors } from './utils.js'
import { grid_set_radarpoints, init_grid } from './grid_render.js'

const PI = Math.PI

const stats = new Stats();
const cameraPanel = stats.addPanel(new Stats.Panel('cameraFPS', '#fff', '#222'));
// const cameraMSPanel = stats.addPanel(new Stats.Panel('h264 decode ms', '#AAA', '#111'));
// const renderPanel = stats.addPanel(new Stats.Panel('renderFPS', '#4ff', '#022'));
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


// const camera_proj = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -1, 1000);
const camera = new THREE.PerspectiveCamera(46.4, width / height, 0.1, 1000);
camera.rotation.z = PI
camera.rotation.x = PI


// createLegend(mask_colors);
let texture_camera;
let material_proj;
let material_mask;


let mask_tex;
let detect_boxes;
let radar_points;


let CAMERA_DRAW_PCD = "disabled"
let CAMERA_PCD_LABEL = "disabled"
let DRAW_BOX = false
let DRAW_BOX_TEXT = true

let socketUrlH264 = '/rt/camera/h264/'
let socketUrlPcd = '/rt/radar/targets/'
let socketUrlDetect = '/rt/detect/boxes2d/'
let socketUrlMask = '/rt/detect/mask/'
let socketUrlErrors = '/ws/dropped'
let RANGE_BIN_LIMITS = [0, 20]
let show_stats = false


droppedframes(socketUrlErrors, playerCanvas)

function drawBoxesSpeedDistance(canvas, boxes, radar_points, drawBoxSettings) {

    if (!boxes) {
        return
    }
    if (!radar_points) {
        return
    }

    project_points_onto_box(radar_points, boxes)
    const ctx = canvas.getContext("2d");
    if (ctx == null) {
        return
    }
    ctx.font = "48px monospace";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let box of boxes) {
        let text = ""
        let color_box = "white"
        let color_text = "red"

        let x = box.center_x;
        if (drawBoxSettings.drawBox) {
            ctx.beginPath();
            ctx.rect((x - box.width / 2) * canvas.width, (box.center_y - box.height / 2) * canvas.height, box.width * canvas.width, box.height * canvas.height);
            ctx.strokeStyle = color_box;
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        if (drawBoxSettings.drawBoxText && box.text) {
            text = box.text
            let lines = text.split('\n');
            let lineheight = 40;
            ctx.strokeStyle = color_box
            ctx.fillStyle = color_text;
            ctx.lineWidth = 1;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], (x - box.width / 2) * canvas.width, (box.center_y - box.height / 2) * canvas.height + (lines.length - 1 - i * lineheight));
                ctx.strokeText(lines[i], (x - box.width / 2) * canvas.width, (box.center_y - box.height / 2) * canvas.height + (lines.length - 1 - i * lineheight));
            }
        }
    }
}

const renderer_grid = new THREE.WebGLRenderer({ antialias: true, canvas: gridCanvas });
let gridCanvasWidth = gridCanvas.parentElement.offsetWidth
let gridCanvasHeight = gridCanvas.parentElement.offsetHeight
renderer_grid.setSize(gridCanvasWidth, gridCanvasHeight)

const HFOV = 82
let aspect = gridCanvasWidth / gridCanvasHeight
// let fov = Math.atan(Math.tan(HFOV * Math.PI / 360) / aspect) * 360 / Math.PI
let fov = 20

const camera_grid = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
camera_grid.position.y = 1.9;
camera_grid.position.z = -4;

const orbitControls = new OrbitControls(camera_grid, gridCanvas);
orbitControls.target = new THREE.Vector3(0, 0, 3.25);
orbitControls.update();

const loader = new THREE.FileLoader();

loader.load(
    // resource URL
    '/config/webui/details',
    function (data) {
        const config = parseNumbersInObject(JSON.parse(data));
        console.log(config)

        init_config(config)
        if (show_stats) {
            stats.showPanel([3, 4, 5])
        }
        config.GRID_DRAW_PCD = config.COMBINED_GRID_DRAW_PCD
        config.GRID_FLATTEN_PCD = config.COMBINED_GRID_FLATTEN_PCD
        init_grid(grid_scene, renderer_grid, camera_grid, config)

        const quad = new THREE.PlaneGeometry(width / height * 500, 500);
        const cameraUpdate = fpsUpdate(cameraPanel)
        console.log('Initializing Smart Video Manager...');
        const videoManager = new SmartVideoManager();

        videoManager.init((timing) => {
            cameraUpdate();
            resetTimeout();

            // Log mode once
            if (timing.mode && !videoManager.loggedMode) {
                console.log(`✅ Video Mode: ${timing.mode === 'tiles' ? '4K Tiles' : 'H.264 Fallback'}`);
                videoManager.loggedMode = true;
            }
        }, h264Stream).then((tex) => {
            texture_camera = tex;
            material_proj = new ProjectedMaterial({
                camera: camera, // the camera that acts as a projector
                texture: texture_camera, // the texture being projected
                color: '#000', // the color of the object if it's not projected on
                transparent: true,
            })
            const mesh_cam = new THREE.Mesh(quad, material_proj);
            mesh_cam.needsUpdate = true;
            mesh_cam.position.z = 50;
            mesh_cam.rotation.x = PI;
            mesh_cam.renderOrder = 0; // Render video first
            scene.add(mesh_cam);

            console.log('✅ Smart Video System initialized successfully');
        })



        const modelFPSUpdate = fpsUpdate(modelPanel)

        // const maskMSPanel = stats.addPanel(new Stats.Panel('mask decode ms', '#A2A', '#420'));
        get_shape(socketUrlMask, (height, width, length, mask) => {
            const classes = Math.round(mask.length / height / width)
            segstream(socketUrlMask, height, width, classes, () => {
                modelFPSUpdate();
            }).then((texture_mask) => {
                material_mask = new ProjectedMask({
                    camera: camera, // the camera that acts as a projector
                    texture: texture_mask, // the texture being projected
                    transparent: true,
                    colors: mask_colors,
                })
                const mesh_mask = new THREE.Mesh(quad, material_mask);
                mesh_mask.needsUpdate = true;
                mesh_mask.position.z = 50;
                mesh_mask.rotation.x = PI;
                mesh_mask.renderOrder = 1; // Render mask on top of video
                mask_tex = texture_mask
                scene.add(mesh_mask);
            })
        })
        let boxes;
        let drawBoxSettings = {
            drawBox: DRAW_BOX,
            drawBoxText: DRAW_BOX_TEXT,
        }
        boxesstream(socketUrlDetect, null, () => {
            if (boxes && radar_points) {
                drawBoxesSpeedDistance(boxCanvas, boxes.msg.boxes, radar_points.points, drawBoxSettings)
            }
        }).then((b) => {
            boxes = b
        })

        let radarFpsFn = fpsUpdate(radarPanel);
        pcdStream(socketUrlPcd, () => {
            radarFpsFn();
            radar_points.points = preprocessPoints(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1], radar_points.points)
        }).then((pcd) => {
            radar_points = pcd;
            grid_set_radarpoints(radar_points)
        })
    },
    function () { },
    function (err) {
        console.error('An error happened', err);
    }
);

function init_config(config) {
    if (config.RANGE_BIN_LIMITS_MIN) {
        RANGE_BIN_LIMITS[0] = config.RANGE_BIN_LIMITS_MIN
    }
    if (config.RANGE_BIN_LIMITS_MAX) {
        RANGE_BIN_LIMITS[1] = config.RANGE_BIN_LIMITS_MAX
    }

    if (config.MASK_TOPIC) {
        socketUrlMask = config.MASK_TOPIC
    }

    if (config.DETECT_TOPIC) {
        socketUrlDetect = config.DETECT_TOPIC
    }

    if (config.PCD_TOPIC) {
        socketUrlPcd = config.PCD_TOPIC
    }

    if (config.H264_TOPIC) {
        socketUrlH264 = config.H264_TOPIC
    }

    if (config.COMBINED_CAMERA_DRAW_PCD) {
        CAMERA_DRAW_PCD = config.COMBINED_CAMERA_DRAW_PCD
    }
    if (config.COMBINED_CAMERA_PCD_LABEL) {
        CAMERA_PCD_LABEL = config.COMBINED_CAMERA_PCD_LABEL
    }

    if (typeof config.DRAW_BOX == "boolean") {
        DRAW_BOX = config.DRAW_BOX
    }

    if (typeof config.DRAW_BOX_TEXT == "boolean") {
        DRAW_BOX_TEXT = config.DRAW_BOX_TEXT
    }

    if (typeof config.SHOW_STATS == "boolean") {
        show_stats = config.SHOW_STATS
    }

}


THREE.Cache.enabled = true;




const rendered = []

renderer.setAnimationLoop(animate);

// const animationUpdate = fpsUpdate(renderPanel, 100)
function animate() {
    // animationUpdate()

    if ((typeof mask_tex !== "undefined" || typeof detect_boxes !== "undefined") && typeof radar_points !== "undefined") {
        if (CAMERA_DRAW_PCD != "disabled" && radar_points.points.length > 0) {
            let points = radar_points.points
            rendered.forEach((cell) => {
                clearThree(cell)
            })
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
    // camera_grid.fov = Math.atan(Math.tan(HFOV * Math.PI / 360) / camera_grid.aspect) * 360 / Math.PI
    // camera_grid.rotation.x = -Math.atan2(camera_grid.position.y, camera_grid.position.z-0.5) - camera_grid.fov * 0.5 * PI / 180;
    camera_grid.updateProjectionMatrix();
    renderer_grid.setSize(gridCanvasWidth, gridCanvasHeight)
}

