// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial'
import ProjectedMask from './ProjectedMask'
import segstream, { get_shape } from './mask'
import h264Stream from './stream'
import { ImuStream, quaternionToEuler } from './imu'
import { OrbitControls } from './OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { mask_colors } from './utils.js'
const PI = 3.1415;

const STREAM = true;

let material_mask;
const jsonloader = new THREE.FileLoader();
jsonloader.load(
    // resource URL
    '/config/webui/details',
    function (data) {
        const config = parseIntsInObject(JSON.parse(data));
        console.log(config);
        // Use the config object here
    },
    function (xhr) {
        // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (err) {
        console.error('An error happened', err);
    }
);
THREE.Cache.enabled = true;

const socketUrlMask = '/rt/detect/mask/';
get_shape(socketUrlMask, (height, width, length, mask) => {
    const classes = Math.round(mask.length / height / width)
    segstream(socketUrlMask, height, width, classes).then((texture_mask) => {
        material_mask = new ProjectedMask({
            camera: camera_proj, // the camera that acts as a projector
            texture: texture_mask, // the texture being projected
            transparent: true,
            colors: mask_colors,
        })
        const mesh_mask = new THREE.Mesh(quad, material_mask);
        mesh_mask.needsUpdate = true;
        mesh_mask.position.z = 0;
        mesh_mask.position.y = 0;
        mesh_mask.renderOrder = 1; // Render mask on top of video
        scene.add(mesh_mask);
    })
})

// Function to create a legend
function createLegend(colors) {
    // Create a div element for the legend
    const legendDiv = document.createElement('div');
    legendDiv.setAttribute("id", "legend")
    // Create a legend item for each color
    colors.forEach((color, i) => {
        const legendItem = document.createElement('div');
        legendItem.style.display = 'flex'; // Arrange color box and text
        legendItem.style.alignItems = 'center'; // Center align items
        legendItem.style.padding = '2px'; // Optional padding
        const colorBox = document.createElement('div');
        colorBox.style.width = '20px'; // Width of color box
        colorBox.style.height = '20px'; // Height of color box
        colorBox.style.backgroundColor = (i === 0) ? "transparent" : ("#" + color.getHexString()); // Set background color
        colorBox.style.marginRight = '10px'; // Space between box and text

        const colorText = document.createElement('span');
        colorText.textContent = mask_class_names[i]; // Display the RGB color value

        // Append color box and text to the legend item
        legendItem.appendChild(colorBox);
        legendItem.appendChild(colorText);

        // Append legend item to the legend div
        legendDiv.appendChild(legendItem);
    });

    // Append the legend div to the body (or any other container)
    document.querySelector('main').appendChild(legendDiv);
}


// let colors = 
// mask_colors.forEach((color, i) => {
//     const div = document.createElement("div");
//     div.textContent = mask_class_names[i]
//     div.style.backgroundColor = "#" + color.getHexString();
//     document.body.appendChild(div);
// });



const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', onWindowResize);
renderer.domElement.style.cssText = "display:flex; position: absolute; top: 0; left: 0;"
document.querySelector('main').appendChild(renderer.domElement);
const stats = new Stats();
stats.dom.style.cssText = "position: absolute; top: 0px; right: 0px; cursor: pointer; opacity: 0.9; z-index: 10000;";
document.querySelector('main').appendChild(stats.dom);


createLegend(mask_colors);


const camera_proj = new THREE.PerspectiveCamera(46.4, 1920 / 1080, 0.1, 25);
camera_proj.position.z = 1.5;
camera_proj.position.y = 0;
camera_proj.position.x = 0;
camera_proj.rotation.x = PI / 2 - 0 / 180 * PI;

const helper = new THREE.CameraHelper(camera_proj)
scene.add(helper)

const quad = new THREE.PlaneGeometry(50, 50);


const socketUrlH264 = '/rt/camera/h264/';

let texture_camera;
let material_proj;
if (STREAM) {
    h264Stream(socketUrlH264, 1920, 1080, 30, () => { }).then((tex) => {
        texture_camera = tex;
        material_proj = new ProjectedMaterial({
            camera: camera_proj, // the camera that acts as a projector
            texture: texture_camera, // the texture being projected
            color: '#000', // the color of the object if it's not projected on
            transparent: true,
        })
        const mesh_cam = new THREE.Mesh(quad, material_proj);
        mesh_cam.needsUpdate = true;
        mesh_cam.position.z = 0;
        mesh_cam.position.y = 0;
        mesh_cam.renderOrder = 0; // Render video first
        scene.add(mesh_cam);
    })

} else {
    // Use canvas texture when streaming. Copy the streaming code from maivin-ui.
    // the Jmuxer starts lagging really hard when you tab out
    const video = document.createElement("video")
    video.src = 'validate.mp4';
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.needsUpdate = true;
    // await video.play()
    texture_camera = new THREE.VideoTexture(video);
    texture_camera.needsUpdate = true;
    const mesh_cam = new THREE.Mesh(quad, material_proj);
    mesh_cam.needsUpdate = true;
    mesh_cam.position.z = 0;
    mesh_cam.position.y = 0;
    mesh_cam.renderOrder = 0; // Render video first
    scene.add(mesh_cam);
}


const socketUrlImu = '/rt/imu'
let imuData;
let oldImuData = {};
ImuStream(socketUrlImu).then(data => { imuData = data })

const loader = new STLLoader();
loader.load('/models/maivin2.stl', function (geometry) {
    const hemiLight = new THREE.HemisphereLight(0x8d7c7c, 0x494966, 9);
    scene.add(hemiLight);
    const material = new THREE.MeshPhongMaterial({ color: 0xFFAA00 });
    const cameraModel = new THREE.Mesh(geometry, material);
    cameraModel.scale.set(0.015, 0.015, 0.015); // Adjust the scale as needed
    cameraModel.rotation.x = PI / 2;
    cameraModel.rotation.y = PI;
    cameraModel.position.x = 0;
    cameraModel.position.z = 1;
    scene.add(cameraModel);
}, undefined, function (error) {
    console.error('An error happened', error);
});

const MAX_CYLINDER_COUNT = 100
const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
const instancedMeshHelper = new THREE.Object3D();
const cylinder = new THREE.InstancedMesh(geometry, material, MAX_CYLINDER_COUNT);
scene.add(cylinder);
cylinder.count = 0
instancedMeshHelper.rotation.x = PI / 2;
instancedMeshHelper.position.z = 1;

const gridHelper = new THREE.GridHelper(50, 50);
gridHelper.rotation.x = PI / 2;
gridHelper.position.z = 0.002;
scene.add(gridHelper);

camera.position.z = 7.5;
camera.position.y = -11;
camera.rotation.x = PI / 4 + PI / 8;


const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.update();


renderer.setAnimationLoop(animate);
const oldWeight = 0.0;
const newWeight = 1.0;

const positions = []
function animate() {
    if (imuData) {
        const euler = quaternionToEuler(
            (oldWeight * oldImuData.orientation_x + newWeight * imuData.orientation_x),
            (oldWeight * oldImuData.orientation_y + newWeight * imuData.orientation_y),
            (oldWeight * oldImuData.orientation_z + newWeight * imuData.orientation_z),
            (oldWeight * oldImuData.orientation_w + newWeight * imuData.orientation_w))
        camera_proj.rotation.x = PI / 2 - 17 / 180 * PI - euler.pitch / 180 * PI;
        camera_proj.rotation.z = -euler.roll / 180 * PI;
        oldImuData.orientation_x = imuData.orientation_x;
        oldImuData.orientation_y = imuData.orientation_y;
        oldImuData.orientation_z = imuData.orientation_z;
        oldImuData.orientation_w = imuData.orientation_w;
    }
    if (material_proj) {
        material_proj.update(camera_proj)
    }
    if (material_mask) {
        material_mask.update(camera_proj)
    }
    // positions[0][1] += 0.01
    // console.log(positions[0][1])
    cylinder.count = Math.min(positions.length, MAX_CYLINDER_COUNT)
    positions.forEach((pos, i) => {
        if (i >= MAX_CYLINDER_COUNT) {
            return
        }
        instancedMeshHelper.position.x = pos[0]
        instancedMeshHelper.position.y = pos[1]
        instancedMeshHelper.updateMatrix();
        cylinder.setMatrixAt(i, instancedMeshHelper.matrix)
        cylinder.instanceMatrix.needsUpdate = true
        cylinder.computeBoundingSphere()
    })

    camera_proj.needsUpdate = true
    // cube.rotation.x += 0.01;
    // cube.rotation.y += 0.01;
    // camera.position.y += 0.01
    // gridHelper.rotation.x += 0.01;

    if (texture_camera) {
        texture_camera.needsUpdate = true;
    }
    renderer.render(scene, camera);
    stats.update();

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function parseIntsInObject(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = parseIntsInObject(obj[key]);
        } else if (typeof obj[key] === 'string' && /^-?\d+$/.test(obj[key])) {
            obj[key] = parseInt(obj[key], 10);
        }
    }
    return obj;
}
