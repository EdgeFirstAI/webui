// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import ProjectedMask from './ProjectedMask.js'
import segstream, { get_shape } from './mask.js'
import h264Stream from './stream.js'
import boxesstream from './boxes.js'
import Stats, { fpsUpdate } from "./Stats.js"
import droppedframes from './droppedframes.js'
import { mask_colors } from './utils.js'
import { parseNumbersInObject } from './parseNumbersInObject.js'
const PI = Math.PI


const stats = new Stats();
const cameraPanel = stats.addPanel(new Stats.Panel('cameraFPS', '#fff', '#222'));
const modelPanel = stats.addPanel(new Stats.Panel('modelFPS', '#f4f', '#210'));
stats.dom.style.cssText = "position: absolute; top: 0px; right: 0px; opacity: 0.9; z-index: 10000;";
stats.showPanel([])
document.querySelector('main').appendChild(stats.dom);

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa0a0a0)
const playerCanvas = document.getElementById("player")
const width = 1920;
const height = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: playerCanvas });
renderer.setSize(width, height)
renderer.domElement.style.cssText = ""
// const camera_proj = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -1, 1000);
const camera = new THREE.PerspectiveCamera(46.4, width / height, 0.1, 1000);
camera.rotation.z = PI
camera.rotation.x = PI

let texture_camera;
let material_proj;
let material_mask;

const boxCanvas = document.getElementById("boxes")
boxCanvas.width = width;
boxCanvas.height = height;


let socketUrlH264 = '/rt/camera/h264/'
let socketUrlDetect = '/rt/detect/boxes2d/'
let socketUrlMask = '/rt/detect/mask/'
let socketUrlErrors = '/ws/dropped'
let DRAW_BOX = false
let DRAW_BOX_TEXT = true
let mirror = false
let show_stats = false

droppedframes(socketUrlErrors, playerCanvas)

function init_config(config) {
    if (config.MASK_TOPIC) {
        socketUrlMask = config.MASK_TOPIC;
    }

    if (config.DETECT_TOPIC) {
        socketUrlDetect = config.DETECT_TOPIC;
    }

    if (config.H264_TOPIC) {
        socketUrlH264 = config.H264_TOPIC;
    }


    if (typeof config.DRAW_BOX == "boolean") {
        DRAW_BOX = config.DRAW_BOX
    }

    if (typeof config.DRAW_BOX_TEXT == "boolean") {
        DRAW_BOX_TEXT = config.DRAW_BOX_TEXT
    }

    if (typeof config.MIRROR == "boolean") {
        mirror = config.MIRROR
    }

    if (typeof config.SHOW_STATS == "boolean") {
        show_stats = config.SHOW_STATS
    }

}

const loader = new THREE.FileLoader();



loader.load(
    '/config/webui/details',
    function (data) {
        const config = parseNumbersInObject(JSON.parse(data));
        console.log(config);
        init_config(config)

        if (show_stats) {
            stats.showPanel([3, 4])
        }


        const quad = new THREE.PlaneGeometry(width / height * 500, 500);
        const cameraUpdate = fpsUpdate(cameraPanel)
        h264Stream(socketUrlH264, 1920, 1080, 30, () => {
            cameraUpdate(), resetTimeout()
        }).then((tex) => {
            texture_camera = tex;
            material_proj = new ProjectedMaterial({
                camera: camera, // the camera that acts as a projector
                texture: texture_camera, // the texture being projected
                color: '#000', // the color of the object if it's not projected on
                flip: mirror,
                transparent: true,
            })
            const mesh_cam = new THREE.Mesh(quad, material_proj);
            mesh_cam.needsUpdate = true;
            mesh_cam.position.z = 50;
            mesh_cam.rotation.x = PI;
            mesh_cam.renderOrder = 0; // Render video first
            scene.add(mesh_cam);
        })


        const modelFPSUpdate = fpsUpdate(modelPanel)

        get_shape(socketUrlMask, (height, width, length, mask) => {
            const classes = Math.round(mask.length / height / width)
            segstream(socketUrlMask, height, width, classes, modelFPSUpdate).then((texture_mask) => {
                material_mask = new ProjectedMask({
                    camera: camera, // the camera that acts as a projector
                    texture: texture_mask, // the texture being projected
                    transparent: true,
                    flip: mirror,
                    colors: mask_colors,
                })
                const mesh_mask = new THREE.Mesh(quad, material_mask);
                mesh_mask.needsUpdate = true;
                mesh_mask.position.z = 50;
                mesh_mask.rotation.x = PI;
                mesh_mask.renderOrder = 1; // Render mask on top of video
                scene.add(mesh_mask);
            })
        })
        let drawBoxSettings = {
            canvas: boxCanvas,
            drawBox: DRAW_BOX,
            drawBoxText: DRAW_BOX_TEXT,
            mirror: mirror,
        }
        boxesstream(socketUrlDetect, drawBoxSettings).then()
    },
    function () {
        // Progress callback if needed
    },
    function (err) {
        console.error('An error happened', err);
    }
);
THREE.Cache.enabled = true;


renderer.setAnimationLoop(animate);

function animate() {
    // camera.rotation.y += 0.02
    if (texture_camera) {
        texture_camera.needsUpdate = true;
    }

    renderer.render(scene, camera);

}

let timeoutId;
function resetTimeout() {
    clearTimeout(timeoutId);
    document.getElementById('timeout').innerText = '';
    timeoutId = setTimeout(() => {
        document.getElementById('timeout').innerText = 'Timeout: Verify if camera service is running';
    }, 15000);
}
