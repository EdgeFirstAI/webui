// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js';
import h264Stream from './stream.js';
import TileAssembler from './TileAssembler.js';

class SmartVideoManager {
    constructor() {
        this.tileUrls = [
            '/api/rt/camera/h264/tl?compress=false',
            '/api/rt/camera/h264/tr?compress=false',
            '/api/rt/camera/h264/bl?compress=false',
            '/api/rt/camera/h264/br?compress=false'
        ];
        this.fallbackUrl = '/api/rt/camera/h264?compress=false';

        this.mode = null; // 'tiles' or 'fallback'
        this.currentTexture = null;
        this.tileCanvases = {};
        this.mergedCanvas = null;
        this.mergedContext = null;

        this.tileProbeTimeout = 5000; // 5 seconds to detect tiles

        this.assembler = null;
        this.minMergeIntervalMs = 67; // 15fps max
        this.lastMergeMs = 0;

        // Optional callback for consumers that control display timing (SyncedVideo).
        // When set, drawGroup() produces an ImageBitmap instead of updating
        // the texture directly, letting the consumer control display timing.
        // Called as onMergedFrame(stampMs, bitmap); the consumer owns the bitmap.
        this.onMergedFrame = null;
    }

    async init(onFrameUpdate, h264StreamFunc = null, fallbackH264StreamFunc = null) {
        this.h264StreamFunc = h264StreamFunc || h264Stream;
        this.fallbackH264StreamFunc = fallbackH264StreamFunc || this.h264StreamFunc;
        this.onFrameUpdate = onFrameUpdate;

        // Start the single stream immediately — no waiting
        const fallbackTexture = await this.initFallbackMode(onFrameUpdate);

        // Race tile probes in the background — upgrade if tiles respond
        this.probeTilesInBackground(onFrameUpdate);

        return fallbackTexture;
    }

    /**
     * Probe tile endpoints in the background. If enough tiles respond with
     * data within the timeout, upgrade from fallback to tile mode.
     */
    probeTilesInBackground(onFrameUpdate) {
        let dataReceivedCount = 0;
        const connections = [];
        const dataReceivedFrom = new Set();
        let resolved = false;

        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            connections.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN ||
                    ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                }
            });
        };

        const timeout = setTimeout(() => {
            // Timed out — stay on fallback (already running)
            cleanup();
        }, this.tileProbeTimeout);

        this.tileUrls.forEach((url) => {
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';
            connections.push(ws);

            ws.onmessage = (event) => {
                if (resolved) return;
                if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
                    if (!dataReceivedFrom.has(url)) {
                        dataReceivedFrom.add(url);
                        dataReceivedCount++;

                        if (dataReceivedCount >= 2) {
                            clearTimeout(timeout);
                            cleanup();
                            console.log('SmartVideoManager: Tiles detected — upgrading to 4K tile mode');
                            this.upgradeToTileMode(onFrameUpdate);
                        }
                    }
                }
            };

            ws.onerror = () => {};
            ws.onclose = () => {};
        });
    }

    /**
     * Upgrade from fallback to tile mode. Disposes the fallback texture
     * and switches this.currentTexture to the merged tile canvas.
     */
    async upgradeToTileMode(onFrameUpdate) {
        try {
            // Save fallback reference before initTileMode overwrites this.currentTexture
            const fallbackTexture = this.currentTexture;

            const tileTexture = await this.initTileMode(onFrameUpdate);

            // Stop the fallback stream
            if (fallbackTexture && fallbackTexture._stopReconnect) {
                fallbackTexture._stopReconnect();
            }

            this.mode = 'tiles';
            if (this.onUpgrade) {
                this.onUpgrade(tileTexture);
            }
        } catch (error) {
            console.error('SmartVideoManager: Tile upgrade failed, staying on fallback:', error);
        }
    }

    async initTileMode(onFrameUpdate) {
        this.mode = 'tiles';
        if (!this.h264StreamFunc) {
            throw new Error('h264StreamFunc is not available');
        }

        // Create 4K merged canvas
        this.mergedCanvas = document.createElement('canvas');
        this.mergedCanvas.width = 3840;
        this.mergedCanvas.height = 2160;
        this.mergedContext = this.mergedCanvas.getContext('2d', {
            alpha: false,
            willReadFrequently: false
        });

        // Create merged texture
        const mergedTexture = new THREE.CanvasTexture(this.mergedCanvas);
        mergedTexture.generateMipmaps = false;
        mergedTexture.minFilter = THREE.LinearFilter;
        mergedTexture.magFilter = THREE.LinearFilter;

        // Initialize tile streams
        const tilePromises = this.tileUrls.map(async (url, index) => {
            const tileName = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'][index];
            const position = [
                { x: 0, y: 0 },
                { x: 1920, y: 0 },
                { x: 0, y: 1080 },
                { x: 1920, y: 1080 }
            ][index];

            try {
                const texture = await this.h264StreamFunc(url, 1920, 1080, 30, (timing) => {
                    this.onTileFrame(tileName, timing);
                    if (onFrameUpdate) {
                        const info = { ...timing, tileName, mode: 'tiles' };
                        delete info.bitmap;
                        onFrameUpdate(info);
                    }
                }, true);

                this.tileCanvases[tileName] = {
                    texture,
                    canvas: texture.image,
                    position
                };

                return texture;
            } catch (error) {
                console.error(`SmartVideoManager: Failed to initialize tile ${tileName}:`, error);
                return null;
            }
        });

        const results = await Promise.allSettled(tilePromises);
        const successfulTiles = results.filter(
            result => result.status === 'fulfilled' && result.value !== null
        ).length;

        if (successfulTiles === 0) {
            throw new Error('No tiles could be initialized successfully');
        }

        this.assembler = new TileAssembler({ tiles: Object.keys(this.tileCanvases) });

        this.currentTexture = mergedTexture;
        return mergedTexture;
    }

    async initFallbackMode(onFrameUpdate) {
        this.mode = 'fallback';

        try {
            this.currentTexture = await this.fallbackH264StreamFunc(
                this.fallbackUrl,
                1920, 1080, 30,
                (timing) => {
                    if (onFrameUpdate) {
                        onFrameUpdate({ ...timing, mode: 'fallback' });
                    }
                }
            );

            return this.currentTexture;
        } catch (error) {
            console.error('Failed to initialize fallback stream:', error);
            throw error;
        }
    }

    onTileFrame(tileName, timing) {
        if (!timing.bitmap || !this.assembler) {
            if (timing.bitmap) timing.bitmap.close();
            return;
        }
        const group = this.assembler.add(tileName, timing.stampMs, timing.bitmap);
        if (!group) return;
        const now = performance.now();
        if (now - this.lastMergeMs < this.minMergeIntervalMs) {
            for (const b of Object.values(group.bitmaps)) b.close();
            return;
        }
        this.lastMergeMs = now;
        this.drawGroup(group);
    }

    drawGroup(group) {
        if (!this.mergedContext || this.mode !== 'tiles') {
            for (const b of Object.values(group.bitmaps)) b.close();
            return;
        }
        for (const [name, bitmap] of Object.entries(group.bitmaps)) {
            const { x, y } = this.tileCanvases[name].position;
            this.mergedContext.drawImage(bitmap, x, y, 1920, 1080);
            bitmap.close();
        }
        if (this.onMergedFrame) {
            createImageBitmap(this.mergedCanvas).then((bitmap) => {
                if (this.onMergedFrame) this.onMergedFrame(group.stampMs, bitmap);
                else bitmap.close();
            }).catch((err) => console.warn('SmartVideoManager: Failed to create merged ImageBitmap:', err));
        } else if (this.currentTexture) {
            this.currentTexture.needsUpdate = true;
        }
    }

    getTexture() {
        return this.currentTexture;
    }

    getMode() {
        return this.mode;
    }

    dispose() {
        if (this.currentTexture) {
            this.currentTexture.dispose();
        }

        Object.values(this.tileCanvases).forEach(tile => {
            if (tile.texture) {
                tile.texture.dispose();
            }
        });

        this.tileCanvases = {};
        this.currentTexture = null;
        if (this.assembler) this.assembler.reset();
        this.assembler = null;
        this.onMergedFrame = null;
    }
}

export default SmartVideoManager;
