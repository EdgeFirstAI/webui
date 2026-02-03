// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { PolarGridFan } from "./polarGridFan.js";
import * as THREE from './three.js'
import { clearThree, color_points_class, color_points_field, mask_colors } from "./utils.js";
import SpriteText from './three-spritetext.js';
const PI = Math.PI

const occupied = []
const rendered_points = []

const bins = []
let window_index = 0
let radar_points
let grid_scene
let grid_renderer
let grid_camera
let ANGLE_BIN_WIDTH = 10
let ANGLE_BIN_LIMITS = [-65, 65]
let RANGE_BIN_WIDTH = 0.5
let RANGE_BIN_LIMITS = [0, 20]
let WINDOW_LENGTH = 5
let BIN_THRESHOLD = 3
let GRID_DRAW_PCD = "disabled"
let DRAW_UNKNOWN_CELLS = false
let DRAW_CELLS = "disabled"
let SHOW_PEOPLE_COUNT = false
let GRID_FLATTEN_PCD = true

let textContext = null
let count = 0
function create_text() {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:0;right:0;opacity:0.9;z-index:10000';
    document.body.appendChild(container)
    const PR = Math.round(window.devicePixelRatio || 1);
    let canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    canvas.style.cssText = 'width:200;height:50px';

    textContext = canvas.getContext('2d');
    textContext.font = 'bold '+ (20 * PR) + 'px Helvetica,Arial,sans-serif';
    textContext.textBaseline = 'top';
    textContext.fillText(`${count}`, 20, 20);
    container.appendChild(canvas)
    setInterval(draw_text, 1000);
}

function draw_text() {
    textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height);
    textContext.fillText(`People: ${count}`, 20, 20);
}

function update_text(c) {
    count = c
}

export function init_grid(grid_scene_, grid_renderer_, grid_camera_, config) {


    init_config(config)

    grid_scene = grid_scene_
    grid_renderer = grid_renderer_
    grid_camera = grid_camera_
    alloc_bins()
    const gridHelper = new PolarGridFan(RANGE_BIN_LIMITS[0], RANGE_BIN_LIMITS[1],
        -ANGLE_BIN_LIMITS[0] * Math.PI / 180, -ANGLE_BIN_LIMITS[1] * Math.PI / 180,
        Math.ceil((ANGLE_BIN_LIMITS[1] - ANGLE_BIN_LIMITS[0]) / ANGLE_BIN_WIDTH),
        Math.ceil((RANGE_BIN_LIMITS[1] - RANGE_BIN_LIMITS[0]) / RANGE_BIN_WIDTH),
        64,
        0x000,
        0x000);
    gridHelper.position.z = 0.002;
    grid_scene.add(gridHelper);
    let decimals = 1
    if (Number.isInteger(RANGE_BIN_LIMITS[0]) && Number.isInteger(RANGE_BIN_WIDTH * 2)) {
        decimals = 0
    }
    for (let i = RANGE_BIN_LIMITS[0]; i <= RANGE_BIN_LIMITS[1]; i += RANGE_BIN_WIDTH * 2) {
        const myText = new SpriteText(i.toFixed(decimals) + "m", 0.03, "0x888888")
        myText.material.sizeAttenuation = false
        myText.position.x = Math.sin((-ANGLE_BIN_LIMITS[0] + 1) / 180 * PI) * i + Math.sin((-ANGLE_BIN_LIMITS[0] + 91) / 180 * PI) * 0.16
        myText.position.z = Math.cos((-ANGLE_BIN_LIMITS[0] + 1) / 180 * PI) * i + Math.cos((-ANGLE_BIN_LIMITS[0] + 91) / 180 * PI) * 0.16
        grid_scene.add(myText)
    }
    for (let i = RANGE_BIN_LIMITS[0]; i <= RANGE_BIN_LIMITS[1]; i += RANGE_BIN_WIDTH * 2) {
        const myText = new SpriteText(i.toFixed(decimals) + "m", 0.03, "0x888888")
        myText.material.sizeAttenuation = false
        myText.position.x = Math.sin((-ANGLE_BIN_LIMITS[1] - 1) / 180 * PI) * i + Math.sin((-ANGLE_BIN_LIMITS[1] - 91) / 180 * PI) * 0.16
        myText.position.z = Math.cos((-ANGLE_BIN_LIMITS[1] - 1) / 180 * PI) * i + Math.cos((-ANGLE_BIN_LIMITS[1] - 91) / 180 * PI) * 0.16
        grid_scene.add(myText)
    }

    for (let i = ANGLE_BIN_LIMITS[0]; i <= ANGLE_BIN_LIMITS[1]; i += ANGLE_BIN_WIDTH * 2) {
        let pad = i < 0 ? "" : " "
        const myText = new SpriteText(pad + i.toFixed(0) + "°", 0.03, "0x888888")
        myText.material.sizeAttenuation = false
        myText.position.x = Math.sin(-i / 180 * PI) * (RANGE_BIN_LIMITS[1] + 0.2)
        myText.position.y = 0.2
        myText.position.z = Math.cos(-i / 180 * PI) * (RANGE_BIN_LIMITS[1] + 0.2)
        grid_scene.add(myText)
    }
    if (SHOW_PEOPLE_COUNT) {
        create_text()
    }

    grid_renderer.setAnimationLoop(animate_grid);
}


export function grid_set_radarpoints(radar_points_) {
    radar_points = radar_points_
}

function init_config(config) {
    if (config.ANGLE_BIN_WIDTH) { ANGLE_BIN_WIDTH = config.ANGLE_BIN_WIDTH }
    if (config.ANGLE_BIN_LIMITS_MIN) {
        ANGLE_BIN_LIMITS[0] = config.ANGLE_BIN_LIMITS_MIN
    }
    if (config.ANGLE_BIN_LIMITS_MAX) {
        ANGLE_BIN_LIMITS[1] = config.ANGLE_BIN_LIMITS_MAX
    }
    if (config.RANGE_BIN_WIDTH) { RANGE_BIN_WIDTH = config.RANGE_BIN_WIDTH }
    if (config.RANGE_BIN_LIMITS_MIN) {
        RANGE_BIN_LIMITS[0] = config.RANGE_BIN_LIMITS_MIN
    }
    if (config.RANGE_BIN_LIMITS_MAX) {
        RANGE_BIN_LIMITS[1] = config.RANGE_BIN_LIMITS_MAX
    }
    if (config.WINDOW_LENGTH) {
        WINDOW_LENGTH = config.WINDOW_LENGTH
    }
    if (config.BIN_THRESHOLD) {
        BIN_THRESHOLD = config.BIN_THRESHOLD
    }
    if (config.GRID_DRAW_PCD) {
        GRID_DRAW_PCD = config.GRID_DRAW_PCD
    }

    if (config.DRAW_CELLS) {
        DRAW_CELLS = config.DRAW_CELLS
    }  

    if (typeof config.DRAW_UNKNOWN_CELLS == "boolean") {
        DRAW_UNKNOWN_CELLS = config.DRAW_UNKNOWN_CELLS
    }

    if (typeof config.SHOW_PEOPLE_COUNT == "boolean") {
        SHOW_PEOPLE_COUNT = config.SHOW_PEOPLE_COUNT
    }
    
    if (typeof config.GRID_FLATTEN_PCD == "boolean") {
        GRID_FLATTEN_PCD = config.GRID_FLATTEN_PCD
    }

    if (!DRAW_CELLS || DRAW_CELLS == "disabled") {
        DRAW_UNKNOWN_CELLS = false
    }
}

function newRingGeo(angle, range, class_) {
    const geometry = new THREE.RingGeometry(range, range + RANGE_BIN_WIDTH, 4, 1, angle / 180 * PI + PI / 2, ANGLE_BIN_WIDTH / 180 * PI);
    const color = mask_colors[class_]
    const material = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = PI / 2
    // mesh.rotation.z = PI / 2
    return mesh
}


function alloc_bins() {
    bins.length = 0
    const RANGE_BIN_COUNT = RANGE_BIN_LIMITS[1] / RANGE_BIN_WIDTH - RANGE_BIN_LIMITS[0] / RANGE_BIN_WIDTH + 1
    for (let i = ANGLE_BIN_LIMITS[0]; i <= ANGLE_BIN_LIMITS[1]; i += ANGLE_BIN_WIDTH) {
        let n = Array(RANGE_BIN_COUNT)
        for (let j = 0; j < RANGE_BIN_COUNT; j++) {
            n[j] = Array(WINDOW_LENGTH).fill([])
        }
        bins.push(n)
    }
}


function clear_bins() {
    window_index = (window_index + 1) % WINDOW_LENGTH
    for (let b of bins) {
        for (let w of b) {
            w[window_index] = []
        }
    }
}

function get_bin(angle, range) {
    if (angle < ANGLE_BIN_LIMITS[0]) {
        return null
    }
    if (angle > ANGLE_BIN_LIMITS[1]) {
        return null
    }
    if (range < RANGE_BIN_LIMITS[0]) {
        return null
    }
    if (range > RANGE_BIN_LIMITS[1]) {
        return null
    }
    const i = Math.floor((angle - ANGLE_BIN_LIMITS[0]) / ANGLE_BIN_WIDTH)
    const j = Math.floor((range - RANGE_BIN_LIMITS[0]) / RANGE_BIN_WIDTH)
    return bins[i][j][window_index]

}

function increment_bin(angle, range, value) {
    let bin = get_bin(angle, range)
    if (bin !== null) {
        bin.push(value)
    }
}

function getValsInBin(angle, range, angleBinOffset, rangeBinOffset) {
    let angleBin = Math.floor((angle - ANGLE_BIN_LIMITS[0]) / ANGLE_BIN_WIDTH) + angleBinOffset
    let rangeBin = Math.floor((range - RANGE_BIN_LIMITS[0]) / RANGE_BIN_WIDTH) + rangeBinOffset
    angleBin = (angleBin + bins.length) % bins.length
    if (rangeBin < 0) {
        // rangeBin = 0
        return []
    }
    if (rangeBin >= bins[angleBin].length) {
        // rangeBin = bins[angleBin].length - 1
        return []
    }
    return bins[angleBin][rangeBin].reduce((a, b) => a.concat(b), [])
}

function getCountInBin(angle, range, angleBinOffset, rangeBinOffset) {
    return getValsInBin(angle, range, angleBinOffset, rangeBinOffset).length
}

function getClassInList(l) {
    const classes = {}
    l.forEach((point) => {
        if (isFinite(classes[point[DRAW_CELLS]])) {
            classes[point[DRAW_CELLS]] += 1
        } else {
            classes[point[DRAW_CELLS]] = 1
        }
    })
    if (classes[0] == l.length) {
        return [0, classes[0]]
    }
    classes[0] = 0

    let max_class = 0
    let max_class_val = -1
    for (let cl in classes) {
        if (max_class_val < classes[cl]) {
            max_class = cl
            max_class_val = classes[cl]
        }
    }
    console.log([max_class, max_class_val])
    return [max_class, max_class_val]
}



function animate_grid() {
    let count = 0
    if (typeof radar_points == "undefined" || bins.length == 0) {
        update_text(count)
        return
    }
    clear_bins()
    rendered_points.forEach((cell) => {
        clearThree(cell)
    })
    rendered_points.length = 0
    let points = radar_points.points
    if (GRID_DRAW_PCD != "disabled" && radar_points.points.length > 0) {
        if (GRID_DRAW_PCD.endsWith("class")) {
            color_points_class(points, GRID_DRAW_PCD, grid_scene, rendered_points, !GRID_FLATTEN_PCD)
        } else {
            color_points_field(points, GRID_DRAW_PCD, grid_scene, rendered_points, !GRID_FLATTEN_PCD)
        }
    }

    for (let p of points) {
        if (DRAW_CELLS != "disabled" && (DRAW_UNKNOWN_CELLS || p[DRAW_CELLS] > 0)) {
            increment_bin(-p.angle * 180 / PI, p.range, p)
        }
        if (p[DRAW_CELLS] > 0) {
            count+=1
        }
    }
    occupied.forEach((cell) => {
        clearThree(cell)
        grid_scene.remove(cell)
    })
    occupied.length = 0
    let foundOccupied = new Array(bins.length).fill(false)
    checkBins([0], foundOccupied, [1])
    checkBins([-1, 0, 1], foundOccupied, [1])
    checkBins([0], foundOccupied, null)
    checkBins([-1, 0, 1], foundOccupied, null)
    grid_renderer.render(grid_scene, grid_camera);
    update_text(count)
}

function checkBins(angleBinDeltas, foundOccupied, classes) {
    for (let range = RANGE_BIN_LIMITS[0]; range <= RANGE_BIN_LIMITS[1]; range += RANGE_BIN_WIDTH) {
        for (let angle = ANGLE_BIN_LIMITS[0] + ANGLE_BIN_WIDTH; angle <= ANGLE_BIN_LIMITS[1] - ANGLE_BIN_WIDTH; angle += ANGLE_BIN_WIDTH) {
            checkBin(range, angle, angleBinDeltas, foundOccupied, classes)
        }
    }
}

function checkBin(range, angle, angleBinDeltas, foundOccupied, classes) {
    let currInd = (angle - ANGLE_BIN_LIMITS[0]) / ANGLE_BIN_WIDTH

    if (foundOccupied[currInd]) {
        return;
    }
    let val = [[], [], []]
    for (let delta of angleBinDeltas) {
        let angleBin = (angle - ANGLE_BIN_LIMITS[0]) / ANGLE_BIN_WIDTH + delta
        if (foundOccupied[angleBin]) {
            return
        }
        if (0 <= angleBin && angleBin < foundOccupied.length) {
            val = val.map((v, ind) => v.concat(getValsInBin(angle, range, delta, -ind)))
        }
    }

    let sum = val.map((v) => v.length)

    let acc = 0
    let cumsum = sum.map(n => acc += n)

    acc = []
    let cumconcat = val.map(n => acc = acc.concat(n))

    for (let k = 0; k < val.length; k++) {
        if (cumsum[k] >= BIN_THRESHOLD) {
            const class_ = getClassInList(cumconcat[k])[0]
            if (classes && !inArray(classes, class_)) {
                continue
            }
            const cell = newRingGeo(angle, range - RANGE_BIN_WIDTH * k, class_)
            occupied.push(cell)
            grid_scene.add(cell)
            setOccupied(currInd, angleBinDeltas, foundOccupied)
            return
        }
    }
}

function inArray(array, elem) {
    const length = array.length;
    for (let i = 0; i < length; i++) {
        if (array[i] == elem)
            return true;
    }
    return false;
}

function setOccupied(currInd, deltas, foundOccupied) {
    for (let delta of deltas) {
        if (0 <= currInd + delta && currInd + delta < foundOccupied.length) {
            foundOccupied[currInd + delta] = true
        }
    }
}
