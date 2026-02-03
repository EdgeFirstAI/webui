// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as THREE from './three.js';
import h264Stream from './stream.js';

class SmartVideoManager {
    constructor() {
        this.tileUrls = [
            '/rt/camera/h264/tl',
            '/rt/camera/h264/tr',
            '/rt/camera/h264/bl',
            '/rt/camera/h264/br'
        ];
        this.fallbackUrl = '/rt/camera/h264';

        this.mode = null; // 'tiles' or 'fallback'
        this.currentTexture = null;
        this.tileCanvases = {};
        this.mergedCanvas = null;
        this.mergedContext = null;

        this.detectionTimeout = 5000; // 5 seconds to detect tiles

        // Aggressive frame synchronization system (15fps, requires ALL tiles)
        this.syncEnabled = true;
        this.frameReadyMap = new Map(); // Track when each tile has a frame ready
        this.lastUpdateTime = 0;
        this.updateThrottle = 67; // Update at most every 67ms (15fps)
        this.maxWaitForSync = 500; // Maximum 500ms wait for ALL tiles (much longer)
        this.pendingUpdate = false;
        this.requiredTiles = 4; // MUST have all 4 tiles
    }

    async init(onFrameUpdate, h264StreamFunc = null) {
        // Use passed function or imported one
        this.h264StreamFunc = h264StreamFunc || h264Stream;
        try {
            const tilesAvailable = await this.detectTiles();

            if (tilesAvailable) {
                try {
                    return await this.initTileMode(onFrameUpdate);
                } catch (tileError) {
                    console.error('❌ Tile initialization failed:', tileError);
                    return await this.initFallbackMode(onFrameUpdate);
                }
            } else {
                return await this.initFallbackMode(onFrameUpdate);
            }
        } catch (error) {
            console.error('Detection error:', error);
            return await this.initFallbackMode(onFrameUpdate);
        }
    }

    async detectTiles() {
        console.log('SmartVideoManager: Testing tile connections...');

        return new Promise((resolve) => {
            let connectCount = 0;
            let dataReceivedCount = 0;
            const connections = [];
            const connectionStatus = {};
            const dataReceivedFrom = new Set();

            const timeout = setTimeout(() => {
                connections.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.close();
                    }
                });

                // Only use tiles if we have at least 2 tiles with actual data
                const tilesAvailable = dataReceivedCount >= 2;
                resolve(tilesAvailable);
            }, this.detectionTimeout);

            this.tileUrls.forEach((url, index) => {
                const ws = new WebSocket(url);
                ws.binaryType = 'arraybuffer';
                connections.push(ws);
                connectionStatus[url] = 'connecting';

                ws.onopen = () => {
                    connectCount++;
                    connectionStatus[url] = 'connected';
                };

                ws.onmessage = (event) => {
                    connectionStatus[url] = 'streaming';
                    if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
                        if (!dataReceivedFrom.has(url)) {
                            dataReceivedFrom.add(url);
                            dataReceivedCount++;

                            // If we have enough tiles with data, resolve immediately
                            if (dataReceivedCount >= 2) {
                                clearTimeout(timeout);
                                // Clean up connections
                                connections.forEach(socket => {
                                    if (socket.readyState === WebSocket.OPEN) {
                                        socket.close();
                                    }
                                });
                                resolve(true);
                            }
                        }
                    }
                };

                ws.onerror = (error) => {
                    connectionStatus[url] = 'error';
                };

                ws.onclose = () => {
                    if (connectionStatus[url] === 'connecting') {
                        connectionStatus[url] = 'failed';
                    }
                };
            });
        });
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
        this.currentTexture = new THREE.CanvasTexture(this.mergedCanvas);
        this.currentTexture.generateMipmaps = false;
        this.currentTexture.minFilter = THREE.LinearFilter;
        this.currentTexture.magFilter = THREE.LinearFilter;

        // Initialize tile streams
        const tilePromises = this.tileUrls.map(async (url, index) => {
            const tileName = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'][index];
            const position = [
                { x: 0, y: 0 },     // topLeft
                { x: 1920, y: 0 },  // topRight  
                { x: 0, y: 1080 },  // bottomLeft
                { x: 1920, y: 1080 } // bottomRight
            ][index];

            try {
                const texture = await this.h264StreamFunc(url, 1920, 1080, 30, (timing) => {
                    // Store frame timing for synchronization
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
                console.error(`SmartVideoManager: ❌ Failed to initialize tile ${tileName}:`, error);
                return null;
            }
        });

        const results = await Promise.allSettled(tilePromises);
        const successfulTiles = results.filter(result => result.status === 'fulfilled' && result.value !== null).length;
        const failures = results.filter(result => result.status === 'rejected');

        if (failures.length > 0) {
            failures.forEach((failure, index) => {
                console.error(`SmartVideoManager: Tile ${index} failed:`, failure.reason);
            });
        }

        if (successfulTiles === 0) {
            throw new Error('No tiles could be initialized successfully');
        }


        this.frameReadyMap.clear();

        // Start merge updates
        this.updateMergedCanvas();

        return this.currentTexture;
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

        // Mark this tile as having a fresh frame
        this.frameReadyMap.set(tileName, now);

        const readyTiles = Array.from(this.frameReadyMap.keys());

        this.tryUpdateWithSync();
    }

    tryUpdateWithSync() {
        if (this.pendingUpdate) return; // Already waiting for sync

        const now = performance.now();
        const connectedTileNames = Object.keys(this.tileCanvases);

        if (connectedTileNames.length === 0) return;

        // Check how many tiles have fresh frames
        const tilesWithFreshFrames = connectedTileNames.filter(tileName => {
            const lastFrameTime = this.frameReadyMap.get(tileName);
            return lastFrameTime && (now - lastFrameTime) < this.maxWaitForSync;
        });

        // Throttle updates to 15fps max for stability
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        if (timeSinceLastUpdate < this.updateThrottle) {
            // Too soon for next update - wait
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

        // ONLY update if we have ALL 4 tiles ready (strict requirement)
        if (tilesWithFreshFrames.length >= this.requiredTiles) {
            this.updateMergedCanvas();
            this.lastUpdateTime = now;

            // Clear frame ready flags for tiles that were used
            tilesWithFreshFrames.forEach(tileName => {
                this.frameReadyMap.delete(tileName);
            });

        } else if (tilesWithFreshFrames.length > 0 && timeSinceLastUpdate > this.maxWaitForSync) {
            // Emergency fallback - only if we've waited too long
            console.warn(`⚠️ TIMEOUT: Only ${tilesWithFreshFrames.length}/${this.requiredTiles} tiles ready after ${this.maxWaitForSync}ms - forcing update`);
            this.updateMergedCanvas();
            this.lastUpdateTime = now;

            // Clear frame ready flags for tiles that were used
            tilesWithFreshFrames.forEach(tileName => {
                this.frameReadyMap.delete(tileName);
            });
        } else {
            // Wait for more tiles - be patient for ALL 4 tiles
            if (!this.pendingUpdate) {
                this.pendingUpdate = true;
                const waitTime = tilesWithFreshFrames.length > 0 ? 50 : 16; // Wait longer if we have some tiles
                setTimeout(() => {
                    this.pendingUpdate = false;
                    this.tryUpdateWithSync();
                }, waitTime);
            }
        }
    }

    updateMergedCanvas() {
        if (!this.mergedContext || this.mode !== 'tiles') return;

        // Clear canvas
        this.mergedContext.clearRect(0, 0, 3840, 2160);

        // Draw each tile
        Object.values(this.tileCanvases).forEach(tile => {
            if (tile.canvas) {
                this.mergedContext.drawImage(
                    tile.canvas,
                    tile.position.x, tile.position.y,
                    1920, 1080
                );
            }
        });

        // Update texture
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
