// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Service status cache implementation
const BACKGROUND_UPDATE_INTERVAL = 5000; // 5 seconds between background updates
const STORAGE_KEY = 'serviceCacheData';

// Canonical list of all managed services — use window.serviceCache.ALL_SERVICES
// instead of defining local copies in other files.
const ALL_SERVICES = [
    "camera", "imu", "navsat", "model", "lidarpub",
    "radarpub", "fusion", "zenohd", "gpsd", "recorder"
];

// Initialize the cache object immediately
window.serviceCache = {
    serviceStatuses: null,
    replayStatus: null,
    lastUpdate: 0,
    isInitialized: false,
    backgroundUpdateTimer: null,
    updateCallbacks: new Set(),
    // Add placeholder functions that will be replaced
    getServiceStatuses: async () => null,
    getReplayStatus: async () => null,
    isServiceEnabled: () => false,
    isServiceRunning: () => false,
    clearCache: () => { },
    startBackgroundUpdates: () => { },
    stopBackgroundUpdates: () => { },
    registerUpdateCallback: () => { },
    unregisterUpdateCallback: () => { }
};

// Load cached data from localStorage
function loadFromStorage() {
    try {
        const cachedData = localStorage.getItem(STORAGE_KEY);
        if (cachedData) {
            const { serviceStatuses, replayStatus, lastUpdate } = JSON.parse(cachedData);
            window.serviceCache.serviceStatuses = serviceStatuses;
            window.serviceCache.replayStatus = replayStatus;
            window.serviceCache.lastUpdate = lastUpdate;
            return true;
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
    }
    return false;
}

// Save cache data to localStorage
function saveToStorage() {
    try {
        const dataToStore = {
            serviceStatuses: window.serviceCache.serviceStatuses,
            replayStatus: window.serviceCache.replayStatus,
            lastUpdate: window.serviceCache.lastUpdate
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

// Function to perform background updates
async function performBackgroundUpdate() {
    try {
        const serviceResponse = await fetch('/api/services/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ services: ALL_SERVICES })
        });
        if (!serviceResponse.ok) throw new Error(`HTTP error! status: ${serviceResponse.status}`);
        const serviceStatuses = await serviceResponse.json();

        const replayResponse = await fetch('/api/replay/status');
        if (!replayResponse.ok) throw new Error(`HTTP error! status: ${replayResponse.status}`);
        const statusText = await replayResponse.text();
        const replayStatus = statusText.trim() === "Replay is running";

        if (JSON.stringify(window.serviceCache.serviceStatuses) !== JSON.stringify(serviceStatuses) ||
            window.serviceCache.replayStatus !== replayStatus) {

            window.serviceCache.serviceStatuses = serviceStatuses;
            window.serviceCache.replayStatus = replayStatus;
            window.serviceCache.lastUpdate = Date.now();
            saveToStorage();
            window.serviceCache.updateCallbacks.forEach(callback => callback());
        }
    } catch (error) {
        console.error('Error during background update:', error);
    }
}

// Function to start background updates
function startBackgroundUpdates() {
    if (!window.serviceCache.backgroundUpdateTimer) {
        // Load cached data first and notify listeners if data was available
        if (loadFromStorage()) {
            window.serviceCache.updateCallbacks.forEach(callback => callback());
        }

        // Perform initial update immediately
        performBackgroundUpdate();

        // Then set up interval for subsequent updates
        window.serviceCache.backgroundUpdateTimer = setInterval(performBackgroundUpdate, BACKGROUND_UPDATE_INTERVAL);
        window.serviceCache.isInitialized = true;
    }
}

// Function to stop background updates
function stopBackgroundUpdates() {
    if (window.serviceCache.backgroundUpdateTimer) {
        clearInterval(window.serviceCache.backgroundUpdateTimer);
        window.serviceCache.backgroundUpdateTimer = null;
    }
}

// Function to register a callback for cache updates
function registerUpdateCallback(callback) {
    window.serviceCache.updateCallbacks.add(callback);
}

// Function to unregister a callback
function unregisterUpdateCallback(callback) {
    window.serviceCache.updateCallbacks.delete(callback);
}

// Function to check if a service is enabled in systemd
function isServiceEnabled(serviceName) {
    const statuses = window.serviceCache.serviceStatuses;
    if (!Array.isArray(statuses)) return false;
    const entry = statuses.find(s => s.service === serviceName);
    return entry?.enabled === 'enabled';
}

// Function to check if a service is currently running
function isServiceRunning(serviceName) {
    const statuses = window.serviceCache.serviceStatuses;
    if (!Array.isArray(statuses)) return false;
    const entry = statuses.find(s => s.service === serviceName);
    const status = typeof entry?.status === 'string' ? entry.status : entry?.status?.status;
    return status === 'running';
}

// Function to get service statuses
async function getServiceStatuses(services) {
    if (!window.serviceCache.isInitialized) {
        await performBackgroundUpdate();
    }
    return window.serviceCache.serviceStatuses;
}

// Function to get replay status
async function getReplayStatus() {
    if (!window.serviceCache.isInitialized) {
        await performBackgroundUpdate();
    }
    return window.serviceCache.replayStatus;
}

// Function to clear cache and force refresh
function clearCache() {
    const existingCallbacks = window.serviceCache.updateCallbacks;
    stopBackgroundUpdates();
    window.serviceCache = {
        serviceStatuses: null,
        replayStatus: null,
        lastUpdate: 0,
        isInitialized: false,
        backgroundUpdateTimer: null,
        updateCallbacks: existingCallbacks || new Set()
    };
    // Re-attach functions after resetting state
    Object.assign(window.serviceCache, {
        ALL_SERVICES,
        getServiceStatuses,
        getReplayStatus,
        isServiceEnabled,
        isServiceRunning,
        clearCache,
        startBackgroundUpdates,
        stopBackgroundUpdates,
        registerUpdateCallback,
        unregisterUpdateCallback
    });
    localStorage.removeItem(STORAGE_KEY);
    startBackgroundUpdates();
}

// Update the service cache object with the actual functions
Object.assign(window.serviceCache, {
    ALL_SERVICES,
    getServiceStatuses,
    getReplayStatus,
    isServiceEnabled,
    isServiceRunning,
    clearCache,
    startBackgroundUpdates,
    stopBackgroundUpdates,
    registerUpdateCallback,
    unregisterUpdateCallback
});

// Start background updates when the page loads
window.addEventListener('load', () => {
    if (!window.serviceCache.backgroundUpdateTimer) {
        startBackgroundUpdates();
    }
});

// Stop background updates when the page unloads
window.addEventListener('beforeunload', () => {
    stopBackgroundUpdates();
}); 
