// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'

// Based on https://tympanus.net/codrops/2020/01/07/playing-with-texture-projection-in-three-js/
export default class ProjectedMask extends THREE.ShaderMaterial {
    constructor({ camera, texture, colors, alphas, default_alpha = 0.7, flip = false, ...options } = {}) {
        if (!texture || !texture.isTexture) {
            throw new Error('Invalid texture passed to the ProjectedMask')
        }

        if (!camera || !camera.isCamera) {
            throw new Error('Invalid camera passed to the ProjectedMask')
        }

        if (!colors || colors.length == 0) {
            colors = [
                new THREE.Color(0.0, 0.0, 0.0),
                new THREE.Color(0.25882353, 0.15294118, 0.13333333),
                new THREE.Color(0., 1., 0.),
                new THREE.Color(0.8, 0.76470588, 0.78039216),
                new THREE.Color(0.31372549, 0.31372549, 0.31372549),
                new THREE.Color(0.14117647, 0.30980392, 0.12156863),
                new THREE.Color(1., 0.95686275, 0.51372549),
                new THREE.Color(0.35294118, 0.32156863, 0.),
                new THREE.Color(0.42352941, 0.62352941, 0.65098039),
                new THREE.Color(0.50980392, 0.50980392, 0.72941176),
                new THREE.Color(1., 0.55686275, 0.),
                new THREE.Color(0.00784314, 0.18823529, 0.29411765),
                new THREE.Color(0.0, 0.2706, 1.0),
                new THREE.Color(0.0, 0.0, 0.0),
                new THREE.Color(0.0, 0.5, 0.0),
                new THREE.Color(0.1333, 0.5451, 0.1333),
                new THREE.Color(0.1176, 0.4118, 0.8235),
                new THREE.Color(1., 1., 1.),
            ]
        }

        if (!alphas || alphas.length != colors.length) {
            alphas = Array(colors.length).fill(default_alpha);
        }

        // zip colors and alphas together
        const color_v4 = colors.map(function (e, i) {
            return [e.r, e.g, e.b, alphas[i]];
        }).flat();

        
        // make sure the camera matrices are updated
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        camera.updateWorldMatrix()

        // get the matrices from the camera so they're fixed in camera's original position
        const viewMatrixCamera = camera.matrixWorldInverse.clone()
        const projectionMatrixCamera = camera.projectionMatrix.clone()
        const modelMatrixCamera = camera.matrixWorld.clone()

        const projPosition = camera.position.clone()

        const flip_shader = flip ? `uv.x = 1.0 - uv.x;` : ``
        super({
            ...options,
            depthWrite: false,
            uniforms: {
                tex: { type: 'sampler2DArray', value: texture },
                viewMatrixCamera: { type: 'm4', value: viewMatrixCamera },
                projectionMatrixCamera: { type: 'm4', value: projectionMatrixCamera },
                modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
                projPosition: { type: 'v3', value: projPosition },
                colors: { value: color_v4 },
            },

            vertexShader: `
                uniform mat4 viewMatrixCamera;
                uniform mat4 projectionMatrixCamera;
                uniform mat4 modelMatrixCamera;

                out vec4 vWorldPosition;
                out vec3 vNormal;
                out vec4 vTexCoords;


                void main() {
                    vNormal = mat3(modelMatrix) * normal;
                    vWorldPosition = modelMatrix * vec4(position, 1.0);
                    vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,

            fragmentShader: `
                precision highp sampler2DArray;

                uniform sampler2DArray tex;
                uniform vec3 projPosition;
                uniform vec4 colors[${colors.length}];

                in vec3 vNormal;
                in vec4 vWorldPosition;
                in vec4 vTexCoords;
                
                out vec4 pc_fragColor;



                float max_arg(const in vec4 args, out int argmax) {
                    if (args[0] >= args[1] && args[0] >= args[2] && args[0] >= args[3]) {
                        argmax = 0;
                        return args[0];
                    }
                    if (args[1] >= args[0] && args[1] >= args[2] && args[1] >= args[3]) {
                        argmax = 1;
                        return args[1];
                    }
                    if (args[2] >= args[0] && args[2] >= args[1] && args[2] >= args[3]) {
                        argmax = 2;
                        return args[2];
                    }
                    argmax = 3;
                    return args[3];
                }

                void main() {
                    float w = max(vTexCoords.w, 0.0);
                    vec2 uv = (vTexCoords.xy / w) * 0.5 + 0.5;
                    ${flip_shader}
                    if (!(0.0 <= uv.x && uv.x <= 1.0 && 0.0 <= uv.y && uv.y <= 1.0)) {
                        pc_fragColor = vec4(0.0,0.0,0.0,0.0);
                        return;
                    }
                    mediump int layers = textureSize(tex, 0).z;
                    float max_all = -4.0;
                    int max_ind = 0;
                    for (int i = 0; i < layers; i++) {
                        vec4 d = texture(tex, vec3(uv, i));
                        int max_ind_ = 0;
                        float max_ = max_arg(d, max_ind_);
                        if (max_ <= max_all) { continue; }
                        max_all = max_;
                        max_ind = i*4 + max_ind_;
                    }
                    max_ind = clamp(max_ind, 0, ${colors.length-1});

                    // Mask data is sigmoid probabilities quantized to uint8
                    // (0 = background, 255 = foreground). Discard below 0.5
                    // sigmoid and fade to full opacity by 0.65 for anti-aliased
                    // mask edges without background bleed.
                    float edge = smoothstep(0.5, 0.65, max_all);
                    if (edge <= 0.0) {
                        pc_fragColor = vec4(0.0, 0.0, 0.0, 0.0);
                        return;
                    }

                    pc_fragColor = colors[max_ind];
                    pc_fragColor.a *= edge;
                }`,
            glslVersion: THREE.GLSL3,
        })

        this.isProjectedMaterial = true
    }

    update(camera) {
        if (!camera || !camera.isCamera) {
            throw new Error('Invalid camera passed to the ProjectedMaterial')
        }

        // make sure the camera matrices are updated
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
        camera.updateWorldMatrix()

        this.uniforms.viewMatrixCamera.value = camera.matrixWorldInverse.clone()
        this.uniforms.projectionMatrixCamera.value = camera.projectionMatrix.clone()
        this.uniforms.modelMatrixCamera.value = camera.matrixWorld.clone()
        this.uniforms.projPosition.value = camera.position.clone()
    }
}
