// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { dynamicSort } from "./sort.js";
import SpriteText from './three-spritetext.js';
import * as THREE from './three.js'
export function clearThree(obj) {
    while (obj.children.length > 0) {
        clearThree(obj.children[0]);
    }
    if (obj.geometry) obj.geometry.dispose();

    if (obj.material) {
        //in case of map, bumpMap, normalMap, envMap ...
        Object.keys(obj.material).forEach(prop => {
            if (!obj.material[prop])
                return;
            if (obj.material[prop] !== null && typeof obj.material[prop].dispose === 'function')
                obj.material[prop].dispose();
        })
        obj.material.dispose();
    }
    if (obj.parent) {
        obj.parent.remove(obj);
    }
    obj.removeFromParent()
}


export function color_points_field(points, field, scene, rendered_points, height = false, label = "disabled") {
    points.sort(dynamicSort(field))
    let min_val = points[0][field]
    let max_val = points[points.length - 1][field]
    let avg_val = points[Math.floor(points.length / 2)][field]

    let maxDelta = Math.max(avg_val - min_val, max_val - min_val)
    min_val = avg_val - maxDelta
    max_val = avg_val + maxDelta
    points.forEach((point) => {
        const geometry = new THREE.SphereGeometry(0.1)
        let color = new THREE.Color(0xFFFFFF)
        if (max_val - min_val > 0) {
            if (point[field] < avg_val) {
                let l = (point[field] - avg_val) / (min_val - avg_val)
                l = (2 - l) / 2 * 100
                color = new THREE.Color("hsl(240, 100%, " + l + "%)")
            } else if (point[field] > avg_val) {
                let l = (point[field] - avg_val) / (max_val - avg_val)
                l = (2 - l) / 2 * 100
                color = new THREE.Color("hsl(0, 100%, " + l + "%)")
            }
        }
        const material = new THREE.MeshBasicMaterial({ color });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.x = point.y
        sphere.position.z = point.x
        if (height) {
            sphere.position.y = point.z
        }
        rendered_points.push(sphere)
        scene.add(sphere)

        if (label != "disabled") {
            const myText = new SpriteText(point[label].toFixed(2), 0.025, "0x888888")
            myText.material.sizeAttenuation = false
            const factor = 1 - 0.12 / Math.sqrt(point.y * point.y + point.x * point.x)
            myText.position.x = point.y * factor
            myText.position.z = point.x * factor
            if (height) {
                myText.position.y = point.z
            }
            myText.position.y += 0.12
            scene.add(myText)
            rendered_points.push(myText)
        }
    })
}

export function color_points_class(points, field, scene, rendered_points, height = false, label = "disabled") {
    combined_classes(points)
    points.forEach((point) => {
        let point_rad = 0.075
        let color = new THREE.Color(0xFFFFFF)
        const cls = point[field]
        if (cls >= 0 && cls < mask_colors.length) {
            color = mask_colors[cls]
            point_rad = 0.15
        }

        const geometry = new THREE.SphereGeometry(point_rad)
        const material = new THREE.MeshBasicMaterial({ color });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.x = point.y
        sphere.position.z = point.x
        if (height) {
            sphere.position.y = point.z
        }
        rendered_points.push(sphere)
        scene.add(sphere)

        if (label != "disabled") {
            const myText = new SpriteText(point[label], 0.025, "0x888888")
            myText.material.sizeAttenuation = false
            const factor = 1 - 0.12 / Math.sqrt(point.y * point.y + point.x * point.x)
            myText.position.x = point.y * factor
            myText.position.z = point.x * factor
            if (height) {
                myText.position.y = point.z
            }
            myText.position.y += 0.12
            scene.add(myText)
            rendered_points.push(myText)
        }
    })
}


// Adds a "combined_class" property into each point inside points
// The "combined_class" is the highest class among all properties that
// end with "class"
function combined_classes(points) {
    for (let p of points) {
        let combined_class = 0
        for (const prop in p) {
            if (!prop.endsWith("class")) {
                continue
            }
            combined_class = Math.max(combined_class, p[prop])
        }
        p["combined_class"] = combined_class
    }
}

export const mask_colors = [
    new THREE.Color(0.0, 0.0, 0.0),
    new THREE.Color(0., 1., 0.),
    new THREE.Color(0.50980392, 0.50980392, 0.72941176),
    new THREE.Color(0.00784314, 0.18823529, 0.29411765),
    new THREE.Color(0.8, 0.76470588, 0.78039216),
    new THREE.Color(0.31372549, 0.31372549, 0.31372549),
    new THREE.Color(0.14117647, 0.30980392, 0.12156863),
    new THREE.Color(1., 0.95686275, 0.51372549),
    new THREE.Color(0.35294118, 0.32156863, 0.),
    new THREE.Color(0.42352941, 0.62352941, 0.65098039),
    new THREE.Color(1., 0.55686275, 0.),
    new THREE.Color(0.0, 0.2706, 1.0),
    new THREE.Color(0.0, 0.0, 0.0),
    new THREE.Color(0.0, 0.5, 0.0),
    new THREE.Color(0.1333, 0.5451, 0.1333),
    new THREE.Color(0.1176, 0.4118, 0.8235),
    new THREE.Color(1.0, 1.0, 1.0),
]
