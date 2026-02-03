// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js'

// Based on https://tympanus.net/codrops/2020/01/07/playing-with-texture-projection-in-three-js/
export default class ProjectedMaterial extends THREE.ShaderMaterial {
    constructor({ camera, texture, color = 0xffffff, flip = false, ...options } = {}) {
        if (!texture || !texture.isTexture) {
            throw new Error('Invalid texture passed to the ProjectedMaterial')
        }

        if (!camera || !camera.isCamera) {
            throw new Error('Invalid camera passed to the ProjectedMaterial')
        }

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
            uniforms: {
                color: { value: new THREE.Color(color) },
                tex: { value: texture },
                viewMatrixCamera: { type: 'm4', value: viewMatrixCamera },
                projectionMatrixCamera: { type: 'm4', value: projectionMatrixCamera },
                modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
                projPosition: { type: 'v3', value: projPosition },
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
                uniform vec3 color;
                uniform sampler2D tex;
                uniform vec3 projPosition;

                in vec3 vNormal;
                in vec4 vWorldPosition;
                in vec4 vTexCoords;
                
                out vec4 pc_fragColor;
                void main() {
                    float w = max(vTexCoords.w, 0.0);
                    vec2 uv = (vTexCoords.xy / w) * 0.5 + 0.5;
                    ${flip_shader}            
                    vec4 outColor = texture(tex, uv);
                    if (!(0.0 <= uv.x && uv.x <= 1.0 && 0.0 <= uv.y && uv.y <= 1.0)) {
                        outColor.a = 0.0;
                    }
                    // this makes sure we don't render the texture also on the back of the object
                    // vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
                    // float dotProduct = dot(vNormal, projectorDirection);
                    // if (dotProduct < 0.0) {
                    //    outColor = vec4(color, 1.0);
                    // }
                    pc_fragColor = outColor;
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
