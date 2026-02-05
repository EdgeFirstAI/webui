// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
async function checkReplayStatus() {
    try {
        const deviceData = await window.serviceCache.getDeviceData();
        const serviceStatuses = await window.serviceCache.getServiceStatuses();
        const isRaivin = deviceData.DEVICE?.toLowerCase().includes('raivin');

        // Check critical services
        const statusMap = serviceStatuses.reduce((acc, { service, status }) => {
            acc[service] = status;
            return acc;
        }, {});

        const isReplay = await window.serviceCache.getReplayStatus();

        // Clear localStorage state if replay is not running
        if (!isReplay) {
            localStorage.removeItem('mcapReplayState');
            window.isPlaying = false;
            window.currentPlayingFile = null;
        }

        const modeIndicator = document.getElementById('modeIndicator');
        const modeText = document.getElementById('modeText');
        const loadingSpinner = modeIndicator.querySelector('svg.animate-spin');
        if (loadingSpinner) {
            loadingSpinner.remove();
        }
        const allSensorsInactive = Object.values(statusMap).every(status => status !== 'running');
        const allSensorActive = Object.values(statusMap).every(status => status === 'running');
        if (allSensorsInactive && !isReplay) {
            modeText.textContent = "Stopped";
            modeIndicator.className = "px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 flex items-center gap-2";
        }
        else if (isReplay) {
            if (!allSensorsInactive) {
                modeText.textContent = "Replay Mode (Degraded)";
                modeIndicator.className = "px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 flex items-center gap-2";
            } else {
                modeText.textContent = "Replay Mode";
                modeIndicator.className = "px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 flex items-center gap-2";
            }
        } else {
            const isradarpubDown = !statusMap['radarpub'] || statusMap['radarpub'] !== 'running';
            const isCameraDown = !statusMap['camera'] || statusMap['camera'] !== 'running';
            const isDegraded = (isRaivin && isradarpubDown) || isCameraDown;

            if (!allSensorActive) {
                modeText.textContent = "Live Mode (Degraded)";
                modeIndicator.className = "px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 flex items-center gap-2";
            } else {
                modeText.textContent = "Live Mode";
                modeIndicator.className = "px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 flex items-center gap-2";
            }
        }
    } catch (error) {
        console.error('Error checking replay status:', error);
    }
}

async function checkRecorderStatus() {
    try {
        const response = await fetch('/recorder-status');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const statusText = await response.text();
        const isRecording = statusText.trim() === "Recorder is running";
        if (typeof window.updateRecordingUI === 'function') {
            window.updateRecordingUI(isRecording);
        }
    } catch (error) {
        if (typeof window.updateRecordingUI === 'function') {
            window.updateRecordingUI(false);
        }
    }
}

window.showServiceStatus = async function () {
    let dialog = document.getElementById('serviceStatusDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'serviceStatusDialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">Service Status</h3>
                <div id="serviceStatusContent" class="space-y-2">
                    <div class="flex items-center justify-center">
                        <span class="loading loading-spinner loading-md"></span>
                    </div>
                </div>
                <div class="modal-action">
                    <button class="btn" onclick="hideServiceStatus()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }
    dialog.showModal();

    try {
        // First get device type
        const deviceResponse = await fetch('/config/webui/details');
        if (!deviceResponse.ok) throw new Error(`HTTP error! status: ${deviceResponse.status}`);
        const deviceData = await deviceResponse.json();
        const isRaivin = deviceData.DEVICE?.toLowerCase().includes('raivin');
        const baseServices = ["camera", "imu", "navsat", "model"];
        const raivinServices = ["radarpub", "fusion"];
        const services = isRaivin ? [...baseServices, ...raivinServices] : baseServices;

        const response = await fetch('/config/service/status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ services })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const serviceStatuses = await response.json();
        const content = document.getElementById('serviceStatusContent');
        content.innerHTML = '';

        // Fix header and button alignment without DOM hierarchy error
        let headerRow = document.getElementById('fd-service-header-row');
        if (!headerRow) {
            const h3 = dialog.querySelector('h3');
            headerRow = document.createElement('div');
            headerRow.id = 'fd-service-header-row';
            headerRow.style.display = 'flex';
            headerRow.style.justifyContent = 'space-between';
            headerRow.style.alignItems = 'center';
            headerRow.style.marginBottom = '1.2rem';
            headerRow.innerHTML = `
                <span class="font-bold text-lg">Service Status</span>
                <a href="/config/services" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 text-gray-800 font-medium shadow-none hover:bg-gray-200 transition-all text-sm fd-hom-all-services-btn" style="margin-left:auto;">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 6.75h15m-15 4.5h15m-15 4.5h15" /></svg>
                    Go to All Services
                </a>
            `;
            if (h3 && h3.parentNode) {
                h3.parentNode.replaceChild(headerRow, h3);
            }
        }
        // Remove the old button from content
        content.innerHTML = '';
        // SVGs for enabled/disabled
        const enabledIcon = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
        const disabledIcon = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
        serviceStatuses.forEach(({ service, status, enabled }, idx) => {
            const isRunning = status === 'running';
            const isEnabled = enabled === 'enabled';
            const enabledBadge = isEnabled
                ? `<span class="fd-enabled-badge inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-xs gap-1 self-start" style="width:auto;align-self:flex-start;">${enabledIcon} Enabled</span>`
                : `<span class="fd-disabled-badge inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-xs gap-1 self-start" style="width:auto;align-self:flex-start;">${disabledIcon} Disabled</span>`;
            const serviceName = service
                .replace('.service', '')
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            let settingsUrl = null;
            let hasSettings = false;
            console.log(service)
            if (service !== "navsat" && service !== "imu") {
                settingsUrl = `/config/${service}`;
                hasSettings = true;
            }
            const gearIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 fd-hom-settings-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.01c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.01 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.01 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.01c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.572-1.01c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.01-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.01-2.572c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.01z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
            content.innerHTML += `
                <div class="fd-hom-service-row flex items-center px-3 py-3 bg-white rounded-2xl shadow-sm mb-3 border border-gray-100 group" style="min-height:56px;">
                    <div class="flex flex-col flex-grow min-w-0 justify-center">
                        <span class="text-base font-semibold text-gray-900">${serviceName}</span>
                        ${enabledBadge}
                    </div>
                    <div class="flex items-center gap-3 ml-auto">
                        <span class="fd-hom-status-badge ${isRunning ? 'fd-hom-status-running' : 'fd-hom-status-stopped'} inline-flex items-center px-3 py-1 rounded-full font-medium text-xs">
                            <span class="fd-hom-status-dot ${isRunning ? 'bg-green-400' : 'bg-red-400'} w-2 h-2 rounded-full inline-block mr-1"></span>
                            ${isRunning ? 'Running' : 'Stopped'}
                        </span>
                        ${hasSettings
                    ? `<a href="${settingsUrl}" title="Go to ${serviceName} Settings" class="fd-hom-settings-btn ml-2 flex items-center justify-center" target="_blank" rel="noopener">${gearIcon}</a>`
                    : `<span class="fd-hom-settings-btn ml-2 cursor-not-allowed opacity-50 flex items-center justify-center" title="No settings available">${gearIcon}</span>`}
                    </div>
                </div>
            `;
        });
        // Add CSS for enabled/disabled badges
        if (!document.getElementById('fd-service-status-style-hom-enabled-badge')) {
            const style = document.createElement('style');
            style.id = 'fd-service-status-style-hom-enabled-badge';
            style.innerHTML = `
                .fd-enabled-badge, .fd-disabled-badge {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 9999px;
                    padding: 0.08em 0.5em 0.08em 0.4em;
                    font-size: 0.85em;
                    font-weight: 600;
                    min-width: 0;
                    box-sizing: border-box;
                    margin-top: 0.18em;
                    width: auto !important;
                    align-self: flex-start !important;
                }
                .fd-enabled-badge { background: #d1fae5 !important; color: #047857 !important; }
                .fd-disabled-badge { background: #fee2e2 !important; color: #b91c1c !important; }
            `;
            document.head.appendChild(style);
        }
    } catch (error) {
        console.error('Error fetching service status:', error);
        const content = document.getElementById('serviceStatusContent');
        content.innerHTML = `
            <div class="flex items-center gap-2 p-3 text-red-800 bg-red-50 rounded-lg">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-sm font-medium">Error loading service status</span>
            </div>
        `;
    }
}

window.hideServiceStatus = function () {
    const dialog = document.getElementById('serviceStatusDialog');
    if (dialog) {
        dialog.close();
    }

    // Close WebSocket connection when dialog is closed
    if (mcapSocket) {
        mcapSocket.close();
        mcapSocket = null;
        window.mcapSocket = null;
    }
};

async function updateQuickStatus() {
    try {
        const serviceStatuses = await window.serviceCache.getServiceStatuses();
        const quickStatusContent = document.getElementById('quickStatusContent');
        const nonRunningServices = serviceStatuses.filter(({ status }) => status !== 'running');

        if (nonRunningServices.length === 0) {
            quickStatusContent.innerHTML = `
                <div class="flex items-center justify-center text-green-600">
                    <span class="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                    All Services Running
                </div>
            `;
        } else {
            quickStatusContent.innerHTML = `
                <div class="flex items-center justify-center text-red-600 mb-2">
                    <span class="h-2 w-2 rounded-full bg-red-500 mr-2 inline-block"></span>
                    Inactive Services:
                </div>
            `;

            nonRunningServices.forEach(({ service }) => {
                const serviceName = service
                    .replace('.service', '')
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                quickStatusContent.innerHTML += `
                    <div class="flex items-center justify-between text-gray-600">
                        <span>${serviceName}</span>
                        <span class="text-red-500">Inactive</span>
                    </div>
                `;
            });
        }

        quickStatusContent.innerHTML += `
            <button onclick="showServiceStatus()" class="w-full mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1">
                <span>Click for more details</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
            </button>
        `;
    } catch (error) {
        console.error('Error updating quick status:', error);
    }
}

let mcapSocket = null;
window.mcapSocket = mcapSocket;

window.showMcapDialog = async function () {
    let dialog = document.getElementById('mcapDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'mcapDialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-box" style="padding: 0; min-width: 60vw; max-width: 90vw; width: 100%; display: flex; flex-direction: column; max-height: 85vh;">
                <div class="mcap-header">
                    <div class="mcap-header-left">
                        <h2 class="mcap-title">MCAP Recordings</h2>
                    </div>
                    <div class="mcap-header-center" id="mcapHeaderControls">
                        <!-- Controls will be populated when files are loaded -->
                    </div>
                    <div class="mcap-header-right">
                        <div id="mcapStorageInfoBar" class="mcap-storage-info"></div>
                        <button onclick="hideMcapDialog()" class="mcap-close-btn">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div id="mcapDialogContent" class="mcap-scroll-container"></div>
            </div>
        `;
        document.body.appendChild(dialog);
    }
    dialog.showModal();
    const content = document.getElementById('mcapDialogContent');

    // Reset MCAP button tooltip when modal is opened
    const mcapButton = document.getElementById('mcapDialogBtn');
    if (mcapButton) {
        const mcapTooltip = mcapButton.querySelector('.mcap-tooltip');
        if (mcapTooltip) {
            mcapTooltip.classList.remove('show');
        }
    }

    // Synchronize replay status with server and localStorage before showing content
    try {
        const replayResponse = await fetch('/replay-status');
        const statusText = await replayResponse.text();
        const isReplayRunning = statusText.trim() === "Replay is running";

        // Load state from localStorage
        const savedState = localStorage.getItem('mcapReplayState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                // If server says replay is running, use the saved file name
                if (isReplayRunning && state.isPlaying && state.currentPlayingFile) {
                    window.isPlaying = true;
                    window.currentPlayingFile = state.currentPlayingFile;
                } else if (!isReplayRunning) {
                    // If server says replay is not running, clear the state
                    window.isPlaying = false;
                    window.currentPlayingFile = null;
                    localStorage.removeItem('mcapReplayState');
                }
            } catch (error) {
                console.error('Error parsing saved replay state:', error);
                // Fallback to server state
                window.isPlaying = isReplayRunning;
                if (!isReplayRunning) {
                    window.currentPlayingFile = null;
                }
            }
        } else {
            // No saved state, use server state
            window.isPlaying = isReplayRunning;
            if (!isReplayRunning) {
                window.currentPlayingFile = null;
            }
        }
    } catch (error) {
        console.error('Error checking replay status:', error);
        // Fallback to current global state
    }

    // Close existing socket if any
    if (mcapSocket) {
        mcapSocket.close();
        mcapSocket = null;
        window.mcapSocket = null;
    }

    try {
        // Create WebSocket connection
        mcapSocket = new WebSocket('/mcap/');
        window.mcapSocket = mcapSocket;

        mcapSocket.onopen = () => {
            mcapSocket.send(JSON.stringify({ action: 'list_files' }));
        };

        mcapSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.error) {
                    content.innerHTML = `<div class="text-red-600">Error: ${data.error}</div>`;
                    return;
                }
                const files = data.files || [];
                const dirName = data.dir_name || '';
                // Add a custom CSS rule to force no margin/padding above the directory label
                if (!document.getElementById('mcap-dir-label-style')) {
                    const style = document.createElement('style');
                    style.id = 'mcap-dir-label-style';
                    style.innerHTML = `
                        .mcap-dir-label { margin-top: 0 !important; padding-top: 0 !important; margin-bottom: 0.25rem !important; font-size: 1.08rem !important; font-weight: 500 !important; }
                        #mcapDialogContent { margin-top: 0 !important; padding-top: 0 !important; }
                    `;
                    document.head.appendChild(style);
                }
                const header = dialog.querySelector('div[style*="border-bottom"]');
                if (header) {
                    header.style.paddingBottom = '0';
                    header.style.marginBottom = '0';
                }
                content.style.marginTop = '0';
                content.style.paddingTop = '0';
                // Update directory path in header
                const dirPathElement = document.querySelector('.mcap-dir-path');
                if (dirPathElement && dirName) {
                    dirPathElement.textContent = dirName;
                }

                // Setup directory copy button
                const dirCopyBtn = document.querySelector('.mcap-dir-copy-btn');
                if (dirCopyBtn && dirName) {
                    dirCopyBtn.onclick = () => {
                        navigator.clipboard.writeText(dirName);
                        // Show brief feedback
                        const originalText = dirCopyBtn.innerHTML;
                        dirCopyBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
                        setTimeout(() => {
                            dirCopyBtn.innerHTML = originalText;
                        }, 1000);
                    };
                }
                let tableHTML = '';
                const headerControls = document.getElementById('mcapHeaderControls');
                if (files.length === 0) {
                    tableHTML = `<div class=\"text-gray-600 text-center py-4\">No MCAP recordings found</div>`;
                    if (headerControls) headerControls.innerHTML = '';
                } else {
                    files.sort((a, b) => new Date(b.created) - new Date(a.created));
                    // Populate header controls
                    if (headerControls) {
                        headerControls.innerHTML = `
                            <div class="mcap-header-toolbar">
                                <label class="mcap-checkbox-label">
                                    <input type="checkbox" id="mcap-select-all" class="mcap-checkbox">
                                    <span>Select All</span>
                                </label>
                                <button id="mcap-delete-selected" class="mcap-btn-secondary mcap-btn-sm" disabled title="Delete all selected files">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                    <span>Delete</span>
                                    <span id="mcap-selected-count" class="mcap-count-badge"></span>
                                </button>
                                <div class="mcap-search-wrap mcap-search-compact">
                                    <svg class="mcap-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                    </svg>
                                    <input type="text" id="mcap-search" class="mcap-search" placeholder="Search...">
                                    <button id="mcap-search-clear" class="mcap-search-clear" title="Clear search">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>
                                <button onclick="switchToLive()" class="mcap-btn-primary mcap-btn-sm" title="Switch to Live Mode (restarts device)">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                    </svg>
                                    <span>Live Mode</span>
                                </button>
                            </div>
                        `;
                    }
                    tableHTML = `
                        <table class="mcap-table">
                            <thead>
                                <tr>
                                    <th style="text-align:center; width:2.5rem;"></th>
                                    <th style="width:3.5rem;">Play</th>
                                    <th>File Name</th>
                                    <th style="width:6rem;">Size</th>
                                    <th style="width:10rem;">Date/Time</th>
                                    <th style="text-align:center; width:10rem;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="mcap-table-body">
                                ${files.map(file => {
                        const date = file.created ? new Date(file.created) : null;
                        const dateStr = date ? date.toLocaleDateString() : '--';
                        const timeStr = date ? date.toLocaleTimeString() : '';
                        const isCurrentlyPlaying = window.currentPlayingFile === file.name && window.isPlaying;
                        return `
                                <tr class="mcap-row-card" data-filename="${file.name}">
                                    <td style="text-align:center; width:2.5rem;"><input type="checkbox" class="mcap-select-checkbox" data-filename="${file.name}"></td>
                                    <td style="text-align:center; width:3.5rem;">
                                        <button class="mcap-action-btn mcap-play-btn ${isCurrentlyPlaying ? 'mcap-btn-red' : 'mcap-btn-blue'}" title="${isCurrentlyPlaying ? 'Stop' : 'Play'}" data-filename="${file.name}" data-dirname="${dirName}">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 1.25rem; height: 1.25rem;">
                                                ${isCurrentlyPlaying
                                ? '<rect x="7" y="7" width="10" height="10" rx="2"/>'
                                : '<path d="M8 5v14l11-7z"/>'}
                                            </svg>
                                        </button>
                                    </td>
                                    <td style="max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#222; font-weight:600;">${file.name}</td>
                                    <td style="color:#555;">${file.size} MB</td>
                                    <td style="color:#555;">${dateStr} <span style='color:#888;'>${timeStr}</span></td>
                                    <td style="text-align:center;">
                                        <div style="display:flex; gap:0.5rem; justify-content:center; align-items:center;">
                                            <button class="mcap-action-btn mcap-info-btn mcap-btn-blue" title="Info" data-topics='${JSON.stringify(file.topics)}' data-fileinfo='${JSON.stringify({ name: file.name, size: file.size })}'>
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 1.15rem; height: 1.15rem;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                                            </button>
                                            <a class="mcap-action-btn mcap-btn-green" href="/download/${dirName}/${file.name}" title="Download">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 1.25rem; height: 1.25rem;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                                            </a>
                                            <button class="mcap-action-btn mcap-upload-btn mcap-btn-purple" title="Upload to Studio" data-filename="${file.name}" data-dirname="${dirName}">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 1.25rem; height: 1.25rem;"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                                            </button>
                                            <button class="mcap-action-btn mcap-delete-btn mcap-btn-red" title="Delete" data-filename="${file.name}" data-dirname="${dirName}">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="width: 1.25rem; height: 1.25rem;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                `;
                    }).join('')}
                            </tbody>
                        </table>
                    `;
                }
                content.innerHTML = tableHTML;
                attachMcapTableListeners(dirName);
            } catch (error) {
                content.innerHTML = `<div class=\"text-red-600\">Error parsing server response</div>`;
            }
        };
        mcapSocket.onerror = () => {
            content.innerHTML = `<div class=\"text-red-600\">Error connecting to server</div>`;
        };
        mcapSocket.onclose = () => { mcapSocket = null; window.mcapSocket = null; };
    } catch (error) {
        content.innerHTML = `<div class=\"text-red-600\">Error connecting to server</div>`;
    }

    // --- Storage Info Bar Logic ---
    async function fetchStorageInfo() {
        try {
            const response = await fetch(`/check-storage`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching storage info:', error);
            return null;
        }
    }
    function renderStorageBar(info) {
        const el = document.getElementById('mcapStorageInfoBar');
        if (!el) return;
        if (!info || !info.exists) {
            return;
        }
        const availObj = info.available_space;
        const totalObj = info.total_space;
        const availValue = availObj && typeof availObj === 'object' ? availObj.value : 0;
        const availUnit = availObj && typeof availObj === 'object' ? availObj.unit : '';
        const totalValue = totalObj && typeof totalObj === 'object' ? totalObj.value : 0;
        const totalUnit = totalObj && typeof totalObj === 'object' ? totalObj.unit : '';
        let availValueConverted = availValue;
        if (availUnit !== totalUnit) {
            const unitMap = { MB: 1, GB: 1024, TB: 1024 * 1024 };
            const aUnit = availUnit.toUpperCase();
            const tUnit = totalUnit.toUpperCase();
            if (unitMap[aUnit] && unitMap[tUnit]) {
                availValueConverted = availValue * (unitMap[aUnit] / unitMap[tUnit]);
            } else {
                console.warn('Unknown disk space units, cannot convert', { availUnit, totalUnit });
                availValueConverted = 0;
            }
        }
        let usedValue = totalValue - availValueConverted;
        if (usedValue < 0) {
            console.log('Available space is greater than total space. Clamping usedValue to 0.', { totalValue, availValue: availValueConverted, usedValue });
            usedValue = 0;
        }
        let usedPercent = totalValue > 0 ? (usedValue / totalValue) * 100 : 0;
        if (usedPercent < 0) usedPercent = 0;
        if (usedPercent > 100) usedPercent = 100;
        const warning = usedPercent > 80 ? `<span class='ml-1 text-red-600 font-semibold' title='Low disk space'>⚠️</span>` : '';

        el.innerHTML = `
      <div class="mcap-storage-display" title="${usedValue.toFixed(2)} ${availUnit} used of ${totalValue.toFixed(2)} ${totalUnit} total">
        <div class="mcap-storage-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3v18h18V7.83L16.17 3H3zm2 2h10v4H5V5zm0 6h14v8H5v-8zm2 2v4h2v-4H7zm4 0v4h2v-4h-2z"/>
          </svg>
        </div>
        <div class="mcap-storage-content">
          <div class="mcap-storage-header">
            <span class="mcap-storage-label">Disk</span>
            <span class="mcap-storage-percent">(${usedPercent.toFixed(1)}% used)</span>
          </div>
          <div class="mcap-storage-bar">
            <div class="mcap-storage-progress" style="width:${usedPercent}%;"></div>
          </div>
          <div class="mcap-storage-amount">
            <span>${availValueConverted.toFixed(2)} ${totalUnit} free</span>
          </div>
        </div>
      </div>
    `;
    }
    const info = await fetchStorageInfo();
    renderStorageBar(info);
    // --- End Storage Info Bar Logic ---

    function attachMcapTableListeners(dirName) {
        const selectAll = document.getElementById('mcap-select-all');
        const deleteBtn = document.getElementById('mcap-delete-selected');
        const tableBody = document.getElementById('mcap-table-body');
        const searchInput = document.getElementById('mcap-search');
        const searchClear = document.getElementById('mcap-search-clear');
        const selectedCount = document.getElementById('mcap-selected-count');
        function visibleCheckboxes() {
            return Array.from(document.querySelectorAll('.mcap-select-checkbox')).filter(cb => {
                const row = cb.closest('.mcap-row-card');
                return row && row.style.display !== 'none';
            });
        }
        function showToast(msg) {
            let toast = document.getElementById('mcap-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'mcap-toast';
                toast.className = 'mcap-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '0.97';
            toast.style.display = 'block';
            setTimeout(() => { toast.style.opacity = '0'; }, 1800);
            setTimeout(() => { toast.style.display = 'none'; }, 2200);
        }
        function showSpinner() {
            let overlay = document.getElementById('mcap-spinner-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'mcap-spinner-overlay';
                overlay.className = 'mcap-spinner-overlay';
                overlay.innerHTML = '<div class="mcap-spinner"></div>';
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'flex';
        }
        function hideSpinner() {
            const overlay = document.getElementById('mcap-spinner-overlay');
            if (overlay) overlay.style.display = 'none';
        }
        function updateDeleteBtnState() {
            if (!deleteBtn) return;
            const checked = visibleCheckboxes().filter(cb => cb.checked);
            deleteBtn.disabled = checked.length === 0;
            if (selectedCount) {
                if (checked.length > 0) {
                    selectedCount.textContent = `${checked.length}`;
                    selectedCount.style.display = '';
                } else {
                    selectedCount.textContent = '';
                    selectedCount.style.display = 'none';
                }
            }
        }
        function updateRowHighlight() {
            Array.from(document.querySelectorAll('.mcap-select-checkbox')).forEach(cb => {
                const row = cb.closest('.mcap-row-card');
                if (row) row.classList.toggle('selected', cb.checked);
            });
        }
        if (selectAll) {
            selectAll.onchange = function () {
                visibleCheckboxes().forEach(cb => cb.checked = this.checked);
                updateDeleteBtnState();
                updateRowHighlight();
            };
        }
        if (tableBody) {
            tableBody.onchange = function (e) {
                if (e.target.classList.contains('mcap-select-checkbox')) {
                    updateDeleteBtnState();
                    updateRowHighlight();
                    if (!e.target.checked && selectAll) selectAll.checked = false;
                    if (visibleCheckboxes().every(cb => cb.checked) && selectAll) selectAll.checked = true;
                }
            };
        }
        if (deleteBtn) {
            deleteBtn.onclick = async function () {
                const selected = visibleCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-filename'));
                if (selected.length === 0) {
                    alert('No files selected.');
                    return;
                }
                if (!confirm(`Delete ${selected.length} selected file(s)?`)) return;
                showSpinner();
                // Temporarily override window.confirm to always return true for deleteFile
                const originalConfirm = window.confirm;
                window.confirm = () => true;
                for (const filename of selected) {
                    await new Promise(resolve => { deleteFile(filename, dirName); setTimeout(resolve, 120); });
                }
                window.confirm = originalConfirm;
                setTimeout(() => {
                    hideSpinner();
                    showToast(`${selected.length} file${selected.length > 1 ? 's' : ''} deleted.`);
                    if (typeof showMcapDialog === 'function') showMcapDialog();
                }, 400);
            };
        }
        if (searchInput && searchClear) {
            searchInput.oninput = function () {
                const val = this.value.toLowerCase();
                Array.from(document.querySelectorAll('.mcap-select-checkbox')).forEach(cb => {
                    const row = cb.closest('.mcap-row-card');
                    if (!row) return;
                    const filename = cb.getAttribute('data-filename') || '';
                    row.style.display = filename.toLowerCase().includes(val) ? '' : 'none';
                });
                if (selectAll) selectAll.checked = false;
                updateDeleteBtnState();
                updateRowHighlight();
                searchClear.style.display = val ? 'block' : 'none';
            };
            searchClear.onclick = function () {
                searchInput.value = '';
                searchInput.oninput();
                searchClear.style.display = 'none';
            };
        }
        
        // Event delegation for action buttons (XSS protection)
        if (tableBody) {
            tableBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                
                // Play/Stop button
                if (btn.classList.contains('mcap-play-btn')) {
                    const filename = btn.getAttribute('data-filename');
                    const dirname = btn.getAttribute('data-dirname');
                    if (filename && dirname) {
                        togglePlayMcap(filename, dirname);
                    }
                }
                // Info button
                else if (btn.classList.contains('mcap-info-btn')) {
                    const topics = btn.getAttribute('data-topics');
                    const fileinfo = btn.getAttribute('data-fileinfo');
                    if (topics && fileinfo) {
                        try {
                            showModal(JSON.parse(topics), JSON.parse(fileinfo));
                        } catch (e) {
                            console.error('Error parsing button data:', e);
                        }
                    }
                }
                // Upload button
                else if (btn.classList.contains('mcap-upload-btn')) {
                    const filename = btn.getAttribute('data-filename');
                    const dirname = btn.getAttribute('data-dirname');
                    if (filename && dirname) {
                        showUploadOptionsDialog(filename, dirname);
                    }
                }
                // Delete button
                else if (btn.classList.contains('mcap-delete-btn')) {
                    const filename = btn.getAttribute('data-filename');
                    const dirname = btn.getAttribute('data-dirname');
                    if (filename && dirname) {
                        deleteFile(filename, dirname);
                    }
                }
            });
        }
        
        updateDeleteBtnState();
        updateRowHighlight();
    }
};

window.hideMcapDialog = function () {
    const dialog = document.getElementById('mcapDialog');
    if (dialog) {
        dialog.close();
    }
    if (mcapSocket) {
        mcapSocket.close();
        mcapSocket = null;
        window.mcapSocket = null;
    }

    // Reset MCAP button tooltip
    const mcapButton = document.getElementById('mcapDialogBtn');
    if (mcapButton) {
        const mcapTooltip = mcapButton.querySelector('.mcap-tooltip');
        if (mcapTooltip) {
            mcapTooltip.classList.remove('show');
        }
    }
};

// Play options modal functions
window.showPlayOptionsModal = function (fileName, directory) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('playOptionsModal');
    if (!modal) {
        modal = document.createElement('dialog');
        modal.id = 'playOptionsModal';
        modal.className = 'rounded-lg shadow-lg';
        document.body.appendChild(modal);
    }

    // Get device name to determine if it's Maivin
    fetch('/config/webui/details')
        .then(response => response.json())
        .then(deviceData => {
            const isMaivin = deviceData.DEVICE?.toLowerCase().includes('maivin');

            modal.innerHTML = `
                <div class="bg-white p-8 rounded-xl max-w-md w-full">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-2xl font-semibold text-gray-800">Play Options</h2>
                        <button onclick="closePlayOptionsModal()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-gray-500">File Name:</span>
                                <span class="text-sm font-medium text-gray-900 truncate ml-4 max-w-[200px]">${fileName}</span>
                            </div>
                        </div>

                        <div class="space-y-6">
                            ${!isMaivin ? `
                                <div class="space-y-2">
                                    <label class="text-sm font-medium text-gray-700">Fusion</label>
                                    <div class="inline-flex w-full rounded-lg shadow-sm" role="group">
                                        <button type="button" 
                                            class="fusion-btn flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#4285f4] rounded-l-lg active hover:bg-blue-600" 
                                            data-value="live">
                                            Live
                                        </button>
                                        <button type="button" 
                                            class="fusion-btn flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-r-lg hover:bg-gray-200 transition-colors" 
                                            data-value="mcap">
                                            MCAP
                                        </button>
                                    </div>
                                </div>
                            ` : ''}

                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-700">Model</label>
                                <div class="inline-flex w-full rounded-lg shadow-sm" role="group">
                                    <button type="button" 
                                        class="model-btn flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#4285f4] rounded-l-lg active hover:bg-blue-600" 
                                        data-value="live">
                                        Live
                                    </button>
                                    <button type="button" 
                                        class="model-btn flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-r-lg hover:bg-gray-200 transition-colors" 
                                        data-value="mcap">
                                        MCAP
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8 flex justify-end space-x-3">
                            <button onclick="closePlayOptionsModal()" 
                                class="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                            <button onclick="startPlaybackFromModal()" 
                                class="px-4 py-2 text-sm font-medium text-white bg-[#4285f4] rounded-lg hover:bg-blue-600 transition-colors">
                                Start
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Setup button groups
            const fusionBtns = modal.querySelectorAll('.fusion-btn');
            const modelBtns = modal.querySelectorAll('.model-btn');

            function setupButtonGroup(buttons) {
                buttons.forEach(btn => {
                    btn.addEventListener('click', function () {
                        buttons.forEach(b => {
                            b.classList.remove('active', 'bg-[#4285f4]', 'text-white');
                            b.classList.add('bg-gray-100', 'text-gray-600');
                        });
                        this.classList.remove('bg-gray-100', 'text-gray-600');
                        this.classList.add('active', 'bg-[#4285f4]', 'text-white');
                    });
                });
            }

            setupButtonGroup(fusionBtns);
            setupButtonGroup(modelBtns);

            // Store file info for later use
            modal.dataset.fileName = fileName;
            modal.dataset.directory = directory;

            modal.showModal();
        })
        .catch(error => {
            console.error('Error fetching device info:', error);
            // Fallback to showing modal without device-specific options
            modal.innerHTML = `
                <div class="bg-white p-8 rounded-xl max-w-md w-full">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-2xl font-semibold text-gray-800">Play Options</h2>
                        <button onclick="closePlayOptionsModal()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <span class="text-sm text-gray-500">File Name:</span>
                                <span class="text-sm font-medium text-gray-900 truncate ml-4 max-w-[200px]">${fileName}</span>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <div class="space-y-2">
                                <label class="text-sm font-medium text-gray-700">Model</label>
                                <div class="inline-flex w-full rounded-lg shadow-sm" role="group">
                                    <button type="button" 
                                        class="model-btn flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#4285f4] rounded-l-lg active hover:bg-blue-600" 
                                        data-value="live">
                                        Live
                                    </button>
                                    <button type="button" 
                                        class="model-btn flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-r-lg hover:bg-gray-200 transition-colors" 
                                        data-value="mcap">
                                        MCAP
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8 flex justify-end space-x-3">
                            <button onclick="closePlayOptionsModal()" 
                                class="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                            <button onclick="startPlaybackFromModal()" 
                                class="px-4 py-2 text-sm font-medium text-white bg-[#4285f4] rounded-lg hover:bg-blue-600 transition-colors">
                                Start
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const modelBtns = modal.querySelectorAll('.model-btn');
            function setupButtonGroup(buttons) {
                buttons.forEach(btn => {
                    btn.addEventListener('click', function () {
                        buttons.forEach(b => {
                            b.classList.remove('active', 'bg-[#4285f4]', 'text-white');
                            b.classList.add('bg-gray-100', 'text-gray-600');
                        });
                        this.classList.remove('bg-gray-100', 'text-gray-600');
                        this.classList.add('active', 'bg-[#4285f4]', 'text-white');
                    });
                });
            }
            setupButtonGroup(modelBtns);

            modal.dataset.fileName = fileName;
            modal.dataset.directory = directory;

            modal.showModal();
        });
};

window.closePlayOptionsModal = function () {
    const modal = document.getElementById('playOptionsModal');
    if (modal) {
        modal.close();
    }
};

window.startPlaybackFromModal = function () {
    const modal = document.getElementById('playOptionsModal');
    const fileName = modal.dataset.fileName;
    const directory = modal.dataset.directory;

    // Get device name to determine if it's Maivin
    fetch('/config/webui/details')
        .then(response => response.json())
        .then(deviceData => {
            const isMaivin = deviceData.DEVICE?.toLowerCase().includes('maivin');

            // Get selected options
            const fusionIsLive = isMaivin ? true : modal.querySelector('.fusion-btn[data-value="live"]')?.classList.contains('active') || false;
            const modelIsLive = modal.querySelector('.model-btn[data-value="live"]')?.classList.contains('active') || false;

            const config = {
                fileName: "replay",
                MCAP: `${directory}/${fileName}`,
                IGNORE_TOPICS: ""
            };

            let ignoreTopics = [];
            if (fusionIsLive) ignoreTopics.push("/fusion/*");
            if (modelIsLive) ignoreTopics.push("/model/*");
            config.IGNORE_TOPICS = ignoreTopics.join(" ");

            fetch('/config/replay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                    return response.text();
                })
                .then(() => {
                    return fetch('/replay', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            file: fileName,
                            directory: directory,
                            dataSource: fusionIsLive ? 'live' : 'mcap',
                            model: modelIsLive ? 'live' : 'mcap'
                        })
                    });
                })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                    return response.text();
                })
                .then(() => {
                    window.isPlaying = true;
                    window.currentPlayingFile = fileName;
                    // Save state to localStorage
                    localStorage.setItem('mcapReplayState', JSON.stringify({
                        isPlaying: true,
                        currentPlayingFile: fileName
                    }));
                    modal.close();
                    // Refresh the table
                    if (typeof showMcapDialog === 'function') showMcapDialog();
                    else if (typeof listMcapFiles === 'function') listMcapFiles();
                })
                .catch(error => {
                    console.error('Error starting playback:', error);
                    alert(`Error starting playback: ${error.message}`);
                });
        })
        .catch(error => {
            console.error('Error fetching device info:', error);
            alert('Error starting playback: Could not determine device type');
        });
};

// Add styles for the MCAP dialog buttons
(function () {
    // Remove existing style if it exists
    const existingStyle = document.getElementById('mcap-dialog-styles');
    if (existingStyle) {
        existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'mcap-dialog-styles';
    style.innerHTML = `
.mcap-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    gap: 1rem;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 10;
}
.mcap-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
}
.mcap-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
    letter-spacing: -0.025em;
    white-space: nowrap;
}
.mcap-header-center {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: center;
    min-width: 0;
}
.mcap-header-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
}
.mcap-btn-sm {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
}
.mcap-btn-sm svg {
    width: 0.875rem;
    height: 0.875rem;
}
.mcap-search-compact {
    min-width: 180px;
    max-width: 220px;
}
.mcap-search-compact .mcap-search {
    padding: 0.35rem 0.75rem 0.35rem 2rem;
    font-size: 0.8rem;
}
}
.mcap-directory {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.mcap-dir-text {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
}
.mcap-dir-path {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    color: #374151;
    font-weight: 600;
}
.mcap-dir-copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: #f3f4f6;
    border-radius: 4px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
}
.mcap-dir-copy-btn:hover {
    background: #e5e7eb;
    color: #374151;
}
.mcap-header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.mcap-storage-info {
    min-width: 220px;
    max-width: 320px;
}
.mcap-storage-display {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    font-size: 0.8rem;
}
.mcap-storage-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    background: #dbeafe;
    border-radius: 4px;
    color: #2563eb;
}
.mcap-storage-content {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
}
.mcap-storage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3rem;
}
.mcap-storage-label {
    font-weight: 600;
    color: #1e293b;
    font-size: 0.8rem;
}
.mcap-storage-percent {
    font-size: 0.7rem;
    color: #6b7280;
}
.mcap-storage-bar {
    position: relative;
    width: 100%;
    height: 0.4rem;
    background: #e5e7eb;
    border-radius: 9999px;
    overflow: hidden;
}
.mcap-storage-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: 9999px;
    transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    background: #22c55e;
}
.mcap-storage-amount {
    display: flex;
    justify-content: flex-end;
    font-size: 0.7rem;
    font-weight: 600;
    color: #22c55e;
    white-space: nowrap;
}
.mcap-storage-directory {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.2rem;
    padding-top: 0.2rem;
    border-top: 1px solid #f3f4f6;
    font-size: 0.7rem;
    color: #6b7280;
}
.mcap-storage-directory .mcap-dir-text {
    font-size: 0.7rem;
    color: #6b7280;
}
.mcap-storage-directory .mcap-dir-copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border: none;
    background: #f3f4f6;
    border-radius: 2px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
}
.mcap-storage-directory .mcap-dir-copy-btn:hover {
    background: #e5e7eb;
    color: #374151;
}
.mcap-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: #f3f4f6;
    border-radius: 8px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
}
.mcap-close-btn:hover {
    background: #e5e7eb;
    color: #374151;
}
.mcap-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin: 0 0 1.5rem 0;
    padding: 1rem 1.5rem;
    background: #fff;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    width: 100%;
}
.mcap-toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.mcap-checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    user-select: none;
}
.mcap-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: #3b82f6;
}
.mcap-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.mcap-btn-primary:hover {
    background: #2563eb;
    transform: translateY(-1px);
}
.mcap-btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.mcap-btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
    border-color: #d1d5db;
}
.mcap-btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f9fafb;
    color: #9ca3af;
}
.mcap-count-badge {
    display: none;
    font-size: 0.75rem;
    font-weight: 600;
    color: #3b82f6;
    margin-left: 0.25rem;
}
.mcap-count-badge:not(:empty) {
    display: inline;
}
.mcap-search-container {
    flex: 1;
    display: flex;
    justify-content: center;
}
.mcap-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 300px;
}
.mcap-search-icon {
    position: absolute;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: #9ca3af;
    pointer-events: none;
}
.mcap-search {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem 1rem 0.5rem 2.5rem;
    font-size: 0.875rem;
    outline: none;
    background: #fff;
    transition: all 0.2s ease;
}
.mcap-search:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.1);
}
.mcap-search-clear {
    position: absolute;
    right: 0.5rem;
    display: none;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: #f3f4f6;
    border-radius: 4px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s ease;
}
.mcap-search-clear:hover {
    background: #e5e7eb;
    color: #374151;
}
.mcap-scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.75rem 1.5rem 1.5rem 1.5rem;
}
.mcap-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 0.5rem;
    font-size: 1.05rem;
}
.mcap-table thead {
    position: sticky;
    top: -0.75rem;
    z-index: 10;
}
.mcap-table thead th {
    background: #f3f4f6;
    font-weight: 700;
    color: #222;
    padding: 0.75rem 0.7rem;
    text-align: left;
    border-bottom: 2px solid #e5e7eb;
    box-shadow: 0 -1rem 0 0 #f3f4f6;
}
.mcap-row-card {
    background: #fff;
    border-radius: 0.8rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transition: box-shadow 0.18s, background 0.18s;
    color: #222;
}
.mcap-row-card.selected {
    background: #e0e7ff !important;
    box-shadow: 0 4px 16px rgba(66,133,244,0.13);
    border-left: 4px solid #4285f4;
}
.mcap-row-card td {
    padding: 0.7rem 0.7rem;
    vertical-align: middle;
}
.mcap-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 9999px;
    border: none;
    outline: none;
    cursor: pointer;
    font-size: 1.1rem;
    margin: 0 0.1rem;
    background: #f3f4f6;
    color: #555;
    transition: background 0.15s, color 0.15s;
    position: relative;
}
.mcap-action-btn:hover {
    background: #e0e7ff;
    color: #4285f4;
}
.mcap-action-btn[title]:hover:after {
    content: attr(title);
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: -2.2rem;
    background: #222;
    color: #fff;
    padding: 0.25rem 0.7rem;
    border-radius: 0.4rem;
    font-size: 0.92rem;
    white-space: nowrap;
    z-index: 10;
    opacity: 0.95;
    pointer-events: none;
}

.mcap-dir-label {
    margin-top: 0 !important;
    padding-top: 0 !important;
    margin-bottom: 0.25rem !important;
    font-size: 1.08rem !important;
    font-weight: 500 !important;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.mcap-dir-copy {
    background: #f3f4f6;
    border-radius: 0.4rem;
    border: none;
    color: #555;
    font-size: 1.1rem;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    margin-left: 0.2rem;
    transition: background 0.15s;
}
.mcap-dir-copy:hover {
    background: #e0e7ff;
    color: #4285f4;
}
.mcap-btn-green {
    background: #34a853 !important;
    color: #fff !important;
}
.mcap-btn-green:hover {
    background: #2d9248 !important;
    color: #fff !important;
}
.mcap-btn-red {
    background: #dc3545 !important;
    color: #fff !important;
}
.mcap-btn-red:hover {
    background: #b52a37 !important;
    color: #fff !important;
}
.mcap-btn-blue {
    background: #4285f4 !important;
    color: #fff !important;
}
.mcap-btn-blue:hover {
    background: #3367d6 !important;
    color: #fff !important;
}
.mcap-btn-purple {
    background: #E8B820 !important;
    color: #222 !important;
}
.mcap-btn-purple:hover {
    background: #d4a41c !important;
    color: #222 !important;
}
.mcap-toast {
    position: fixed;
    left: 50%;
    bottom: 2.5rem;
    transform: translateX(-50%);
    background: #222;
    color: #fff;
    padding: 0.9rem 2.2rem;
    border-radius: 1.2rem;
    font-size: 1.08rem;
    font-weight: 500;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    z-index: 9999;
    opacity: 0.97;
    pointer-events: none;
    transition: opacity 0.3s;
}
.mcap-spinner-overlay {
    position: fixed;
    left: 0; top: 0; right: 0; bottom: 0;
    background: rgba(255,255,255,0.45);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mcap-spinner {
    border: 4px solid #e5e7eb;
    border-top: 4px solid #4285f4;
    border-radius: 50%;
    width: 2.5rem;
    height: 2.5rem;
    animation: mcap-spin 1s linear infinite;
}
@keyframes mcap-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.mcap-search-clear {
    position: absolute;
    right: 1.2rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    display: none;
    z-index: 2;
}
.mcap-search-wrap { position: relative; display: inline-block; }

/* Dark Mode Styles for MCAP Dialog */
[data-theme="dark"] .modal-box,
[data-theme="dark"] #mcapDialog .modal-box {
    background: #252033;
    color: #f6f7f8;
}
[data-theme="dark"] .mcap-header {
    background: linear-gradient(135deg, #2d2740 0%, #252033 100%);
    border-bottom-color: rgba(255, 255, 255, 0.1);
}
[data-theme="dark"] .mcap-title {
    color: #E6E6FA;
}
[data-theme="dark"] .mcap-directory,
[data-theme="dark"] .mcap-storage-display {
    background: #2d2740;
    border-color: rgba(255, 255, 255, 0.1);
}
[data-theme="dark"] .mcap-dir-text,
[data-theme="dark"] .mcap-storage-label {
    color: #c9c5d4;
}
[data-theme="dark"] .mcap-dir-path {
    color: #E6E6FA;
}
[data-theme="dark"] .mcap-dir-copy-btn,
[data-theme="dark"] .mcap-close-btn {
    background: #3d3650;
    color: #c9c5d4;
}
[data-theme="dark"] .mcap-dir-copy-btn:hover,
[data-theme="dark"] .mcap-close-btn:hover {
    background: #4a4560;
    color: #E6E6FA;
}
[data-theme="dark"] .mcap-toolbar {
    background: #2d2740;
    border-color: rgba(255, 255, 255, 0.1);
}
[data-theme="dark"] .mcap-header-toolbar {
    background: transparent;
}
[data-theme="dark"] .mcap-checkbox-label {
    color: #c9c5d4;
}
[data-theme="dark"] .mcap-btn-secondary {
    background: #3d3650;
    color: #c9c5d4;
    border-color: rgba(255, 255, 255, 0.1);
}
[data-theme="dark"] .mcap-btn-secondary:hover:not(:disabled) {
    background: #4a4560;
    border-color: rgba(255, 255, 255, 0.2);
}
[data-theme="dark"] .mcap-btn-secondary:disabled {
    background: #2d2740;
    color: #6b6580;
}
[data-theme="dark"] .mcap-search {
    background: #2d2740;
    border-color: rgba(255, 255, 255, 0.1);
    color: #f6f7f8;
}
[data-theme="dark"] .mcap-search::placeholder {
    color: #9690a8;
}
[data-theme="dark"] .mcap-search:focus {
    border-color: #E8B820;
    box-shadow: 0 0 0 2px rgba(232, 184, 32, 0.2);
}
[data-theme="dark"] .mcap-search-icon {
    color: #9690a8;
}
[data-theme="dark"] .mcap-search-clear {
    color: #9690a8;
}
[data-theme="dark"] .mcap-table thead th {
    background: #2d2740;
    color: #E6E6FA;
    border-bottom-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 -1rem 0 0 #2d2740;
}
[data-theme="dark"] .mcap-row-card {
    background: #2d2740;
    color: #f6f7f8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
[data-theme="dark"] .mcap-row-card:hover {
    background: #3d3650;
}
[data-theme="dark"] .mcap-row-card.selected {
    background: #3d3650 !important;
    border-left-color: #E8B820;
}
[data-theme="dark"] .mcap-row-card td {
    color: #c9c5d4;
}
[data-theme="dark"] .mcap-row-card td[style*="color:#222"],
[data-theme="dark"] .mcap-row-card td[style*="font-weight:600"] {
    color: #E6E6FA !important;
}
[data-theme="dark"] .mcap-row-card td[style*="color:#555"],
[data-theme="dark"] .mcap-row-card td span[style*="color:#888"] {
    color: #9690a8 !important;
}
[data-theme="dark"] .mcap-action-btn {
    background: #3d3650;
    color: #c9c5d4;
}
[data-theme="dark"] .mcap-action-btn:hover {
    background: #4a4560;
    color: #E6E6FA;
}
[data-theme="dark"] .mcap-storage-bar {
    background: #3d3650;
}
[data-theme="dark"] .mcap-storage-percent {
    color: #9690a8;
}
[data-theme="dark"] .mcap-storage-directory {
    border-top-color: rgba(255, 255, 255, 0.1);
    color: #9690a8;
}
[data-theme="dark"] .mcap-spinner-overlay {
    background: rgba(26, 22, 37, 0.7);
}
[data-theme="dark"] .mcap-spinner {
    border-color: #3d3650;
    border-top-color: #E8B820;
}
[data-theme="dark"] .text-gray-600 {
    color: #9690a8 !important;
}

/* Auto theme dark mode support */
@media (prefers-color-scheme: dark) {
    [data-theme="auto"] .modal-box,
    [data-theme="auto"] #mcapDialog .modal-box {
        background: #252033;
        color: #f6f7f8;
    }
    [data-theme="auto"] .mcap-header {
        background: linear-gradient(135deg, #2d2740 0%, #252033 100%);
        border-bottom-color: rgba(255, 255, 255, 0.1);
    }
    [data-theme="auto"] .mcap-title {
        color: #E6E6FA;
    }
    [data-theme="auto"] .mcap-directory,
    [data-theme="auto"] .mcap-storage-display {
        background: #2d2740;
        border-color: rgba(255, 255, 255, 0.1);
    }
    [data-theme="auto"] .mcap-dir-text,
    [data-theme="auto"] .mcap-storage-label {
        color: #c9c5d4;
    }
    [data-theme="auto"] .mcap-dir-path {
        color: #E6E6FA;
    }
    [data-theme="auto"] .mcap-dir-copy-btn,
    [data-theme="auto"] .mcap-close-btn {
        background: #3d3650;
        color: #c9c5d4;
    }
    [data-theme="auto"] .mcap-dir-copy-btn:hover,
    [data-theme="auto"] .mcap-close-btn:hover {
        background: #4a4560;
        color: #E6E6FA;
    }
    [data-theme="auto"] .mcap-toolbar {
        background: #2d2740;
        border-color: rgba(255, 255, 255, 0.1);
    }
    [data-theme="auto"] .mcap-header-toolbar {
        background: transparent;
    }
    [data-theme="auto"] .mcap-checkbox-label {
        color: #c9c5d4;
    }
    [data-theme="auto"] .mcap-btn-secondary {
        background: #3d3650;
        color: #c9c5d4;
        border-color: rgba(255, 255, 255, 0.1);
    }
    [data-theme="auto"] .mcap-btn-secondary:hover:not(:disabled) {
        background: #4a4560;
        border-color: rgba(255, 255, 255, 0.2);
    }
    [data-theme="auto"] .mcap-btn-secondary:disabled {
        background: #2d2740;
        color: #6b6580;
    }
    [data-theme="auto"] .mcap-search {
        background: #2d2740;
        border-color: rgba(255, 255, 255, 0.1);
        color: #f6f7f8;
    }
    [data-theme="auto"] .mcap-search::placeholder {
        color: #9690a8;
    }
    [data-theme="auto"] .mcap-search:focus {
        border-color: #E8B820;
        box-shadow: 0 0 0 2px rgba(232, 184, 32, 0.2);
    }
    [data-theme="auto"] .mcap-search-icon {
        color: #9690a8;
    }
    [data-theme="auto"] .mcap-search-clear {
        color: #9690a8;
    }
    [data-theme="auto"] .mcap-table thead th {
        background: #2d2740;
        color: #E6E6FA;
        border-bottom-color: rgba(255, 255, 255, 0.1);
        box-shadow: 0 -1rem 0 0 #2d2740;
    }
    [data-theme="auto"] .mcap-row-card {
        background: #2d2740;
        color: #f6f7f8;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    [data-theme="auto"] .mcap-row-card:hover {
        background: #3d3650;
    }
    [data-theme="auto"] .mcap-row-card.selected {
        background: #3d3650 !important;
        border-left-color: #E8B820;
    }
    [data-theme="auto"] .mcap-row-card td {
        color: #c9c5d4;
    }
    [data-theme="auto"] .mcap-row-card td[style*="color:#222"],
    [data-theme="auto"] .mcap-row-card td[style*="font-weight:600"] {
        color: #E6E6FA !important;
    }
    [data-theme="auto"] .mcap-row-card td[style*="color:#555"],
    [data-theme="auto"] .mcap-row-card td span[style*="color:#888"] {
        color: #9690a8 !important;
    }
    [data-theme="auto"] .mcap-action-btn {
        background: #3d3650;
        color: #c9c5d4;
    }
    [data-theme="auto"] .mcap-action-btn:hover {
        background: #4a4560;
        color: #E6E6FA;
    }
    [data-theme="auto"] .mcap-storage-bar {
        background: #3d3650;
    }
    [data-theme="auto"] .mcap-storage-percent {
        color: #9690a8;
    }
    [data-theme="auto"] .mcap-storage-directory {
        border-top-color: rgba(255, 255, 255, 0.1);
        color: #9690a8;
    }
    [data-theme="auto"] .mcap-spinner-overlay {
        background: rgba(26, 22, 37, 0.7);
    }
    [data-theme="auto"] .mcap-spinner {
        border-color: #3d3650;
        border-top-color: #E8B820;
    }
    [data-theme="auto"] .text-gray-600 {
        color: #9690a8 !important;
    }
}
`;
    document.head.appendChild(style);
})();

window.togglePlayMcap = function (fileName, directory, options = null) {
    if (!window.isPlaying) window.isPlaying = false;
    if (!window.currentPlayingFile) window.currentPlayingFile = null;

    // Load state from localStorage
    const savedState = localStorage.getItem('mcapReplayState');
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            window.isPlaying = state.isPlaying || false;
            window.currentPlayingFile = state.currentPlayingFile || null;
        } catch (error) {
            console.error('Error parsing saved replay state:', error);
        }
    }

    const refreshTable = () => {
        if (typeof showMcapDialog === 'function') showMcapDialog();
        else if (typeof listMcapFiles === 'function') listMcapFiles();
    };
    if (window.isPlaying && window.currentPlayingFile === fileName) {
        fetch('/config/replay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: "replay", MCAP: "", IGNORE_TOPICS: "" })
        })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                return response.text();
            })
            .then(() => {
                return fetch('/replay-end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: fileName, directory: directory })
                });
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                return response.text();
            })
            .then(() => {
                window.isPlaying = false;
                window.currentPlayingFile = null;
                // Save state to localStorage
                localStorage.setItem('mcapReplayState', JSON.stringify({
                    isPlaying: false,
                    currentPlayingFile: null
                }));
                refreshTable();
            })
            .catch(error => {
                console.error('Error stopping replay:', error);
                alert(`Error stopping replay: ${error.message}`);
                refreshTable();
            });
    } else if (!window.isPlaying) {
        // Show play options modal instead of directly starting replay
        showPlayOptionsModal(fileName, directory);
    }
};

function deleteFile(fileName, directory) {
    console.log('deleteFile called', fileName, directory); // Debug log
    if (fileName === window.currentRecordingFile) {
        alert('Cannot delete file while it is being recorded');
        return;
    }
    const confirmDelete = confirm(`Are you sure you want to delete: ${fileName}?`);
    const params = {
        directory: directory,
        file: fileName
    }
    if (confirmDelete) {
        fetch('/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        }).then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`HTTP error ${response.status}: ${text}`);
                });
            }
            return response.text();
        }).then(text => {
            console.log('File deleted:', text);
            if (window.mcapSocket && window.mcapSocket.readyState === WebSocket.OPEN) {
                window.mcapSocket.send(JSON.stringify({ action: 'list_files' }));
            }
            if (typeof startPolling === 'function') startPolling();
            if (typeof listMcapFiles === 'function') listMcapFiles();
        }).catch(error => {
            console.error('Error deleting file:', error);
            alert(`Error deleting file: ${error.message}`);
        });
    }
}
window.deleteFile = deleteFile;

function ensureFileDetailsModal() {
    if (!document.getElementById('myModal')) {
        const dialog = document.createElement('dialog');
        dialog.id = 'myModal';
        dialog.className = 'bg-white rounded-lg shadow-lg p-6 w-[600px]';
        dialog.innerHTML = '<div id="modalDetails"></div>';
        document.body.appendChild(dialog);
    }
}

function showModal(topics, fileInfo = {}) {
    ensureFileDetailsModal();
    const modal = document.getElementById('myModal');
    const modalDetails = document.getElementById('modalDetails');
    if (!modal || !modalDetails) {
        console.error('Modal elements not found');
        return;
    }
    const fileName = fileInfo.name || fileInfo.fileName || '--';
    const fileSize = fileInfo.size ? `${fileInfo.size} MB` : '0 MB';
    let totalFrames = 0;
    let totalDuration = 0;
    Object.values(topics).forEach(details => {
        Object.entries(details).forEach(([key, value]) => {
            if (key.toLowerCase() === 'message count' || key.toLowerCase() === 'message_count' || key === 'FRAMES:') {
                totalFrames += Number(value) || 0;
            }
            if (key.toLowerCase() === 'video length' || key.toLowerCase() === 'video_length') {
                totalDuration = Number(value) || 0;
            }
        });
    });
    const durationStr = totalDuration > 0 ? `${totalDuration.toLocaleString(undefined, { maximumFractionDigits: 2 })} s` : '--';
    modalDetails.innerHTML = `
<style>
    .fd-header { font-size: 2rem; font-weight: 700; color: #1a237e; margin-bottom: 0.5rem; letter-spacing: -1px; }
    .fd-subheader { font-size: 1.1rem; color: #374151; margin-bottom: 1.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90vw; }
    .fd-summary-card { background: #e9f1fb; border-radius: 1rem; padding: 1.5rem 2rem; margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 2.5rem 2.5rem; align-items: center; justify-content: flex-start; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .fd-summary-item { display: flex; align-items: center; gap: 0.5rem; min-width: 160px; }
    .fd-summary-icon { font-size: 1.3rem; color: #1976d2; }
    .fd-summary-label { color: #3b3b3b; font-weight: 500; margin-right: 0.25rem; }
    .fd-summary-value { color: #1a237e; font-weight: 600; font-size: 1.08rem; }
    .fd-summary-copy { background: none; border: none; color: #1976d2; cursor: pointer; font-size: 1.1rem; margin-left: 0.25rem; }
    .fd-summary-copy:hover { color: #0d47a1; }
    .fd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; }
    .fd-topic-card { background: #f7fafc; border-radius: 0.75rem; padding: 1.25rem 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: box-shadow 0.2s, transform 0.2s; position: relative; color: #222; }
    .fd-topic-card:hover { box-shadow: 0 4px 16px rgba(25, 118, 210, 0.10); transform: translateY(-2px) scale(1.01); }
    .fd-topic-title { font-weight: 600; color: #222; margin-bottom: 0.75rem; font-size: 1.08rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fd-topic-title[title] { cursor: help; }
    .fd-topic-table { width: 100%; font-size: 1.05rem; color: #222; background: transparent; }
    .fd-topic-table td { padding: 0.15rem 0.5rem 0.15rem 0; }
    .fd-key { color: #555; font-weight: 500; }
    .fd-value { color: #222; text-align: right; }
</style>
<div class="fd-header">File Details</div>
<div class="fd-summary-card">
    <div class="fd-summary-item"><span class="fd-summary-icon">📄</span><span class="fd-summary-label">File Name:</span> <span class="fd-summary-value" title="${fileName}">${fileName.length > 24 ? fileName.slice(0, 21) + '...' : fileName}</span> <button class="fd-summary-copy" title="Copy file name" onclick="navigator.clipboard.writeText('${fileName.replace(/'/g, '\'')}')">⧉</button></div>
    <div class="fd-summary-item"><span class="fd-summary-icon">📦</span><span class="fd-summary-label">File Size:</span> <span class="fd-summary-value">${fileSize}</span></div>
    <div class="fd-summary-item"><span class="fd-summary-icon">⏱️</span><span class="fd-summary-label">Total Duration:</span> <span class="fd-summary-value">${durationStr}</span></div>
</div>
<div class="fd-grid">
    ${Object.entries(topics).map(([topic, details]) => {
        const filtered = Object.entries(details)
            .filter(([key]) => key.toLowerCase() !== 'video length' && key.toLowerCase() !== 'video_length')
            .map(([key, value]) => {
                let displayKey = key;
                if (key.toLowerCase() === 'average fps' || key.toLowerCase() === 'average_fps') displayKey = 'FPS:';
                return [displayKey, value];
            })
            .map(([key, value]) => {
                let displayKey = key;
                if (key.toLowerCase() === 'message count' || key.toLowerCase() === 'message_count') displayKey = 'FRAMES:';
                return [displayKey, value];
            });
        return `
            <div class="fd-topic-card">
                <div class="fd-topic-title" title="${topic}">${topic.length > 32 ? topic.slice(0, 29) + '...' : topic}</div>
                <table class="fd-topic-table">
                    <tbody>
                        ${filtered.map(([key, value]) => `
                            <tr>
                                <td class="fd-key">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                                <td class="fd-value">${typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `;
    }).join('')}
</div>
<div class="fd-sticky-footer">
    <button id="closeModalBtn" class="bg-[#4285f4] text-white px-4 py-2 rounded hover:bg-blue-600 text-base font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2">
        CLOSE
    </button>
</div>
`;
    setTimeout(() => {
        const closeBtn = document.getElementById('closeModalBtn');
        if (closeBtn) {
            closeBtn.onclick = () => { modal.close(); };
        }
    }, 0);
    modal.showModal();
}

window.switchToLive = async function () {
    // Show loading dialog
    let loadingDialog = document.getElementById('loadingDialog');
    if (!loadingDialog) {
        loadingDialog = document.createElement('dialog');
        loadingDialog.id = 'loadingDialog';
        loadingDialog.className = 'modal';
        loadingDialog.innerHTML = `
            <div class="modal-box flex flex-col items-center p-6 bg-white rounded-lg shadow-xl">
                <span class="loading loading-spinner loading-lg text-primary mb-4"></span>
                <p class="text-lg font-semibold text-gray-700">Switching to Live Mode...</p>
                <p class="text-sm text-gray-500">Please wait while the system transitions.</p>
            </div>
        `;
        document.body.appendChild(loadingDialog);
    }
    loadingDialog.showModal();

    let deviceName = null;
    try {
        // Fetch device name
        const response = await fetch('/config/webui/details');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        deviceName = data.DEVICE;
        if (!deviceName) {
            throw new Error('Device name not available');
        }

        // Request live mode
        const liveResp = await fetch('/live-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: deviceName.toLowerCase() })
        });
        if (!liveResp.ok) {
            throw new Error(`HTTP error! status: ${liveResp.status}`);
        }

        // Wait a bit for services to start
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Poll for replay status
        let elapsed = 0;
        const maxWait = 45000;
        const pollInterval = 1000;
        let transitionCheck = setInterval(async () => {
            try {
                const statusResponse = await fetch('/replay-status');
                const statusText = await statusResponse.text();
                const isReplay = statusText.trim() === "Replay is running";
                elapsed += pollInterval;
                if (!isReplay) {
                    clearInterval(transitionCheck);
                    loadingDialog.close();
                } else if (elapsed >= maxWait) {
                    clearInterval(transitionCheck);
                    loadingDialog.close();
                }
            } catch (error) {
                clearInterval(transitionCheck);
                loadingDialog.close();
            }
        }, pollInterval);
        setTimeout(() => {
            clearInterval(transitionCheck);
            loadingDialog.close();
        }, maxWait);
    } catch (error) {
        loadingDialog.close();
        alert('Error turning on all or some services but device is switched to live mode.');
    }
};

// =====================================================
// EdgeFirst Studio Upload Functions
// =====================================================

// Studio auth state
window.studioAuth = {
    isLoggedIn: false,
    username: null
};

// WebSocket for upload progress
window.uploadProgressWs = null;

/**
 * Check Studio authentication status
 */
window.checkStudioAuthStatus = async function() {
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            window.studioAuth.isLoggedIn = data.authenticated;
            window.studioAuth.username = data.username;
            return data;
        } else {
            // Non-OK response: treat as not authenticated
            window.studioAuth.isLoggedIn = false;
            window.studioAuth.username = null;
            return { authenticated: false };
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        // Don't clear auth state on network error - preserve current state
        return {
            authenticated: window.studioAuth.isLoggedIn,
            username: window.studioAuth.username,
            error: 'Failed to verify authentication status'
        };
    }
};

/**
 * Show login dialog for EdgeFirst Studio
 */
window.showStudioLoginDialog = async function(onSuccess) {
    let dialog = document.getElementById('studioLoginDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'studioLoginDialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-box" style="max-width: 400px;">
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">Login to EdgeFirst Studio</h2>
                <form id="studioLoginForm">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Server</label>
                        <select id="studioServer"
                            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; background-color: white;">
                            <option value="saas" selected>EdgeFirst Studio</option>
                            <option value="stage">Stage</option>
                            <option value="test">Test</option>
                            <option value="dev">Dev</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Username</label>
                        <input type="text" id="studioUsername" required
                            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
                            placeholder="Enter your username">
                    </div>
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Password</label>
                        <input type="password" id="studioPassword" required
                            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
                            placeholder="Enter your password">
                    </div>
                    <div id="studioLoginError" style="color: #dc3545; margin-bottom: 1rem; display: none;"></div>
                    <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                        <button type="button" onclick="document.getElementById('studioLoginDialog').close()"
                            class="mcap-btn-secondary" style="padding: 0.5rem 1rem;">Cancel</button>
                        <button type="submit" class="mcap-btn-primary" style="padding: 0.5rem 1rem;">Login</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(dialog);

        dialog.querySelector('#studioLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const server = dialog.querySelector('#studioServer').value;
            const username = dialog.querySelector('#studioUsername').value.trim();
            const password = dialog.querySelector('#studioPassword').value.trim();
            const errorDiv = dialog.querySelector('#studioLoginError');

            // Validate non-empty after trimming
            if (!username || !password) {
                errorDiv.textContent = 'Username and password are required';
                errorDiv.style.display = 'block';
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, server })
                });

                if (response.ok) {
                    const data = await response.json();
                    window.studioAuth.isLoggedIn = true;
                    window.studioAuth.username = data.username;
                    dialog.close();
                    // Immediately refresh navbar status indicator
                    if (typeof window.updateStudioStatus === 'function') {
                        window.updateStudioStatus();
                    }
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                } else {
                    const error = await response.json();
                    errorDiv.textContent = error.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        });
    }

    // Clear previous inputs and reset server to default
    dialog.querySelector('#studioServer').value = 'saas';
    dialog.querySelector('#studioUsername').value = '';
    dialog.querySelector('#studioPassword').value = '';
    dialog.querySelector('#studioLoginError').style.display = 'none';

    // Track whether we're expecting a callback to detect cancellation
    const hadCallback = typeof onSuccess === 'function';
    
    // Add close handler for cancelled authentication feedback
    const closeHandler = () => {
        // Check if user cancelled (dialog closed without successful login and callback was expected)
        if (!window.studioAuth.isLoggedIn && hadCallback) {
            const msg = 'Authentication cancelled. Upload cannot proceed without signing in.';
            if (typeof window.showToast === 'function') {
                window.showToast(msg);
            } else {
                console.log(msg);
            }
        }
    };
    dialog.addEventListener('close', closeHandler, { once: true });

    dialog.showModal();
};

/**
 * Show upload options dialog
 */
window.showUploadOptionsDialog = async function(fileName, dirName) {
    // Check auth status first
    const authStatus = await window.checkStudioAuthStatus();
    if (!authStatus.authenticated) {
        window.showStudioLoginDialog(() => {
            // Retry showing upload dialog after login
            window.showUploadOptionsDialog(fileName, dirName);
        });
        return;
    }

    let dialog = document.getElementById('uploadOptionsDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'uploadOptionsDialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-box" style="max-width: 500px;">
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">Upload to EdgeFirst Studio</h2>
                <p id="uploadFileName" style="margin-bottom: 1rem; color: #555;"></p>

                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Upload Mode</label>
                    <div style="display: flex; gap: 1rem;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="radio" name="uploadMode" value="basic" checked>
                            <span>Basic (Snapshot only)</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="radio" name="uploadMode" value="extended">
                            <span>Extended (with AGTG)</span>
                        </label>
                    </div>
                </div>

                <div id="extendedOptions" style="display: none; margin-bottom: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Project</label>
                        <select id="uploadProject" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
                            <option value="">Loading projects...</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Dataset Name (optional)</label>
                        <input type="text" id="uploadDatasetName"
                            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
                            placeholder="Auto-generated if empty">
                    </div>
                    <div>
                        <label style="display: block; font-weight: 500; margin-bottom: 0.25rem;">Labels</label>
                        <div id="uploadLabels" style="max-height: 150px; overflow-y: auto; border: 1px solid #d1d5db; border-radius: 0.375rem; padding: 0.5rem;">
                            <em>Select a project to load labels</em>
                        </div>
                    </div>
                </div>

                <div id="uploadError" style="color: #dc3545; margin-bottom: 1rem; display: none;"></div>

                <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                    <button type="button" onclick="document.getElementById('uploadOptionsDialog').close()"
                        class="mcap-btn-secondary" style="padding: 0.5rem 1rem;">Cancel</button>
                    <button type="button" id="startUploadBtn" class="mcap-btn-primary" style="padding: 0.5rem 1rem; background: #E8B820; color: #222 !important;">
                        Upload
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Mode toggle handler
        dialog.querySelectorAll('input[name="uploadMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const extendedOpts = dialog.querySelector('#extendedOptions');
                if (e.target.value === 'extended') {
                    extendedOpts.style.display = 'block';
                    loadProjects();
                } else {
                    extendedOpts.style.display = 'none';
                }
            });
        });

        // Project change handler - disable during label loading to prevent race conditions
        dialog.querySelector('#uploadProject').addEventListener('change', async (e) => {
            const projectSelect = e.target;
            const projectId = projectSelect.value;
            if (projectId) {
                projectSelect.disabled = true;
                try {
                    await loadProjectLabels(projectId);
                } finally {
                    projectSelect.disabled = false;
                }
            }
        });
    }

    // Set file name
    dialog.querySelector('#uploadFileName').textContent = `File: ${fileName}`;
    dialog._fileName = fileName;
    dialog._dirName = dirName;

    // Reset form
    dialog.querySelector('input[name="uploadMode"][value="basic"]').checked = true;
    dialog.querySelector('#extendedOptions').style.display = 'none';
    dialog.querySelector('#uploadError').style.display = 'none';

    // Set up upload button handler
    const uploadBtn = dialog.querySelector('#startUploadBtn');
    uploadBtn.onclick = async () => {
        await startUpload(dialog);
    };

    dialog.showModal();
};

/**
 * Load projects from Studio
 */
async function loadProjects() {
    const select = document.getElementById('uploadProject');
    select.innerHTML = '<option value="">Loading...</option>';

    try {
        const response = await fetch('/api/studio/projects');
        if (response.ok) {
            const projects = await response.json();
            select.innerHTML = '<option value="">Select a project</option>';
            projects.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">Error loading projects</option>';
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        select.innerHTML = '<option value="">Error loading projects</option>';
    }
}

/**
 * Load labels for a project
 */
async function loadProjectLabels(projectId) {
    const container = document.getElementById('uploadLabels');
    container.innerHTML = '<em>Loading labels...</em>';

    try {
        const response = await fetch(`/api/studio/projects/${projectId}/labels`);
        if (response.ok) {
            const labels = await response.json();
            if (labels.length === 0) {
                container.innerHTML = '<em>No labels available</em>';
            } else {
                // Clear and safely create label elements (XSS protection)
                container.innerHTML = '';
                labels.forEach(label => {
                    const labelEl = document.createElement('label');
                    labelEl.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; cursor: pointer;';

                    const inputEl = document.createElement('input');
                    inputEl.type = 'checkbox';
                    inputEl.name = 'uploadLabel';
                    inputEl.value = label.id;
                    // Check labels marked as default (e.g., "person")
                    if (label.default) {
                        inputEl.checked = true;
                    }

                    const spanEl = document.createElement('span');
                    spanEl.textContent = label.name;

                    labelEl.appendChild(inputEl);
                    labelEl.appendChild(spanEl);
                    container.appendChild(labelEl);
                });
            }
        } else {
            container.innerHTML = '<em>Error loading labels</em>';
        }
    } catch (error) {
        console.error('Error loading labels:', error);
        container.innerHTML = '<em>Error loading labels</em>';
    }
}

/**
 * Start the upload
 */
async function startUpload(dialog) {
    const fileName = dialog._fileName;
    const dirName = dialog._dirName;
    const errorDiv = dialog.querySelector('#uploadError');
    const uploadBtn = dialog.querySelector('#startUploadBtn');

    const mode = dialog.querySelector('input[name="uploadMode"]:checked').value;

    let requestBody = {
        mcap_path: `${dirName}/${fileName}`,
        mode: { type: 'Basic' }
    };

    if (mode === 'extended') {
        const projectIdStr = dialog.querySelector('#uploadProject').value;
        if (!projectIdStr) {
            errorDiv.textContent = 'Please select a project for extended mode';
            errorDiv.style.display = 'block';
            return;
        }

        // Convert project_id to number (backend expects u64)
        const projectId = parseInt(projectIdStr, 10);
        if (isNaN(projectId)) {
            errorDiv.textContent = 'Invalid project ID';
            errorDiv.style.display = 'block';
            return;
        }

        const selectedLabels = Array.from(dialog.querySelectorAll('input[name="uploadLabel"]:checked'))
            .map(cb => cb.value);

        requestBody.mode = {
            type: 'Extended',
            project_id: projectId,
            labels: selectedLabels,
            dataset_name: dialog.querySelector('#uploadDatasetName').value || null,
            dataset_description: null
        };
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Starting...';

    try {
        const response = await fetch('/api/uploads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {
            const data = await response.json();
            dialog.close();
            showUploadProgressDialog(data.upload_id, fileName);
        } else {
            const error = await response.json();
            errorDiv.textContent = error.error || 'Failed to start upload';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Upload request failed:', error);
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
    }
}

/**
 * Show upload progress dialog
 */
window.showUploadProgressDialog = function(uploadId, fileName) {
    let dialog = document.getElementById('uploadProgressDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'uploadProgressDialog';
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-box" style="max-width: 450px;">
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">Uploading to Studio</h2>
                <p id="progressFileName" style="margin-bottom: 0.5rem; color: #555;"></p>
                <div id="progressStatus" style="margin-bottom: 1rem; font-weight: 500;"></div>

                <div style="background: #e5e7eb; border-radius: 9999px; height: 0.75rem; overflow: hidden; margin-bottom: 0.5rem;">
                    <div id="progressBar" style="background: #E8B820; color: #222; height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
                <div id="progressPercent" style="text-align: center; font-size: 0.875rem; color: #555; margin-bottom: 1rem;">0%</div>

                <div id="progressMessage" style="color: #555; font-size: 0.875rem; margin-bottom: 1.5rem;"></div>

                <div id="progressResult" style="display: none; margin-bottom: 1rem; padding: 0.75rem; border-radius: 0.375rem;"></div>

                <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                    <button type="button" id="backgroundUploadBtn" class="mcap-btn-secondary" style="padding: 0.5rem 1rem;">Continue in Background</button>
                    <button type="button" id="cancelUploadBtn" class="mcap-btn-secondary" style="padding: 0.5rem 1rem;">Cancel</button>
                    <button type="button" id="closeProgressBtn" class="mcap-btn-primary" style="padding: 0.5rem 1rem; display: none;">Done</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        // Attach event handlers only once during dialog creation
        const cancelBtn = dialog.querySelector('#cancelUploadBtn');
        cancelBtn.addEventListener('click', async () => {
            const currentUploadId = dialog._uploadId;
            if (!currentUploadId) return;
            
            // Provide immediate UI feedback
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'Cancelling...';
            dialog.querySelector('#progressStatus').textContent = 'Cancelling...';
            dialog.querySelector('#progressMessage').textContent = '';

            try {
                await fetch(`/api/uploads/${currentUploadId}`, { method: 'DELETE' });
            } catch (e) {
                console.error('Error cancelling upload:', e);
            }
            // Dialog will be updated via WebSocket when cancellation is confirmed
        });

        // Close button handler
        dialog.querySelector('#closeProgressBtn').addEventListener('click', () => {
            dialog.close();
        });

        // Background upload button handler
        dialog.querySelector('#backgroundUploadBtn').addEventListener('click', () => {
            const uploadId = dialog._uploadId;
            const fileName = dialog.querySelector('#progressFileName').textContent.replace('File: ', '');
            if (uploadId) {
                // Track this as a background upload
                if (!window.backgroundUploads) {
                    window.backgroundUploads = new Map();
                }
                window.backgroundUploads.set(uploadId, {
                    fileName: fileName,
                    progress: parseFloat(dialog.querySelector('#progressPercent').textContent) || 0,
                    status: dialog.querySelector('#progressStatus').textContent || 'Uploading'
                });
                showBackgroundUploadIndicator();
            }
            dialog.close();
        });

        // Clean up WebSocket when dialog is closed (ESC key, click outside, etc.)
        dialog.addEventListener('close', () => {
            // Only close WebSocket if not continuing in background
            const uploadId = dialog._uploadId;
            if (window.backgroundUploads && window.backgroundUploads.has(uploadId)) {
                // Keep WebSocket open for background tracking
                return;
            }
            if (window.uploadProgressWs) {
                window.uploadProgressWs.close();
                window.uploadProgressWs = null;
            }
        });
    }

    // Reset dialog state for new upload
    dialog._uploadId = uploadId;
    dialog.querySelector('#progressFileName').textContent = `File: ${fileName}`;
    dialog.querySelector('#progressBar').style.width = '0%';
    dialog.querySelector('#progressPercent').textContent = '0%';
    dialog.querySelector('#progressStatus').textContent = 'Starting...';
    dialog.querySelector('#progressMessage').textContent = '';
    dialog.querySelector('#progressResult').style.display = 'none';
    dialog.querySelector('#progressBar').style.background = '#E8B820';

    const cancelBtn = dialog.querySelector('#cancelUploadBtn');
    cancelBtn.style.display = 'inline-block';
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel';

    const backgroundBtn = dialog.querySelector('#backgroundUploadBtn');
    backgroundBtn.style.display = 'inline-block';

    dialog.querySelector('#closeProgressBtn').style.display = 'none';

    // Connect WebSocket for progress
    connectUploadProgressWs(uploadId, dialog);

    dialog.showModal();
};

/**
 * Connect WebSocket for upload progress
 */
function connectUploadProgressWs(uploadId, dialog) {
    // Close existing connection
    if (window.uploadProgressWs) {
        window.uploadProgressWs.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Allow overriding WebSocket host/port if needed for custom deployments
    const wsHost = window.UPLOAD_WS_HOST || window.location.hostname;
    const wsPort = window.UPLOAD_WS_PORT ? String(window.UPLOAD_WS_PORT) : window.location.port;
    const portSegment = wsPort ? `:${wsPort}` : '';
    const wsUrl = `${protocol}//${wsHost}${portSegment}/ws/uploads`;
    window.uploadProgressWs = new WebSocket(wsUrl);

    window.uploadProgressWs.onmessage = (event) => {
        try {
            const status = JSON.parse(event.data);
            // Normalize upload_id to handle both string and object formats
            const statusUploadId = status.upload_id && typeof status.upload_id === 'object'
                ? status.upload_id.value
                : status.upload_id;
            if (statusUploadId === uploadId) {
                updateProgressUI(dialog, status);
            }
        } catch (e) {
            console.error('Error parsing progress message:', e);
        }
    };

    window.uploadProgressWs.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    window.uploadProgressWs.onclose = () => {
        console.log('Upload progress WebSocket closed');
    };
}

/**
 * Update progress UI from status
 */
function updateProgressUI(dialog, status) {
    const progressBar = dialog.querySelector('#progressBar');
    const progressPercent = dialog.querySelector('#progressPercent');
    const progressStatus = dialog.querySelector('#progressStatus');
    const progressMessage = dialog.querySelector('#progressMessage');
    const progressResult = dialog.querySelector('#progressResult');
    const cancelBtn = dialog.querySelector('#cancelUploadBtn');
    const closeBtn = dialog.querySelector('#closeProgressBtn');

    // Update progress
    const percent = Math.min(100, Math.max(0, status.progress || 0));
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent.toFixed(1)}%`;

    // Extract state text safely (handle string, object, null, undefined, array)
    let stateText = '';
    if (typeof status.state === 'string') {
        stateText = status.state;
    } else if (status.state && typeof status.state === 'object' && !Array.isArray(status.state)) {
        const stateKeys = Object.keys(status.state);
        if (stateKeys.length > 0) {
            stateText = stateKeys[0];
        }
    }
    progressStatus.textContent = stateText || 'Unknown';
    progressMessage.textContent = status.message || '';

    // Handle completed or failed states (backend sends lowercase: "completed", "failed")
    const stateTextLower = stateText.toLowerCase();
    if (stateTextLower === 'completed') {
        progressBar.style.background = '#34a853';
        progressResult.style.display = 'block';
        progressResult.style.background = '#d4edda';
        progressResult.style.color = '#155724';
        // XSS protection: use DOM methods instead of innerHTML
        progressResult.replaceChildren();
        const strong = document.createElement('strong');
        strong.textContent = 'Upload Complete!';
        progressResult.appendChild(strong);
        if (status.snapshot_id) {
            progressResult.appendChild(document.createElement('br'));
            progressResult.appendChild(document.createTextNode(`Snapshot ID: ${status.snapshot_id}`));
        }
        if (status.dataset_id) {
            progressResult.appendChild(document.createElement('br'));
            progressResult.appendChild(document.createTextNode(`Dataset ID: ${status.dataset_id}`));
        }
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'inline-block';
        const backgroundBtn = dialog.querySelector('#backgroundUploadBtn');
        if (backgroundBtn) backgroundBtn.style.display = 'none';

        // Clean up background upload tracking
        const uploadId = dialog._uploadId;
        if (window.backgroundUploads && window.backgroundUploads.has(uploadId)) {
            window.backgroundUploads.delete(uploadId);
            updateBackgroundUploadIndicator();
        }

        // Close WebSocket
        if (window.uploadProgressWs) {
            window.uploadProgressWs.close();
        }
    } else if (stateTextLower === 'failed' || stateTextLower === 'cancelled') {
        progressBar.style.background = '#dc3545';
        progressResult.style.display = 'block';
        progressResult.style.background = '#f8d7da';
        progressResult.style.color = '#721c24';
        // XSS protection: use DOM methods instead of innerHTML
        progressResult.replaceChildren();
        const strong = document.createElement('strong');
        strong.textContent = stateText;
        progressResult.appendChild(strong);
        progressResult.appendChild(document.createTextNode(': ' + (status.error || status.message || 'Unknown error')));
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'inline-block';
        const backgroundBtnFailed = dialog.querySelector('#backgroundUploadBtn');
        if (backgroundBtnFailed) backgroundBtnFailed.style.display = 'none';

        // Clean up background upload tracking
        const failedUploadId = dialog._uploadId;
        if (window.backgroundUploads && window.backgroundUploads.has(failedUploadId)) {
            window.backgroundUploads.delete(failedUploadId);
            updateBackgroundUploadIndicator();
        }

        // Close WebSocket
        if (window.uploadProgressWs) {
            window.uploadProgressWs.close();
        }
    }

    // Update background upload tracking if this is a background upload
    const bgUploadId = dialog._uploadId;
    if (window.backgroundUploads && window.backgroundUploads.has(bgUploadId)) {
        window.backgroundUploads.set(bgUploadId, {
            ...window.backgroundUploads.get(bgUploadId),
            progress: percent,
            status: stateText
        });
        updateBackgroundUploadIndicator();
    }
}

/**
 * Show floating indicator for background uploads
 */
function showBackgroundUploadIndicator() {
    let indicator = document.getElementById('backgroundUploadIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'backgroundUploadIndicator';
        indicator.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #3E3371; color: white; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 14px;';
        indicator.addEventListener('click', () => {
            // Re-open the progress dialog for the first background upload
            if (window.backgroundUploads && window.backgroundUploads.size > 0) {
                const [uploadId, info] = window.backgroundUploads.entries().next().value;
                window.showUploadProgressDialog(uploadId, info.fileName);
            }
        });
        document.body.appendChild(indicator);
    }
    updateBackgroundUploadIndicator();
    indicator.style.display = 'flex';
}

/**
 * Update background upload indicator content
 */
function updateBackgroundUploadIndicator() {
    const indicator = document.getElementById('backgroundUploadIndicator');
    if (!indicator) return;

    if (!window.backgroundUploads || window.backgroundUploads.size === 0) {
        indicator.style.display = 'none';
        return;
    }

    const count = window.backgroundUploads.size;
    let totalProgress = 0;
    let completedCount = 0;

    window.backgroundUploads.forEach((info) => {
        totalProgress += info.progress || 0;
        if (info.status && info.status.toLowerCase() === 'completed') completedCount++;
    });

    const avgProgress = count > 0 ? (totalProgress / count).toFixed(0) : 0;

    // Build indicator content using safe DOM methods
    indicator.replaceChildren();

    // Spinner
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;';
    indicator.appendChild(spinner);

    // Text
    const text = document.createElement('span');
    text.textContent = count === 1
        ? `Uploading... ${avgProgress}%`
        : `${count} uploads in progress (${avgProgress}%)`;
    indicator.appendChild(text);

    // Add spin animation if not already added
    if (!document.getElementById('bgUploadSpinStyle')) {
        const style = document.createElement('style');
        style.id = 'bgUploadSpinStyle';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    indicator.style.display = 'flex';
}
