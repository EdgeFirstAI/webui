// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'
import { dynamicSortMultiple } from './sort.js'

function mode(a) {
    return Object.values(
        a.reduce((count, e) => {
            if (!(e in count)) {
                count[e] = [0, e];
            }

            count[e][0]++;
            return count;
        }, {})
    ).reduce((a, v) => v[0] < a[0] ? a : v, [0, null])[1]
}


const PI = Math.PI

let OCCLUSION_LIMIT_DEGREES = 10
THREE.Cache.enabled = true;

export default function classify_points(points, mask_tex) {
    // this is reformatted to be Nx240x320x4
    const mask = mask_tex.source.data.data


    let mask_height = mask_tex.source.data.height;
    let mask_width = mask_tex.source.data.width;
    let mask_classes = mask.length / mask_height / mask_width;

    const cam_mtx = new THREE.Matrix3().set(
        1260 / 1920 * mask_width, 0, 960 / 1920 * mask_width,
        0, 1260 / 1080 * mask_height, 540 / 1080 * mask_height,
        0, 0, 1
    )

    const points_cpy = []
    const n_layer_stride = mask_height * mask_width * 4;
    const n_row_stride = mask_width * 4;
    const n_col_stride = 4;
    let index = 0
    for (let p of points) {
        // project points to camera space
        // x, y, dist
        const pos = new THREE.Vector3(p.y, p.z, p.x)
        const point_cpy = structuredClone(p)

        pos.applyMatrix3(cam_mtx)
        pos.x /= pos.z
        pos.y /= pos.z
        pos.z /= pos.z

        let i = mask_height - Math.round(pos.y)
        let j = mask_width - Math.round(pos.x)

        point_cpy.x_2d = j
        point_cpy.y_2d = i
        point_cpy.class = 0
        let classes = []
        for (let l = 0; l < 360; l += 45) {
            if (i < 0 || i >= mask_height) {
                break
            }
            if (j < 0 || j >= mask_width) {
                break
            }
            const x = Math.round(i + Math.sin(l / 180 * PI) * 6)
            const y = Math.round(j + Math.cos(l / 180 * PI) * 6)
            if (x < 0 || x >= mask_height) {
                continue
            }
            if (y < 0 || y >= mask_width) {
                continue
            }
            const scores = []
            for (let k = 0; k < mask_classes; k++) {
                scores.push(mask[n_layer_stride * Math.floor(k / 4) + (mask_height - x) * n_row_stride + y * n_col_stride + k % 4])
            }

            let max = -Infinity;
            let maxInd = 0;
            for (let k = 0; k < mask_classes; k++) {
                if (scores[k] > max) {
                    maxInd = k;
                    max = scores[k]
                }
            }
            point_cpy.class = maxInd
            if (maxInd > 0) {
                classes.push(maxInd)
            }
        }

        if (classes.length >= 2) {
            point_cpy.class = mode(classes)
        } else {
            point_cpy.class = 0
        }
        point_cpy.x_vel = 0

        point_cpy.index = index++
        points_cpy.push(point_cpy)
    }
    points_cpy.sort(dynamicSortMultiple("range"))

    for (let i = 0; i < points_cpy.length; i++) {
        if (points_cpy[i].class == 0) {
            continue
        }
        for (let j = 0; j < i; j++) {
            if (points_cpy[j].class == 0) {
                continue
            }
            if (Math.abs(points_cpy[i].angle - points_cpy[j].angle) <= OCCLUSION_LIMIT_DEGREES / 180 * PI && points_cpy[i].range - points_cpy[j].range > 1.0) {
                points_cpy[i].class = 0
                break
            }
        }
    }
    return points_cpy
}

const labels = { "background": 0 }
let label_count = 1
export function classify_points_box(points, boxes) {

    const cam_mtx = new THREE.Matrix3().set(
        1260 / 1920, 0, 960 / 1920,
        0, 1260 / 1080, 540 / 1080,
        0, 0, 1
    )

    const points_cpy = []
    let index = 0
    for (let p of points) {
        // project points to camera space
        // x, y, dist
        const pos = new THREE.Vector3(p.y, p.z, p.x)
        const point_cpy = {}
        point_cpy.x = p.x
        point_cpy.y = p.y
        point_cpy.z = p.z

        pos.applyMatrix3(cam_mtx)
        pos.x /= pos.z
        pos.y /= pos.z
        pos.z /= pos.z


        let i = pos.y
        let j = 1 - pos.x

        point_cpy.x_2d = j
        point_cpy.y_2d = i
        point_cpy.class = 0
        let classes = []
        let x_vel = []
        for (let l = 0; l < boxes.length; l++) {
            if (i < 0 || i >= 1) {
                break
            }
            if (j < 0 || j >= 1) {
                break
            }
            if (j < boxes[l].center_x - boxes[l].width / 2) {
                continue
            }
            if (j > boxes[l].center_x + boxes[l].width / 2) {
                continue
            }
            if (i < boxes[l].center_y - boxes[l].height / 2) {
                continue
            }
            if (i > boxes[l].center_y + boxes[l].height / 2) {
                continue
            }
            if (!labels[boxes.label]) {
                labels[boxes.label] = label_count
                label_count++
            }
            classes.push(labels[boxes.label])
            if (boxes[l].width > 0) { x_vel.push(boxes[l].speed / boxes[l].width) } else { x_vel.push(boxes[l].speed) }

        }
        if (classes.length >= 1) {
            point_cpy.class = mode(classes)
            point_cpy.x_vel = mode(x_vel)
        } else {
            point_cpy.class = 0
            point_cpy.x_vel = 0
        }


        point_cpy.index = index++
        points_cpy.push(point_cpy)
    }
    points_cpy.sort(dynamicSortMultiple("range"))

    for (let i = 0; i < points_cpy.length; i++) {
        if (points_cpy[i].class == 0) {
            continue
        }
        for (let j = 0; j < i; j++) {
            if (points_cpy[j].class == 0) {
                continue
            }
            if (Math.abs(points_cpy[i].angle - points_cpy[j].angle) <= OCCLUSION_LIMIT_DEGREES / 180 * PI && points_cpy[i].range - points_cpy[j].range > 1.0) {
                points_cpy[i].class = 0
                break
            }
        }
    }
    return points_cpy
}

export function project_points_onto_box(points, boxes) {

    const cam_mtx = new THREE.Matrix3().set(
        1260 / 1920, 0, 960 / 1920,
        0, 1260 / 1080, 540 / 1080,
        0, 0, 1
    )

    const points_cpy = []
    for (let p of points) {
        // project points to camera space
        // x, y, dist
        const pos = new THREE.Vector3(p.y, p.z, p.x)
        const point_cpy = {
            x: p.x,
            y: p.y,
            z: p.z,
            range: p.range,
            angle: p.angle,
            speed: p.speed,
            class: p.class
        }

        pos.applyMatrix3(cam_mtx)
        pos.x /= pos.z
        pos.y /= pos.z
        pos.z /= pos.z

        let i = 1 - pos.y
        let j = 1 - pos.x

        point_cpy.i = i;
        point_cpy.j = j;

        points_cpy.push(point_cpy)
    }

    points_cpy.sort(dynamicSortMultiple("range"))

    let extra_points = []
    for (let p of points_cpy)  {
        if (!p.class) {
            continue
        }
        let i = p.i;
        let j = p.j;

        let point_marked = false
        for (let box of boxes) {
            if (!point_in_box(j, i, box)) {
                continue
            }
            point_marked = true
            if (box.text) {
                continue
            }
            box.text = `${p.range.toFixed(1).padStart(5, " ")}m\n${p.speed.toFixed(1).padStart(5, " ")}m/s`
           
        }

        if (point_marked) {
           continue
        } 
        extra_points.push(p)
    }
    for (let p of extra_points) {
        let box = {}
        box.center_x = p.j
        box.center_y = p.i
        box.width = Math.atan(0.7 / p.x) / 1.43117 // maybe get this from projection
        box.height = Math.atan(1.7 / p.x) / 1.43117 // maybe get this from projection
        box.label = 1.0
        box.score = 0.7
        box.distance = p.range
        box.speed = p.speed
        box.track = "NA"
        box.text = `${p.range.toFixed(1).padStart(5, " ")}m\n${p.speed.toFixed(1).padStart(5, " ")}m/s`
        boxes.push(box)
    }
}

function point_in_box(x,y, box) {
    if (x < box.center_x - box.width / 2 - 0.1) { // pad 0.1 left of the box
        return false
    }
    if (x > box.center_x + box.width / 2 + 0.1) { // pad 0.1 right of the box
        return false
    }
    if (y < box.center_y - box.height / 2 - 0.1) {
        return false
    }
    if (y > box.center_y + box.height / 2 + 0.1) {
        return false
    }
    return true
}
