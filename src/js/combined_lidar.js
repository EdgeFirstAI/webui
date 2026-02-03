// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import ProjectedMaterial from './ProjectedMaterial.js'
import ProjectedMask from './ProjectedMask.js'
import segstream, { get_shape } from './mask.js'
import h264Stream from './stream.js'
import pcdStream, { preprocessPoints } from './pcd.js'
import { project_points_onto_box } from './classify.js'
import boxesstream from './boxes.js'
import Stats, { fpsUpdate } from "./Stats.js"
import droppedframes from './droppedframes.js'
import { parseNumbersInObject } from './parseNumbersInObject.js';
import { OrbitControls } from './OrbitControls.js'
import { mask_colors } from './utils.js'
import { grid_set_radarpoints, init_grid } from './grid_render.js'
import { PCDLoader } from './PCDLoader.js'
import boxes3dstream from './boxes3d.js'

const PI = Math.PI

const stats = new Stats();
const cameraPanel = stats.addPanel(new Stats.Panel('cameraFPS', '#fff', '#222'));
const radarPanel = stats.addPanel(new Stats.Panel('radarFPS', '#ff4', '#220'));
const modelPanel = stats.addPanel(new Stats.Panel('modelFPS', '#f4f', '#210'));
const lidarPanel = stats.addPanel(new Stats.Panel('lidarFPS', '#4ff', '#022'));
stats.showPanel([])

const playerCanvas = document.getElementById("player");
const width = window.innerWidth;
const height = window.innerHeight;

playerCanvas.width = width / 2;  // Half width for camera view
playerCanvas.height = height * 0.7;  // 70% height for top section

const renderer = new THREE.WebGLRenderer({
    canvas: playerCanvas,
    antialias: true,
    alpha: true
});
renderer.setSize(width / 2, height * 0.7);
renderer.domElement.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    pointer-events: auto;
`;

const boxCanvas = document.getElementById("boxes")
boxCanvas.width = width / 2;
boxCanvas.height = height * 0.7;
boxCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    pointer-events: none;
`;

// Create a renderer for the LiDAR view
const lidarView = document.getElementById("lidar-view");
const lidarCanvas = document.createElement("canvas");
lidarCanvas.id = "lidar-canvas";
lidarView.appendChild(lidarCanvas);
lidarCanvas.width = width / 2;
lidarCanvas.height = height * 0.7;

const lidarRenderer = new THREE.WebGLRenderer({
    canvas: lidarCanvas,
    antialias: true,
    alpha: true
});
lidarRenderer.setSize(width / 2, height * 0.7);
lidarRenderer.domElement.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    pointer-events: auto;
`;

// Create a renderer for the Radar view
const radarView = document.getElementById("radar-view");
const radarCanvas = document.createElement("canvas");
radarCanvas.id = "radar-canvas";
radarView.appendChild(radarCanvas);
radarCanvas.width = width;
radarCanvas.height = height * 0.3;

const radarRenderer = new THREE.WebGLRenderer({
    canvas: radarCanvas,
    antialias: true,
    alpha: true
});
radarRenderer.setSize(width, height * 0.3);
radarRenderer.domElement.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    pointer-events: auto;
`;

// Camera for main view
const camera = new THREE.PerspectiveCamera(46.4, (width / 2) / (height * 0.7), 0.1, 1000);
camera.position.set(0, 5, 0);
camera.lookAt(0, 0, 0);

// Camera for LiDAR view
const lidarCamera = new THREE.PerspectiveCamera(46.4, (width / 2) / (height * 0.7), 0.1, 1000);
lidarCamera.position.set(0, 5, 10);
lidarCamera.lookAt(0, 0, 0);

// Camera for Radar view
const radarCamera = new THREE.PerspectiveCamera(60, width / (height * 0.3), 0.1, 1000);
radarCamera.position.set(0, 10, 0);
radarCamera.lookAt(0, 0, 0);

// Main scene (for camera view)
const scene = new THREE.Scene();
scene.background = null;

// LiDAR scene
const lidarScene = new THREE.Scene();
lidarScene.background = new THREE.Color(0x111111);

// Radar scene
const radarScene = new THREE.Scene();
radarScene.background = new THREE.Color(0x111111);

// Create separate controls for each view
const cameraControls = new OrbitControls(camera, renderer.domElement);
cameraControls.enableDamping = true;
cameraControls.dampingFactor = 0.05;
cameraControls.screenSpacePanning = true;
cameraControls.minDistance = 0;
cameraControls.maxDistance = 100;
cameraControls.maxPolarAngle = Math.PI;
cameraControls.target.set(0, 0, 0);

const lidarControls = new OrbitControls(lidarCamera, lidarRenderer.domElement);
lidarControls.enableDamping = true;
lidarControls.dampingFactor = 0.05;
lidarControls.screenSpacePanning = true;
lidarControls.minDistance = 0;
lidarControls.maxDistance = 100;
lidarControls.maxPolarAngle = Math.PI;
lidarControls.target.set(0, 0, 0);

const radarControls = new OrbitControls(radarCamera, radarRenderer.domElement);
radarControls.enableDamping = true;
radarControls.dampingFactor = 0.05;
radarControls.screenSpacePanning = true;
radarControls.minDistance = 0;
radarControls.maxDistance = 100;
radarControls.maxPolarAngle = Math.PI;
radarControls.target.set(0, 0, 0);

// Create a fixed camera group that won't be affected by controls
const fixedCameraGroup = new THREE.Group();
scene.add(fixedCameraGroup);
fixedCameraGroup.position.set(0, 0, -12); // Set initial position for camera stream

let texture_camera, material_proj, material_mask, mask_tex;
let detect_boxes, radar_points;
let lidar_points = null;
let lidarBoxes = null;
let lidarGroup = new THREE.Group();
let radarGroup = new THREE.Group(); // Create radar group
lidarScene.add(lidarGroup); // Add LiDAR group to LiDAR scene
radarScene.add(radarGroup); // Add radar group to radar scene

let CAMERA_DRAW_PCD = "disabled"
let CAMERA_PCD_LABEL = "disabled"
let DRAW_BOX = false
let DRAW_BOX_TEXT = true

let socketUrlH264 = '/rt/camera/h264/'
let socketUrlPcd = '/rt/radar/targets/'
let socketUrlLidar = '/rt/lidar/points/'
let socketUrlDetect = '/rt/detect/boxes2d/'
let socketUrlMask = '/rt/detect/mask/'
let socketUrlErrors = '/ws/dropped'
let socketUrlLidarBoxes = '/rt/fusion/boxes3d/'
let socketUrlTfstatic = '/rt/tf_static/'
let RANGE_BIN_LIMITS = [0, 20]
let mirror = false
let show_stats = false

const quad = new THREE.PlaneGeometry(16, 9);
quad.scale(6, 6, 1);

const pcdLoader = new PCDLoader();

// Add group for 3D boxes - moved from below to organize code better
let lidarBoxesGroup = new THREE.Group();
let radarBoxesGroup = new THREE.Group(); // Add new group for radar boxes
lidarScene.add(lidarBoxesGroup); // Add to lidar scene
radarScene.add(radarBoxesGroup); // Add to radar scene

// Add transform storage
let transforms = {
    lidar: {
        position: new THREE.Vector3(0, 0, -0.19),
        rotation: new THREE.Quaternion(0, 0, -0.9998157, 0.0191974)
    },
    radar: {
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1)
    }
};

// Add TF static WebSocket connection
let tfStaticSocket = new WebSocket(socketUrlTfstatic);
tfStaticSocket.onmessage = function (event) {
    // If event.data is a Blob, read it as text first
    if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = function () {
            try {
                const data = JSON.parse(reader.result);
                handleTfStaticData(data);
            } catch (error) {
                console.error('Error parsing TF static message:', error);
            }
        };
        reader.readAsText(event.data);
    } else {
        try {
            const data = JSON.parse(event.data);
            handleTfStaticData(data);
        } catch (error) {
            console.error('Error parsing TF static message:', error);
        }
    }
};

function handleTfStaticData(data) {
    if (data.frame_id === "base_link") {
        const transform = {
            position: new THREE.Vector3(data.x, data.y, data.z),
            rotation: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw)
        };
        if (data.child_frame_id === "lidar") {
            transforms.lidar = transform;
        } else if (data.child_frame_id === "radar") {
            transforms.radar = transform;
        }
        updateBoxPositions();
    }
}

tfStaticSocket.onerror = function (error) {
    console.error('TF static WebSocket error:', error);
};

tfStaticSocket.onclose = function () {
    console.log('TF static WebSocket connection closed');
    setTimeout(() => {
        tfStaticSocket = new WebSocket(socketUrlTfstatic);
        tfStaticSocket.onmessage = this.onmessage;
        tfStaticSocket.onerror = this.onerror;
        tfStaticSocket.onclose = this.onclose;
    }, 3000);
};

// Add frame tracking for boxes
let currentBoxFrame = "lidar"; // Default to lidar frame

// Replace the boxes3dstream section with updated frame handling
boxes3dstream(socketUrlLidarBoxes, (boxMsg) => {
    if (boxMsg && boxMsg.boxes) {

        if (boxMsg.header.frame_id) {
            currentBoxFrame = boxMsg.header.frame_id;

        }
        updateLidarBoxes(boxMsg.boxes);
    } else {
        console.log('No boxes found in message:', boxMsg);
    }
}).then((boxes3d) => {
    lidarBoxes = boxes3d;
}).catch(error => {
    console.error('Error in boxes3dstream:', error);
});

function updateBoxPositions() {
    // Get the appropriate transform based on the box frame
    const boxTransform = currentBoxFrame === "lidar" ? transforms.lidar : transforms.radar;

    // Update LiDAR boxes
    if (currentBoxFrame === "lidar") {
        // If boxes are in lidar frame, apply lidar transform
        lidarBoxesGroup.position.copy(transforms.lidar.position);
        lidarBoxesGroup.quaternion.copy(transforms.lidar.rotation);
        lidarBoxesGroup.scale.set(-1, 1, -1);

        // For radar view, need to transform from lidar to radar frame
        const lidarToRadar = new THREE.Matrix4();
        lidarToRadar.makeRotationFromQuaternion(transforms.lidar.rotation);
        lidarToRadar.setPosition(transforms.lidar.position);

        const radarInverse = new THREE.Matrix4();
        radarInverse.makeRotationFromQuaternion(transforms.radar.rotation);
        radarInverse.setPosition(transforms.radar.position);
        radarInverse.invert();

        const finalTransform = new THREE.Matrix4();
        finalTransform.multiplyMatrices(radarInverse, lidarToRadar);

        radarBoxesGroup.matrix.copy(finalTransform);
        radarBoxesGroup.matrix.decompose(radarBoxesGroup.position, radarBoxesGroup.quaternion, radarBoxesGroup.scale);
        radarBoxesGroup.scale.set(-1, 1, -1);
    } else {
        // If boxes are in radar frame, apply radar transform
        radarBoxesGroup.position.copy(transforms.radar.position);
        radarBoxesGroup.quaternion.copy(transforms.radar.rotation);
        radarBoxesGroup.scale.set(-1, 1, 1);

        // For lidar view, need to transform from radar to lidar frame
        const radarToLidar = new THREE.Matrix4();
        radarToLidar.makeRotationFromQuaternion(transforms.radar.rotation);
        radarToLidar.setPosition(transforms.radar.position);

        const lidarInverse = new THREE.Matrix4();
        lidarInverse.makeRotationFromQuaternion(transforms.lidar.rotation);
        lidarInverse.setPosition(transforms.lidar.position);
        lidarInverse.invert();

        const finalTransform = new THREE.Matrix4();
        finalTransform.multiplyMatrices(lidarInverse, radarToLidar);

        lidarBoxesGroup.matrix.copy(finalTransform);
        lidarBoxesGroup.matrix.decompose(lidarBoxesGroup.position, lidarBoxesGroup.quaternion, lidarBoxesGroup.scale);
        lidarBoxesGroup.scale.set(1, 1, 1);
    }
}

function makeCircularTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

function updateLidarScene(arrayBuffer) {
    try {
        lidarGroup.clear(); // Remove previous LiDAR

        const points = pcdLoader.parse(arrayBuffer);
        if (points && points.children && points.children.length > 0) {
            lidar_points = points;
            points.children.forEach(child => {
                if (child instanceof THREE.Points) {
                    const positions = child.geometry.attributes.position.array;
                    const colors = child.geometry.attributes.color.array;
                    const validIndices = [];

                    for (let i = 0; i < positions.length; i += 3) {
                        const x = positions[i];
                        const y = positions[i + 1];
                        const z = positions[i + 2];

                        // Skip points that are too close to any axis
                        const threshold = 0.01; // Adjust this value to control how close points can be to axes
                        if (!(Math.abs(x) < threshold || Math.abs(y) < threshold || Math.abs(z) < threshold)) {
                            validIndices.push(i, i + 1, i + 2);
                        }
                    }

                    // Create new arrays with only valid points
                    const newPositions = new Float32Array(validIndices.length);
                    const newColors = new Float32Array(validIndices.length);

                    for (let i = 0; i < validIndices.length; i++) {
                        newPositions[i] = positions[validIndices[i]];
                        newColors[i] = colors[validIndices[i]];
                    }

                    // Update geometry with filtered points
                    child.geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
                    child.geometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));

                    const circularTexture = makeCircularTexture();
                    child.material.map = circularTexture;
                    child.material.alphaTest = 0.5;
                    child.material.transparent = true;
                    child.material.size = 0.1;
                    child.material.sizeAttenuation = true;
                    child.material.needsUpdate = true;
                }
            });
            points.position.set(0, 0, 0);
            points.rotation.set(0, Math.PI / 2, 0);
            points.scale.set(1, 1, 1);
            lidarGroup.add(points);
        } else {
            console.warn('No valid points found in LiDAR data');
        }
    } catch (error) {
        console.error('Error updating LiDAR scene:', error);
    }
}

let lidarSocket = new WebSocket(socketUrlLidar);
lidarSocket.binaryType = 'arraybuffer';

lidarSocket.onmessage = function (event) {
    updateLidarScene(event.data);
    fpsUpdate(lidarPanel)();
};

lidarSocket.onerror = function (error) {
    console.error('LiDAR WebSocket error:', error);
};

lidarSocket.onclose = function () {
    console.log('LiDAR WebSocket connection closed');
    setTimeout(() => {
        lidarSocket = new WebSocket(socketUrlLidar);
        lidarSocket.binaryType = 'arraybuffer';
        lidarSocket.onmessage = this.onmessage;
        lidarSocket.onerror = this.onerror;
        lidarSocket.onclose = this.onclose;
    }, 3000);
};

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
        if (drawBoxSettings.mirror) {
            x = 1.0 - x
        }
        if (drawBoxSettings.drawBox) {
            ctx.beginPath();
            let y = box.center_y;
            ctx.rect((x - box.width / 2) * canvas.width, (y - box.height / 2) * canvas.height, box.width * canvas.width, box.height * canvas.height);
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
            let y = box.center_y;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], (x - box.width / 2) * canvas.width, (y - box.height / 2) * canvas.height + (lines.length - 1 - i * lineheight));
                ctx.strokeText(lines[i], (x - box.width / 2) * canvas.width, (y - box.height / 2) * canvas.height + (lines.length - 1 - i * lineheight));
            }
        }
    }
}

const loader = new THREE.FileLoader();
loader.load(
    '/config/webui/details',
    function (data) {
        const config = parseNumbersInObject(JSON.parse(data));
        init_config(config);


        if (config.LIDAR_TOPIC && config.LIDAR_TOPIC !== socketUrlLidar) {
            socketUrlLidar = config.LIDAR_TOPIC;
            if (lidarSocket) lidarSocket.close();
            lidarSocket = new WebSocket(socketUrlLidar);
            lidarSocket.binaryType = 'arraybuffer';
            lidarSocket.onmessage = (event) => {
                updateLidarScene(event.data);
                fpsUpdate(lidarPanel)();
            };
            lidarSocket.onerror = (error) => {
                console.error('LiDAR WebSocket error:', error);
            };
            lidarSocket.onclose = function () {
                console.log('LiDAR WebSocket closed');
                setTimeout(() => {
                    lidarSocket = new WebSocket(socketUrlLidar);
                    lidarSocket.binaryType = 'arraybuffer';
                    lidarSocket.onmessage = this.onmessage;
                    lidarSocket.onerror = this.onerror;
                    lidarSocket.onclose = this.onclose;
                }, 3000);
            };
        }

        if (show_stats) stats.showPanel([3]);

        init_grid(radarScene, radarRenderer, radarCamera, config);

        h264Stream(socketUrlH264, 1920, 1080, 30, () => {
            fpsUpdate(cameraPanel)();
        }).then((texture) => {
            texture_camera = texture;
            material_proj = new ProjectedMaterial({
                camera: camera,
                texture: texture_camera,
                transparent: true,
                flip: mirror,
                opacity: 0.8
            });
            const mesh = new THREE.Mesh(quad, material_proj);
            mesh.position.set(0, 0, 0);
            mesh.needsUpdate = true;
            mesh.renderOrder = 0; // Render video first
            fixedCameraGroup.add(mesh);
        });

        get_shape(socketUrlMask, (height, width, length, mask) => {
            const classes = Math.round(mask.length / height / width)
            segstream(socketUrlMask, height, width, classes, () => {
                fpsUpdate(modelPanel)();
            }).then((texture_mask) => {
                material_mask = new ProjectedMask({
                    camera: camera,
                    texture: texture_mask,
                    transparent: true,
                    flip: mirror,
                    colors: mask_colors,
                    opacity: 0.5
                })
                const mesh_mask = new THREE.Mesh(quad, material_mask);
                mesh_mask.needsUpdate = true;
                mesh_mask.renderOrder = 1; // Render mask on top of video
                mask_tex = texture_mask;
                fixedCameraGroup.add(mesh_mask);
            })
        });

        let boxes;
        let drawBoxSettings = {
            drawBox: DRAW_BOX,
            drawBoxText: DRAW_BOX_TEXT,
            mirror: mirror,
        }
        boxesstream(socketUrlDetect, null, () => {
            if (boxes && radar_points) {
                drawBoxesSpeedDistance(boxCanvas, boxes.msg.boxes, radar_points.points, drawBoxSettings)
            }
        }).then((b) => {
            boxes = b
        });

        let radarFpsFn = fpsUpdate(radarPanel);
        pcdStream(socketUrlPcd, () => {
            radarFpsFn();
            radar_points.points = preprocessPoints(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1], mirror, radar_points.points);

            // Update radar visualization
            if (radar_points.points.length > 0) {
                // Clear our custom radar visualization
                while (radarGroup.children.length > 0) {
                    radarGroup.remove(radarGroup.children[0]);
                }

                grid_set_radarpoints(radar_points);

                if (CAMERA_DRAW_PCD != "disabled") {
                    for (let i = fixedCameraGroup.children.length - 1; i >= 0; i--) {
                        const child = fixedCameraGroup.children[i];
                        if (child.userData && child.userData.isRadarPoints) {
                            fixedCameraGroup.remove(child);
                        }
                    }
                }
            }
        }).then((pcd) => {
            radar_points = pcd;
        });
    },
    function () { },
    function (err) {
        console.error('An error happened', err);
    }
);

// Add function to create and update 3D boxes
function createBox(box) {

    // Create box geometry - height is the vertical dimension, width and depth are the same
    const geometry = new THREE.BoxGeometry(box.width, box.height, box.width);

    // Create semi-transparent material with wireframe
    const material = new THREE.MeshBasicMaterial({
        color: 0x00FF00,  // Green color
        opacity: 0.7,     // Increased opacity
        transparent: true,
        wireframe: true
    });

    // Create thicker wireframe effect using multiple overlapping boxes
    const lidarMeshes = [];
    const radarMeshes = [];

    // Create multiple boxes with slightly different sizes for thickness effect
    const thicknessLevels = 3;
    for (let i = 0; i < thicknessLevels; i++) {
        const scale = 1 + (i * 0.02); // Slightly larger each time
        const scaledGeometry = new THREE.BoxGeometry(
            box.width * scale,
            box.height * scale,
            box.width * scale
        );

        const lidarMesh = new THREE.Mesh(scaledGeometry, material.clone());
        const radarMesh = new THREE.Mesh(scaledGeometry, material.clone());

        lidarMeshes.push(lidarMesh);
        radarMeshes.push(radarMesh);
    }

    // Position boxes according to the current frame
    const x = -box.center_x;
    const y = box.center_y * 1.1;
    const z = box.distance;

    // Position all meshes
    lidarMeshes.forEach(mesh => mesh.position.set(x, y, z));
    radarMeshes.forEach(mesh => mesh.position.set(x, y, z));

    // Create text labels
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    // Add black background to text
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#ffffff';
    context.font = '24px Arial';
    context.fillText(`${box.label} ${box.distance.toFixed(1)}m`, 0, 24);

    const texture = new THREE.CanvasTexture(canvas);

    // Create two sprites - one for each view
    const lidarSpriteMaterial = new THREE.SpriteMaterial({ map: texture.clone(), transparent: true });
    const radarSpriteMaterial = new THREE.SpriteMaterial({ map: texture.clone(), transparent: true });

    const lidarSprite = new THREE.Sprite(lidarSpriteMaterial);
    const radarSprite = new THREE.Sprite(radarSpriteMaterial);

    lidarSprite.position.set(x, y + box.height / 2 + 0.2, z);
    radarSprite.position.set(x, y + box.height / 2 + 0.2, z);

    lidarSprite.scale.set(1, 0.25, 1);
    radarSprite.scale.set(1, 0.25, 1);

    // Create groups to hold both box and label for each view
    const lidarGroup = new THREE.Group();
    const radarGroup = new THREE.Group();

    // Add all meshes to groups
    lidarMeshes.forEach(mesh => lidarGroup.add(mesh));
    radarMeshes.forEach(mesh => radarGroup.add(mesh));

    lidarGroup.add(lidarSprite);
    radarGroup.add(radarSprite);

    return { lidarGroup, radarGroup };
}

function updateLidarBoxes(boxes) {
    // Clear existing boxes from both views
    while (lidarBoxesGroup.children.length > 0) {
        lidarBoxesGroup.remove(lidarBoxesGroup.children[0]);
    }
    while (radarBoxesGroup.children.length > 0) {
        radarBoxesGroup.remove(radarBoxesGroup.children[0]);
    }

    // Add new boxes to both views
    boxes.forEach(box => {
        const { lidarGroup, radarGroup } = createBox(box);
        lidarBoxesGroup.add(lidarGroup);
        radarBoxesGroup.add(radarGroup);
    });

    // Update positions based on current transforms
    updateBoxPositions();
}

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

    if (config.LIDAR_BOXES_TOPIC) {
        socketUrlLidarBoxes = config.LIDAR_BOXES_TOPIC;
        // The boxes3dstream will handle reconnection automatically
        boxes3dstream(socketUrlLidarBoxes, (boxMsg) => {
            if (boxMsg && boxMsg.boxes) {
                updateLidarBoxes(boxMsg.boxes);
            } else {
                console.log('Config: No boxes found in message:', boxMsg);
            }
        }).then((boxes3d) => {
            lidarBoxes = boxes3d;
        }).catch(error => {
            console.error('Config: Error in boxes3dstream:', error);
        });
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

    if (typeof config.MIRROR == "boolean") {
        mirror = config.MIRROR
    }

    if (typeof config.SHOW_STATS == "boolean") {
        show_stats = config.SHOW_STATS
    }

}

function animate() {
    requestAnimationFrame(animate);

    // Update controls for all views
    cameraControls.update();
    lidarControls.update();
    radarControls.update();

    // Update fixed camera group to stay in view (camera view)
    const cameraDirection = new THREE.Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);
    cameraDirection.multiplyScalar(12);
    fixedCameraGroup.position.copy(camera.position).add(cameraDirection);
    fixedCameraGroup.quaternion.copy(camera.quaternion);

    if (material_proj) {
        material_proj.update(camera);
    }
    if (material_mask) {
        material_mask.update(camera);
    }

    // Render all three views
    renderer.render(scene, camera);
    lidarRenderer.render(lidarScene, lidarCamera);
    radarRenderer.render(radarScene, radarCamera);
}

// Handle window resize
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Account for header height
    const contentHeight = height - 64; // 64px is header height

    // Update camera aspect ratios
    camera.aspect = (width / 2) / (contentHeight * 0.7);
    camera.updateProjectionMatrix();

    lidarCamera.aspect = (width / 2) / (contentHeight * 0.7);
    lidarCamera.updateProjectionMatrix();

    radarCamera.aspect = width / (contentHeight * 0.3);
    radarCamera.updateProjectionMatrix();

    // Update renderer sizes
    renderer.setSize(width / 2, contentHeight * 0.7);
    lidarRenderer.setSize(width / 2, contentHeight * 0.7);
    radarRenderer.setSize(width, contentHeight * 0.3);

    // Update canvas sizes
    playerCanvas.width = width / 2;
    playerCanvas.height = contentHeight * 0.7;

    boxCanvas.width = width / 2;
    boxCanvas.height = contentHeight * 0.7;

    lidarCanvas.width = width / 2;
    lidarCanvas.height = contentHeight * 0.7;

    radarCanvas.width = width;
    radarCanvas.height = contentHeight * 0.3;

    // Update for mobile view
    if (width <= 768) {
        // For small screens, stack the top views
        camera.aspect = width / (contentHeight * 0.4); // Half of 80%
        lidarCamera.aspect = width / (contentHeight * 0.4); // Half of 80%

        camera.updateProjectionMatrix();
        lidarCamera.updateProjectionMatrix();

        renderer.setSize(width, contentHeight * 0.4);
        lidarRenderer.setSize(width, contentHeight * 0.4);

        playerCanvas.width = width;
        playerCanvas.height = contentHeight * 0.4;

        boxCanvas.width = width;
        boxCanvas.height = contentHeight * 0.4;

        lidarCanvas.width = width;
        lidarCanvas.height = contentHeight * 0.4;
    }
});

// Initial resize to set everything up correctly
window.dispatchEvent(new Event('resize'));

animate();
