/*
 * Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Neural Mesh Background Animation for EdgeFirst WebUI
 * Creates an animated interconnected node network with scroll-triggered gold pulses
 * Only active in dark mode for visual consistency
 */

/**
 * NeuralMesh object for managing the animated neural network background
 * @namespace
 */
const NeuralMesh = {
    /**
     * Configuration for the neural mesh animation
     * @type {Object}
     */
    config: {
        nodeCount: 50,
        connectionDistance: 120,
        nodeRadius: 1.5,
        lineWidth: 0.5,
        pulseFadeRate: 0.015,
        pulseSpawnRate: 0.12,
        colors: {
            node: 'rgba(90, 77, 138, 0.4)',
            connection: 'rgba(90, 77, 138, 0.15)',
            pulseNode: 'rgba(232, 184, 32, 0.9)',
            pulseConnection: 'rgba(232, 184, 32, 0.6)'
        }
    },

    /** @type {HTMLCanvasElement|null} Canvas element */
    canvas: null,

    /** @type {CanvasRenderingContext2D|null} 2D rendering context */
    ctx: null,

    /** @type {Array<{x: number, y: number, radius: number, pulseIntensity: number}>} */
    nodes: [],

    /** @type {Array<{from: number, to: number, distance: number, pulseIntensity: number}>} */
    connections: [],

    /** @type {number|null} Animation frame ID */
    animationId: null,

    /** @type {boolean} Whether animation is enabled (dark mode only) */
    isEnabled: false,

    /** @type {number} Last scroll Y position */
    lastScrollY: 0,

    /** @type {number} Scroll delta for pulse detection */
    scrollDelta: 0,

    /** @type {HTMLElement|null} Container element */
    container: null,

    /**
     * Initialize the neural mesh background
     * Creates canvas, sets up event listeners, and checks initial theme
     * @param {string} containerId - ID for the container element
     */
    init(containerId) {
        // Create container
        this.container = document.createElement('div');
        this.container.id = containerId;
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
        `;

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;
        this.container.appendChild(this.canvas);

        // Insert into the main element with bg-neural class, or body as fallback
        const mainElement = document.querySelector('main.bg-neural') || document.querySelector('main') || document.body;
        mainElement.insertBefore(this.container, mainElement.firstChild);

        // Get 2D context
        this.ctx = this.canvas.getContext('2d');

        // Initial setup
        this.resize();
        this.generateNodes();
        this.generateConnections();

        // Bind event handlers to preserve context
        this._boundResize = this.resize.bind(this);
        this._boundScroll = this.handleScroll.bind(this);
        this._boundWheel = this.handleWheel.bind(this);
        this._boundMouseMove = this.handleMouseMove.bind(this);
        this._boundThemeChange = this.handleThemeChange.bind(this);

        // Set up event listeners
        window.addEventListener('resize', this._boundResize);
        window.addEventListener('scroll', this._boundScroll, { passive: true });
        window.addEventListener('wheel', this._boundWheel, { passive: true });
        window.addEventListener('mousemove', this._boundMouseMove, { passive: true });
        document.addEventListener('themechange', this._boundThemeChange);

        // Check initial theme state
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto';
        const isDark = this._checkIsDark(currentTheme);
        this.isEnabled = isDark;

        if (this.isEnabled) {
            this.container.style.display = 'block';
            this.start();
        } else {
            this.container.style.display = 'none';
        }

        // Initialize scroll position
        this.lastScrollY = window.scrollY;
    },

    /**
     * Check if current theme results in dark mode
     * @param {string} theme - The theme to check
     * @returns {boolean} True if dark mode
     * @private
     */
    _checkIsDark(theme) {
        if (theme === 'dark') {
            return true;
        }
        if (theme === 'light') {
            return false;
        }
        // For 'auto', check system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    },

    /**
     * Handle window resize
     * Recalculates canvas dimensions and regenerates mesh
     */
    resize() {
        if (!this.canvas || !this.ctx) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Set canvas size accounting for device pixel ratio
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        // Scale context to match device pixel ratio
        this.ctx.scale(dpr, dpr);

        // Regenerate nodes and connections for new dimensions
        this.generateNodes();
        this.generateConnections();
    },

    /**
     * Generate random nodes across the canvas
     * Nodes have random positions with edge padding and slight radius variation
     */
    generateNodes() {
        this.nodes = [];

        const width = window.innerWidth;
        const height = window.innerHeight;
        const padding = 50;

        for (let i = 0; i < this.config.nodeCount; i++) {
            this.nodes.push({
                x: padding + Math.random() * (width - padding * 2),
                y: padding + Math.random() * (height - padding * 2),
                radius: this.config.nodeRadius + Math.random() * 1.5,
                pulseIntensity: 0
            });
        }
    },

    /**
     * Generate connections between nearby nodes
     * Connects nodes within connectionDistance of each other
     */
    generateConnections() {
        this.connections = [];

        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[i].x - this.nodes[j].x;
                const dy = this.nodes[i].y - this.nodes[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= this.config.connectionDistance) {
                    this.connections.push({
                        from: i,
                        to: j,
                        distance: distance,
                        pulseIntensity: 0
                    });
                }
            }
        }
    },

    /**
     * Handle scroll events to trigger pulses
     * Spawns pulses based on scroll delta and spawn rate
     * @param {Event} e - Scroll event
     */
    handleScroll(e) {
        if (!this.isEnabled) {
            return;
        }

        const currentScrollY = window.scrollY;
        this.scrollDelta = Math.abs(currentScrollY - this.lastScrollY);
        this.lastScrollY = currentScrollY;

        // Spawn pulse if scroll delta exceeds threshold and random check passes
        if (this.scrollDelta > 5 && Math.random() < this.config.pulseSpawnRate) {
            this.spawnPulse();
        }
    },

    /**
     * Handle wheel events to trigger pulses (works even on non-scrolling pages)
     * @param {WheelEvent} e - Wheel event
     */
    handleWheel(e) {
        if (!this.isEnabled) {
            return;
        }

        const wheelDelta = Math.abs(e.deltaY);
        // Spawn pulse if wheel movement exceeds threshold
        if (wheelDelta > 10 && Math.random() < this.config.pulseSpawnRate) {
            this.spawnPulse();
        }
    },

    /**
     * Handle mouse movement to trigger pulses near cursor
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        if (!this.isEnabled) {
            return;
        }

        // Throttle: only check every 100ms worth of movement
        if (!this._lastMouseTime) {
            this._lastMouseTime = 0;
        }
        const now = Date.now();
        if (now - this._lastMouseTime < 100) {
            return;
        }
        this._lastMouseTime = now;

        // Find nearest node to cursor and pulse it (with low probability)
        if (Math.random() < 0.08) {
            this.spawnPulseNear(e.clientX, e.clientY);
        }
    },

    /**
     * Spawn a pulse at the node nearest to given coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    spawnPulseNear(x, y) {
        if (this.nodes.length === 0) {
            return;
        }

        // Find closest node to coordinates
        let closestIndex = 0;
        let closestDist = Infinity;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const dist = Math.hypot(node.x - x, node.y - y);
            if (dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        // Only pulse if reasonably close (within 200px)
        if (closestDist < 200) {
            this.nodes[closestIndex].pulseIntensity = 1;

            // Pulse connected nodes
            for (const connection of this.connections) {
                if (connection.from === closestIndex || connection.to === closestIndex) {
                    connection.pulseIntensity = 1;
                    const otherNode = connection.from === closestIndex ? connection.to : connection.from;
                    setTimeout(() => {
                        if (this.nodes[otherNode]) {
                            this.nodes[otherNode].pulseIntensity = 0.7;
                        }
                    }, 100);
                }
            }
        }
    },

    /**
     * Spawn a pulse at a random node
     * Sets the node's pulse intensity and propagates to connected nodes
     */
    spawnPulse() {
        if (this.nodes.length === 0) {
            return;
        }

        // Pick a random node to start the pulse
        const nodeIndex = Math.floor(Math.random() * this.nodes.length);
        this.nodes[nodeIndex].pulseIntensity = 1;

        // Find all connections involving this node and pulse them
        const connectedNodeIndices = [];
        for (const connection of this.connections) {
            if (connection.from === nodeIndex || connection.to === nodeIndex) {
                connection.pulseIntensity = 1;
                // Track the other node in the connection
                const otherNode = connection.from === nodeIndex ? connection.to : connection.from;
                connectedNodeIndices.push(otherNode);
            }
        }

        // After 100ms, set connected nodes to pulse at reduced intensity
        setTimeout(() => {
            for (const idx of connectedNodeIndices) {
                if (this.nodes[idx]) {
                    this.nodes[idx].pulseIntensity = 0.7;
                }
            }
        }, 100);
    },

    /**
     * Handle theme change events
     * Enables/disables animation based on dark mode state
     * @param {CustomEvent} e - Theme change event with detail.isDark
     */
    handleThemeChange(e) {
        const isDark = e.detail && e.detail.isDark;
        this.isEnabled = isDark;

        if (this.isEnabled) {
            if (this.container) {
                this.container.style.display = 'block';
            }
            this.start();
        } else {
            this.stop();
            if (this.container) {
                this.container.style.display = 'none';
            }
        }
    },

    /**
     * Start the animation loop
     * Only starts if not already running
     */
    start() {
        if (this.animationId !== null) {
            return;
        }
        this.animate();
    },

    /**
     * Stop the animation loop
     * Cancels the current animation frame
     */
    stop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },

    /**
     * Main animation loop
     * Clears canvas, draws mesh, fades pulses, and requests next frame
     */
    animate() {
        if (!this.ctx || !this.isEnabled) {
            this.animationId = null;
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Draw all connections
        this.ctx.lineWidth = this.config.lineWidth;
        for (const connection of this.connections) {
            const fromNode = this.nodes[connection.from];
            const toNode = this.nodes[connection.to];

            // Interpolate color based on pulse intensity
            const color = this.interpolateColor(
                this.config.colors.connection,
                this.config.colors.pulseConnection,
                connection.pulseIntensity
            );

            this.ctx.strokeStyle = color;
            this.ctx.beginPath();
            this.ctx.moveTo(fromNode.x, fromNode.y);
            this.ctx.lineTo(toNode.x, toNode.y);
            this.ctx.stroke();

            // Fade pulse intensity
            if (connection.pulseIntensity > 0) {
                connection.pulseIntensity = Math.max(0, connection.pulseIntensity - this.config.pulseFadeRate);
            }
        }

        // Draw all nodes
        for (const node of this.nodes) {
            // Interpolate color based on pulse intensity
            const color = this.interpolateColor(
                this.config.colors.node,
                this.config.colors.pulseNode,
                node.pulseIntensity
            );

            // Add glow effect when pulsing
            if (node.pulseIntensity > 0.1) {
                this.ctx.shadowBlur = 15 * node.pulseIntensity;
                this.ctx.shadowColor = this.config.colors.pulseNode;
            } else {
                this.ctx.shadowBlur = 0;
            }

            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Reset shadow
            this.ctx.shadowBlur = 0;

            // Fade pulse intensity
            if (node.pulseIntensity > 0) {
                node.pulseIntensity = Math.max(0, node.pulseIntensity - this.config.pulseFadeRate);
            }
        }

        // Request next frame
        this.animationId = requestAnimationFrame(() => this.animate());
    },

    /**
     * Interpolate between two rgba colors
     * @param {string} color1 - Starting color (rgba format)
     * @param {string} color2 - Ending color (rgba format)
     * @param {number} factor - Interpolation factor (0-1)
     * @returns {string} Interpolated rgba color string
     */
    interpolateColor(color1, color2, factor) {
        // Clamp factor to 0-1 range
        factor = Math.max(0, Math.min(1, factor));

        // Parse rgba values from color strings
        const parse = (color) => {
            const match = color.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),?\s*([\d.]+)?\)/);
            if (match) {
                return {
                    r: parseFloat(match[1]),
                    g: parseFloat(match[2]),
                    b: parseFloat(match[3]),
                    a: match[4] !== undefined ? parseFloat(match[4]) : 1
                };
            }
            return { r: 0, g: 0, b: 0, a: 1 };
        };

        const c1 = parse(color1);
        const c2 = parse(color2);

        // Linear interpolation
        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);
        const a = c1.a + (c2.a - c1.a) * factor;

        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    },

    /**
     * Destroy the neural mesh and clean up resources
     * Removes event listeners, cancels animation, and removes DOM elements
     */
    destroy() {
        this.stop();

        // Remove event listeners
        if (this._boundResize) {
            window.removeEventListener('resize', this._boundResize);
        }
        if (this._boundScroll) {
            window.removeEventListener('scroll', this._boundScroll);
        }
        if (this._boundWheel) {
            window.removeEventListener('wheel', this._boundWheel);
        }
        if (this._boundMouseMove) {
            window.removeEventListener('mousemove', this._boundMouseMove);
        }
        if (this._boundThemeChange) {
            document.removeEventListener('themechange', this._boundThemeChange);
        }

        // Remove DOM elements
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        // Reset state
        this.canvas = null;
        this.ctx = null;
        this.container = null;
        this.nodes = [];
        this.connections = [];
        this.animationId = null;
        this.isEnabled = false;
    }
};

// Export to global scope
window.NeuralMesh = NeuralMesh;
