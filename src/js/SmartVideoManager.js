// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js';
import h264Stream from './stream.js';

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

        // Aggressive frame synchronization system (15fps, requires ALL tiles)
        this.syncEnabled = true;
        this.frameReadyMap = new Map();
        this.lastUpdateTime = 0;
        this.updateThrottle = 67; // 15fps max
        this.maxWaitForSync = 500;
        this.pendingUpdate = false;
        this.requiredTiles = 4;

        // Fallback stream handle for cleanup if we upgrade to tiles
        this.fallbackSocket = null;
    }

    async init(onFrameUpdate, h264StreamFunc = null) {
        this.h264StreamFunc = h264StreamFunc || h264Stream;
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
            const tileTexture = await this.initTileMode(onFrameUpdate);

            // Swap the texture — callers hold a reference to this.currentTexture
            // but the THREE.js material references the texture object directly,
            // so we need the caller to handle the swap. We signal via a property.
            this.upgradedTexture = tileTexture;
            this.mode = 'tiles';
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
                        onFrameUpdate({ ...timing, tileName, mode: 'tiles' });
                    }
                });

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

        this.frameReadyMap.clear();
        this.updateMergedCanvas();

        this.currentTexture = mergedTexture;
        return mergedTexture;
    }

    async initFallbackMode(onFrameUpdate) {
        this.mode = 'fallback';

        try {
            this.currentTexture = await this.h264StreamFunc(
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
        const now = performance.now();

        if (!this.syncEnabled) {
            this.updateMergedCanvas();
            return;
        }

        this.frameReadyMap.set(tileName, now);
        this.tryUpdateWithSync();
    }

    tryUpdateWithSync() {
        if (this.pendingUpdate) return;

        const now = performance.now();
        const connectedTileNames = Object.keys(this.tileCanvases);

        if (connectedTileNames.length === 0) return;

        const tilesWithFreshFrames = connectedTileNames.filter(tileName => {
            const lastFrameTime = this.frameReadyMap.get(tileName);
            return lastFrameTime && (now - lastFrameTime) < this.maxWaitForSync;
        });

        const timeSinceLastUpdate = now - this.lastUpdateTime;
        if (timeSinceLastUpdate < this.updateThrottle) {
            if (!this.pendingUpdate) {
                this.pendingUpdate = true;
                const remainingTime = this.updateThrottle - timeSinceLastUpdate;
                setTimeout(() => {
                    this.pendingUpdate = false;
                    this.tryUpdateWithSync();
                }, remainingTime);
            }
            return;
        }

        if (tilesWithFreshFrames.length >= this.requiredTiles) {
            this.updateMergedCanvas();
            this.lastUpdateTime = now;
            tilesWithFreshFrames.forEach(tileName => {
                this.frameReadyMap.delete(tileName);
            });
        } else if (tilesWithFreshFrames.length > 0 && timeSinceLastUpdate > this.maxWaitForSync) {
            this.updateMergedCanvas();
            this.lastUpdateTime = now;
            tilesWithFreshFrames.forEach(tileName => {
                this.frameReadyMap.delete(tileName);
            });
        } else {
            if (!this.pendingUpdate) {
                this.pendingUpdate = true;
                const waitTime = tilesWithFreshFrames.length > 0 ? 50 : 16;
                setTimeout(() => {
                    this.pendingUpdate = false;
                    this.tryUpdateWithSync();
                }, waitTime);
            }
        }
    }

    updateMergedCanvas() {
        if (!this.mergedContext || this.mode !== 'tiles') return;

        this.mergedContext.clearRect(0, 0, 3840, 2160);

        Object.values(this.tileCanvases).forEach(tile => {
            if (tile.canvas) {
                this.mergedContext.drawImage(
                    tile.canvas,
                    tile.position.x, tile.position.y,
                    1920, 1080
                );
            }
        });

        if (this.currentTexture) {
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
        this.frameReadyMap.clear();
    }
}

export default SmartVideoManager;
