// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import { OrbitControls } from './OrbitControls.js'
import Stats, { fpsUpdate } from './Stats.js'
import pcdStream, { preprocessPoints } from './pcd.js'
import { grid_set_radarpoints, init_grid } from './grid_render.js'

const PI = Math.PI

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);
const HFOV = 82
let aspect = window.innerWidth / window.innerHeight
let fov = Math.atan(Math.tan(HFOV * Math.PI / 360) / aspect) * 360 / Math.PI
const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);



const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onWindowResize);
renderer.domElement.style.cssText = "display:flex; position: absolute; top: 0; left: 0;"
document.querySelector('main').appendChild(renderer.domElement);

const stats = new Stats();
const radarPanel = stats.addPanel(new Stats.Panel('radarFPS', '#ff4', '#220'));
stats.dom.style.cssText = "position: absolute; top: 0px; right: 0px; opacity: 0.9; z-index: 10000;";
stats.showPanel([])
document.querySelector('main').appendChild(stats.dom);

const socketUrlPcd = '/api/rt/radar/targets/';
const RANGE_BIN_LIMITS = [0, 20]

THREE.Cache.enabled = true;

init_grid(scene, renderer, camera, {})

let radarFpsFn = fpsUpdate(radarPanel);
let radar_points;
pcdStream(socketUrlPcd, () => {
    radarFpsFn();
    radar_points.points = preprocessPoints(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1], radar_points.points)
}).then((pcd) => {
    radar_points = pcd;
    grid_set_radarpoints(pcd)
})

camera.position.y = 15;
camera.position.z = RANGE_BIN_LIMITS[1] / 2 - 0.01;
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target = new THREE.Vector3(0, 0, RANGE_BIN_LIMITS[1]/2);
orbitControls.update();

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = Math.atan(Math.tan(HFOV * Math.PI / 360) / camera.aspect) * 360 / Math.PI
    camera.rotation.x = -Math.atan2(camera.position.y, camera.position.z - 0.5) - camera.fov * 0.5 * PI / 180;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

}
