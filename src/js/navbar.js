// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
function createNavbar(pageTitle) {
    const navbar = document.createElement('header');
    navbar.className = 'bg-[#3E3371]'; // EdgeFirst Navy
    navbar.innerHTML = `
        <nav class="navbar" style="background: #3E3371;">
            <div class="navbar-start">
                <a href="/" class="flex items-center gap-2">
                    <img src="../assets/logo.png" alt="Logo" class="h-12 w-auto">
                </a>
            </div>
            <div class="navbar-center">
                <h1 class="text-xl font-semibold text-white">${pageTitle}</h1>
            </div>
            <div class="navbar-end">
                <div class="flex items-center gap-4">
                    <!-- Minimalist recording button with tooltip -->
                    <button id="recordingButton" class="rec-btn flex items-center gap-2 px-4 py-1 rounded-full bg-gray-200 text-red-600 font-semibold transition-colors duration-200 focus:outline-none" aria-pressed="false" aria-label="Start Recording">
                        <span class="rec-dot inline-block w-3 h-3 rounded-full bg-red-600"></span>
                        <span class="rec-text">REC</span>
                        <span class="rec-tooltip absolute left-1/2 -translate-x-1/2 top-110% mt-2 px-2 py-1 rounded bg-gray-900 text-white text-xs opacity-0 pointer-events-none transition-opacity">Start Recording</span>
                    </button>
                    <!-- Add MCAP Files button -->
                    <div class="relative">
                        <button class="btn btn-ghost btn-circle group" onclick="showMcapDialog()" id="mcapDialogBtn" aria-label="Show MCAP Details">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-6 h-6">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                            <span class="mcap-tooltip absolute left-1/2 -translate-x-1/2 top-110% mt-2 px-2 py-1 rounded bg-gray-900 text-white text-xs opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-focus:opacity-100" style="white-space:nowrap;z-index:20;">MCAP Details</span>
                        </button>
                    </div>
                    <!-- Mode Indicator with Tooltip -->
                    <div class="flex flex-col items-center">
                        <div id="modeIndicator" class="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 flex items-center gap-2 cursor-pointer relative">
                            <span id="modeText">Loading...</span>
                            <div class="mode-tooltip-custom absolute left-1/2 -translate-x-1/2 mt-4 px-4 py-3 rounded-lg bg-white text-black text-sm opacity-0 pointer-events-none transition-opacity min-w-[220px] z-50 shadow-lg border border-gray-200" style="box-shadow: 0 4px 16px rgba(0,0,0,0.10); top: 2.5rem;">
                                <div class="font-semibold mb-2">Service Status</div>
                                <div id="modeTooltipContent" class="mb-2 flex flex-col gap-1">
                                    Loading services...
                                </div>
                                <div>
                                    <a id="modeTooltipDetailsLink" href="#" class="text-blue-600 hover:underline flex items-center gap-1">Click for more details <span style="font-size:1.1em">&#8594;</span></a>
                                </div>
                            </div>
                        </div>
                        <div id="quickStatusBar" class="mt-1 text-xs flex items-center gap-2"></div>
                    </div>
                    <!-- Quick Status Container -->
                    <div id="statusContainer" class="relative flex items-center gap-2">
                        <!-- Quick Status Tooltip (still present for service status dialog) -->
                        <div id="serviceStatusTooltip" class="hidden absolute" style="">
                            <div id="quickStatusContent" class="text-sm">
                                Loading status...
                            </div>
                        </div>
                    </div>
                    <!-- Studio Login Status -->
                    <div id="studioStatusContainer" class="relative">
                        <button id="studioStatusBtn" class="btn btn-ghost btn-circle group" aria-label="EdgeFirst Studio">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                            </svg>
                            <span id="studioStatusDot" class="absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white logged-out"></span>
                            <div id="studioTooltip" class="studio-tooltip">
                                <div class="font-semibold mb-1">EdgeFirst Studio</div>
                                <div id="studioStatusText">Not logged in</div>
                            </div>
                        </button>
                    </div>
                    <!-- Theme Toggle Button -->
                    <button id="themeToggleBtn" class="btn btn-ghost btn-circle" onclick="ThemeManager.cycle()" aria-label="Toggle theme">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                        </svg>
                    </button>
                    <!-- Settings Button -->
                    <a href="/config/settings" class="btn btn-ghost btn-circle">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </a>
                </div>
            </div>
        </nav>
    `;

    // Add styles for recording button
    const style = document.createElement('style');
    style.textContent = `
        .rec-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 15px;
            font-weight: 600;
            background: #e5e7eb;
            color: #111;
            border: none;
            border-radius: 9999px;
            padding: 0.25rem 1.1rem;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
            position: relative;
            outline: none;
            box-shadow: none;
        }
        .rec-btn.recording {
            background: #dc2626;
            color: white;
        }
        .rec-btn .rec-dot {
            background: #111;
            width: 0.75rem;
            height: 0.75rem;
            border-radius: 9999px;
            transition: background 0.2s;
        }
        .rec-btn.recording .rec-dot {
            background: white;
            animation: rec-pulse-minimal 1s infinite;
        }
        @keyframes rec-pulse-minimal {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
        }
        .rec-btn .rec-tooltip {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 110%;
            margin-top: 0.5rem;
            background: #111827;
            color: #fff;
            padding: 0.25rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.75rem;
            opacity: 0;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10;
            transition: opacity 0.2s;
        }
        .rec-btn:hover .rec-tooltip,
        .rec-btn:focus .rec-tooltip {
            opacity: 1;
        }
        .rec-btn .rec-text {
            font-size: 1.1rem;
            font-weight: bold;
            transition: opacity 0.3s;
        }
        .rec-btn .rec-icon {
            color: inherit;
        }

        #modeIndicator {
            transition: all 0.3s ease;
            white-space: nowrap;
            cursor: pointer;
            position: relative;
        }
        #modeIndicator .mode-tooltip {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 110%;
            margin-top: 0.5rem;
            background: #111827;
            color: #fff;
            padding: 0.25rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.75rem;
            opacity: 0;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10;
            transition: opacity 0.2s;
        }
        #modeIndicator:hover .mode-tooltip,
        #modeIndicator:focus .mode-tooltip {
            opacity: 1;
        }

        .navbar-end .btn-circle svg {
            width: 24px;
            height: 24px;
            color: white;
        }

        .navbar-end .btn-circle:hover svg {
            color: #e2e8f0;
        }

        .navbar-end .menu {
            display: flex;
            align-items: center;
        }

        .navbar-end .btn-circle.btn-lg {
            width: 3rem;
            height: 3rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .navbar-end .btn-circle.btn-lg svg {
            margin-top: -5px;
            width: 25px;
            height: 25px;
            color: white;
        }

        .navbar-end .btn-circle.btn-lg:hover svg {
            color: #e2e8f0;
        }

        #serviceStatusTooltip {
            position: absolute;
            top: 100%;
            right: 0;
            left: auto;
            transform: none;
            margin-top: 0.75rem;
            width: 16rem;
            max-width: 90vw;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
            padding: 1rem;
            z-index: 50;
            display: none;
            transition: all 0.2s ease;
            pointer-events: none;
        }
        #serviceStatusTooltip * {
            pointer-events: auto;
        }
        .service-info-btn:hover + #serviceStatusTooltip,
        .service-info-btn:focus + #serviceStatusTooltip {
            display: block;
        }

        .mcap-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.25rem;
            height: 2.25rem;
            border-radius: 9999px;
            border: none;
            outline: none;
            cursor: pointer;
            transition: background 0.15s;
            font-size: 1rem;
            padding: 0;
        }
        .mcap-btn-blue {
            background: #4285f4;
            color: #fff;
        }
        .mcap-btn-blue:hover {
            background: #1a73e8;
        }
        .mcap-tooltip {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 110%;
            margin-top: 0.5rem;
            background: #111827;
            color: #fff;
            padding: 0.25rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.75rem;
            opacity: 0 !important;
            pointer-events: none;
            white-space: nowrap;
            z-index: 20;
            transition: opacity 0.2s;
        }
        .mcap-tooltip.show {
            opacity: 1 !important;
        }
        .group:hover .mcap-tooltip.show,
        .group:focus .mcap-tooltip.show {
            opacity: 1 !important;
        }

        /* Studio Status Indicator */
        #studioStatusDot.logged-out {
            background: #9ca3af;
        }
        #studioStatusDot.logged-in {
            background: #22c55e;
        }
        .studio-tooltip {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            top: 110%;
            margin-top: 0.5rem;
            background: #fff;
            color: #333;
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            opacity: 0;
            pointer-events: none;
            white-space: nowrap;
            z-index: 50;
            transition: opacity 0.2s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            min-width: 140px;
            text-align: center;
        }
        #studioStatusBtn:hover .studio-tooltip,
        #studioStatusBtn:focus .studio-tooltip {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

    return navbar;
}

// Function to initialize the navbar
function initNavbar(pageTitle) {
    // Create the navbar
    const navbar = createNavbar(pageTitle);

    // Insert the navbar at the beginning of the body
    document.body.insertBefore(navbar, document.body.firstChild);

    // Add recording button logic
    setTimeout(() => {
        const recordingButton = document.getElementById('recordingButton');
        if (recordingButton) {
            // Tooltip logic
            recordingButton.addEventListener('mouseenter', function () {
                const tooltip = recordingButton.querySelector('.rec-tooltip');
                if (tooltip) tooltip.style.opacity = 1;
            });
            recordingButton.addEventListener('mouseleave', function () {
                const tooltip = recordingButton.querySelector('.rec-tooltip');
                if (tooltip) tooltip.style.opacity = 0;
            });
            // Click event
            recordingButton.addEventListener('click', function () {
                if (recordingButton.classList.contains('recording')) {
                    stopRecording();
                } else {
                    startRecording();
                }
            });
        }

        // Add MCAP button tooltip logic
        const mcapButton = document.getElementById('mcapDialogBtn');
        if (mcapButton) {
            const mcapTooltip = mcapButton.querySelector('.mcap-tooltip');
            if (mcapTooltip) {
                mcapButton.addEventListener('mouseenter', function () {
                    mcapTooltip.classList.add('show');
                });
                mcapButton.addEventListener('mouseleave', function () {
                    mcapTooltip.classList.remove('show');
                });
                // Also hide tooltip when modal is opened
                mcapButton.addEventListener('click', function () {
                    mcapTooltip.classList.remove('show');
                });

                // Hide tooltip when clicking outside or losing focus
                document.addEventListener('click', function (event) {
                    if (!mcapButton.contains(event.target)) {
                        mcapTooltip.classList.remove('show');
                    }
                });

                // Hide tooltip when window loses focus
                window.addEventListener('blur', function () {
                    mcapTooltip.classList.remove('show');
                });
            }
        }

        // --- NEW: Set UI from localStorage cache immediately ---
        const cachedStatus = localStorage.getItem('recordingStatus');
        if (cachedStatus === 'recording') {
            updateRecordingUI(true);
        } else if (cachedStatus === 'not-recording') {
            updateRecordingUI(false);
        }

        // Listen for storage events to sync across tabs
        window.addEventListener('storage', (event) => {
            if (event.key === 'recordingStatus') {
                if (event.newValue === 'recording') {
                    updateRecordingUI(true);
                } else if (event.newValue === 'not-recording') {
                    updateRecordingUI(false);
                }
            }
        });

        if (window.serviceCache && !window.serviceCache.isInitialized) {
            window.serviceCache.startBackgroundUpdates();
        } else if (!window.serviceCache) {
            console.warn('Service cache not initialized yet');
            // Try to initialize when service cache becomes available
            const checkServiceCache = setInterval(() => {
                if (window.serviceCache) {
                    window.serviceCache.startBackgroundUpdates();
                    clearInterval(checkServiceCache);
                }
            }, 100);
        }

        const updateUIFromCache = async () => {
            if (!window.serviceCache) return;

            const serviceStatuses = window.serviceCache.serviceStatuses;
            const replayStatus = window.serviceCache.replayStatus;

            if (serviceStatuses) {
                updateQuickStatus();
            }
            if (replayStatus !== null) {
                checkReplayStatus();
            }
            checkRecordingStatus();
        };

        updateUIFromCache();

        if (window.serviceCache) {
            window.serviceCache.registerUpdateCallback(updateUIFromCache);
        }
        const modeIndicator = document.getElementById('modeIndicator');
        if (modeIndicator) {
            const tooltip = modeIndicator.querySelector('.mode-tooltip-custom');
            let tooltipHover = false;
            let indicatorHover = false;

            function showTooltip() {
                updateModeTooltipCustom();
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';
            }
            function hideTooltip() {
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
            }

            modeIndicator.addEventListener('mouseenter', function () {
                indicatorHover = true;
                showTooltip();
            });
            modeIndicator.addEventListener('mouseleave', function () {
                indicatorHover = false;
                setTimeout(() => {
                    if (!tooltipHover && !indicatorHover) hideTooltip();
                }, 50);
            });
            tooltip.addEventListener('mouseenter', function () {
                tooltipHover = true;
                showTooltip();
            });
            tooltip.addEventListener('mouseleave', function () {
                tooltipHover = false;
                setTimeout(() => {
                    if (!tooltipHover && !indicatorHover) hideTooltip();
                }, 50);
            });
            if (window.serviceCache) {
                window.serviceCache.registerUpdateCallback(() => {
                    if (indicatorHover || tooltipHover) {
                        updateModeTooltipCustom();
                    }
                });
            }
            modeIndicator.addEventListener('click', function (e) {
                // Prevent click on the link from firing twice
                if (e.target.closest('#modeTooltipDetailsLink')) return;
                if (typeof showServiceStatus === 'function') {
                    showServiceStatus();
                }
            });
            const detailsLink = tooltip.querySelector('#modeTooltipDetailsLink');
            if (detailsLink) {
                detailsLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (typeof showServiceStatus === 'function') {
                        showServiceStatus();
                    }
                });
            }
        }

        // Studio status button click handler
        const studioBtn = document.getElementById('studioStatusBtn');
        if (studioBtn) {
            studioBtn.addEventListener('click', async function () {
                // Check if user is logged in
                try {
                    const response = await fetch('/api/auth/status');
                    if (response.ok) {
                        const data = await response.json();
                        if (data.authenticated) {
                            // User is logged in - show account dialog with logout option
                            showStudioAccountDialog(data.username);
                        } else {
                            // User not logged in - show login dialog
                            if (typeof showStudioLoginDialog === 'function') {
                                showStudioLoginDialog();
                            }
                        }
                    } else {
                        // Error checking status - show login dialog
                        if (typeof showStudioLoginDialog === 'function') {
                            showStudioLoginDialog();
                        }
                    }
                } catch (e) {
                    // Network error - show login dialog
                    if (typeof showStudioLoginDialog === 'function') {
                        showStudioLoginDialog();
                    }
                }
            });
        }

        // Initial Studio status check
        updateStudioStatus();
    }, 0);

    updateRecordingButtonForStorage();
}

// Update Studio login status indicator
async function updateStudioStatus() {
    const statusDot = document.getElementById('studioStatusDot');
    const statusText = document.getElementById('studioStatusText');
    if (!statusDot || !statusText) return;

    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                statusDot.classList.remove('logged-out');
                statusDot.classList.add('logged-in');
                statusText.textContent = `Logged in as ${data.username || 'User'}`;
            } else {
                statusDot.classList.remove('logged-in');
                statusDot.classList.add('logged-out');
                statusText.textContent = 'Not logged in';
            }
        } else {
            statusDot.classList.remove('logged-in');
            statusDot.classList.add('logged-out');
            statusText.textContent = 'Not logged in';
        }
    } catch (e) {
        statusDot.classList.remove('logged-in');
        statusDot.classList.add('logged-out');
        statusText.textContent = 'Status unavailable';
    }
}

// Expose globally so login dialog can trigger immediate refresh
window.updateStudioStatus = updateStudioStatus;

// Show Studio account dialog with logout option
function showStudioAccountDialog(username) {
    let dialog = document.getElementById('studioAccountDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'studioAccountDialog';
        dialog.className = 'modal';

        // Build dialog content using safe DOM methods
        const modalBox = document.createElement('div');
        modalBox.className = 'modal-box';
        modalBox.style.cssText = 'max-width: 350px; padding: 1.5rem;';

        const title = document.createElement('h2');
        title.style.cssText = 'font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;';
        title.textContent = 'EdgeFirst Studio';
        modalBox.appendChild(title);

        // Status container
        const statusContainer = document.createElement('div');
        statusContainer.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding: 1rem; background: #f0fdf4; border-radius: 0.5rem;';

        const statusDot = document.createElement('div');
        statusDot.style.cssText = 'width: 12px; height: 12px; background: #22c55e; border-radius: 50%;';
        statusContainer.appendChild(statusDot);

        const statusInfo = document.createElement('div');
        const connectedLabel = document.createElement('div');
        connectedLabel.style.fontWeight = '500';
        connectedLabel.textContent = 'Connected';
        statusInfo.appendChild(connectedLabel);

        const usernameEl = document.createElement('div');
        usernameEl.id = 'studioAccountUsername';
        usernameEl.style.cssText = 'color: #666; font-size: 0.875rem;';
        statusInfo.appendChild(usernameEl);
        statusContainer.appendChild(statusInfo);
        modalBox.appendChild(statusContainer);

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 0.75rem; justify-content: flex-end;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'studioAccountCloseBtn';
        closeBtn.className = 'mcap-btn-secondary';
        closeBtn.style.padding = '0.5rem 1rem';
        closeBtn.textContent = 'Close';
        buttonContainer.appendChild(closeBtn);

        const logoutBtn = document.createElement('button');
        logoutBtn.type = 'button';
        logoutBtn.id = 'studioAccountLogoutBtn';
        logoutBtn.style.cssText = 'padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 0.375rem; cursor: pointer;';
        logoutBtn.textContent = 'Logout';
        buttonContainer.appendChild(logoutBtn);

        modalBox.appendChild(buttonContainer);
        dialog.appendChild(modalBox);
        document.body.appendChild(dialog);

        // Close button handler
        closeBtn.addEventListener('click', () => {
            dialog.close();
        });

        // Logout button handler
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
                // Update global auth state
                if (window.studioAuth) {
                    window.studioAuth.isLoggedIn = false;
                    window.studioAuth.username = null;
                }
                // Refresh navbar status
                updateStudioStatus();
                dialog.close();
                // Show toast notification if available
                if (typeof window.showToast === 'function') {
                    window.showToast('Logged out from EdgeFirst Studio');
                }
            } catch (e) {
                console.error('Logout error:', e);
            }
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.close();
            }
        });
    }

    // Update username display
    const usernameDisplay = dialog.querySelector('#studioAccountUsername');
    if (usernameDisplay) {
        usernameDisplay.textContent = username || 'User';
    }

    dialog.showModal();
}

// Periodically check Studio status
setInterval(updateStudioStatus, 30000);

let navbarRecordingFile = null;

window.wasRecording = false;
window.lowDiskDialogShown = false;

function checkRecordingStatus() {
    fetch('/api/recorder/status')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.text();
        })
        .then(statusText => {
            const isRecording = statusText.trim() === "Recorder is running";
            if (isRecording) {
                window.lowDiskDialogShown = false;
                return fetch('/api/recorder/current')
                    .then(response => response.json())
                    .then(data => {
                        navbarRecordingFile = data.status === "recording" ? data.filename : null;
                        updateRecordingUI(true);
                        window.wasRecording = true;
                    });
            } else {
                navbarRecordingFile = null;
                fetch('/api/storage')
                    .then(resp => resp.ok ? resp.json() : null)
                    .then(async info => {
                        let availValue = 0;
                        if (info && info.available_space && typeof info.available_space === 'object') {
                            const availObj = info.available_space;
                            const unit = (availObj.unit || '').toUpperCase();
                            if (unit === 'GB') availValue = availObj.value;
                            else if (unit === 'MB') availValue = availObj.value / 1024;
                            else if (unit === 'TB') availValue = availObj.value * 1024;
                            else availValue = availObj.value; // fallback
                        }
                        updateRecordingUI(false);
                        if (window.wasRecording && availValue < 0.5 && !window.lowDiskDialogShown) {
                            showLowDiskDialog('Recording stopped because there is less than 500MB free disk space.');
                            window.lowDiskDialogShown = true;
                            updateRecordingButtonForStorage();
                        }
                        window.wasRecording = false;
                    })
                    .catch(() => {
                        updateRecordingUI(false);
                        window.wasRecording = false;
                    });
            }
        })
        .catch(error => {
            console.error('Error checking recording status:', error);
            navbarRecordingFile = null;
            updateRecordingUI(false);
            window.wasRecording = false;
        });
}

function updateRecordingUI(isRecording) {
    const recordingButton = document.getElementById('recordingButton');
    if (recordingButton) {
        const recText = recordingButton.querySelector('.rec-text');
        const recDot = recordingButton.querySelector('.rec-dot');
        const tooltip = recordingButton.querySelector('.rec-tooltip');
        if (isRecording) {
            recordingButton.classList.add('recording');
            recordingButton.setAttribute('aria-pressed', 'true');
            recordingButton.setAttribute('aria-label', 'Stop Recording');
            if (recText) recText.textContent = 'REC';
            if (tooltip) tooltip.textContent = 'Stop Recording';
            if (recDot) recDot.style.background = 'white';
            localStorage.setItem('recordingStatus', 'recording');
        } else {
            recordingButton.classList.remove('recording');
            recordingButton.setAttribute('aria-pressed', 'false');
            recordingButton.setAttribute('aria-label', 'Start Recording');
            if (recText) recText.textContent = 'REC';
            if (tooltip) tooltip.textContent = 'Start Recording';
            if (recDot) recDot.style.background = '#111';
            localStorage.setItem('recordingStatus', 'not-recording');
        }
    }
}

function showRecCheckmark() {
    const recordingButton = document.getElementById('recordingButton');
    if (recordingButton) {
        const recCheck = recordingButton.querySelector('.rec-check');
        if (recCheck) {
            recCheck.classList.remove('hidden');
            setTimeout(() => {
                recCheck.classList.add('hidden');
            }, 900);
        }
    }
}

function startRecording() {
    fetch('/api/recorder/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.text();
        })
        .then(text => {
            navbarRecordingFile = null;
            updateRecordingUI(true);
            showRecCheckmark();
        })
        .catch(error => {
            console.error('Error starting recording:', error);
            alert(`Error starting recording: ${error.message}`);
            updateRecordingUI(false);
        });
}

function stopRecording() {
    fetch('/api/recorder/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            return response.text();
        })
        .then(text => {
            navbarRecordingFile = null;
            updateRecordingUI(false);
            showRecCheckmark();
        })
        .catch(error => {
            console.error('Error stopping recording:', error);
            alert(`Error stopping recording: ${error.message}`);
            updateRecordingUI(true);
        });
}

function ensureFileDetailsModal() {
    if (!document.getElementById('myModal')) {
        const dialog = document.createElement('dialog');
        dialog.id = 'myModal';
        dialog.className = 'bg-white rounded-lg shadow-lg p-6 w-[600px]';
        dialog.innerHTML = '<div id="modalDetails"></div>';
        document.body.appendChild(dialog);
    }
}

function updateModeTooltipCustom() {
    if (!window.serviceCache) return;
    const tooltipContent = document.getElementById('modeTooltipContent');
    if (!tooltipContent) return;
    const serviceStatuses = window.serviceCache.serviceStatuses;
    if (!serviceStatuses) {
        tooltipContent.innerHTML = '<span>Loading services...</span>';
        return;
    }
    if (!Array.isArray(serviceStatuses)) {
        tooltipContent.textContent = 'Unknown status';
        return;
    }
    const allRunning = serviceStatuses.every(s => (typeof s.status === 'string' ? s.status : s.status?.status) === 'running');
    tooltipContent.replaceChildren();
    if (allRunning) {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        const dot = document.createElement('span');
        dot.style.cssText = 'color:#22c55e;font-size:1.2em;';
        dot.textContent = '\u25CF';
        const label = document.createElement('span');
        label.className = 'text-green-700';
        label.textContent = 'All Services Running';
        row.appendChild(dot);
        row.appendChild(label);
        tooltipContent.appendChild(row);
    } else {
        const stopped = serviceStatuses.filter(s => (typeof s.status === 'string' ? s.status : s.status?.status) !== 'running');
        if (stopped.length === 0) {
            tooltipContent.textContent = 'Unknown status';
        } else {
            stopped.forEach(s => {
                const serviceName = (s.service || s.name || 'Unknown')
                    .replace('.service', '')
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                let statusStr = typeof s.status === 'string' ? s.status : (s.status?.status || JSON.stringify(s.status));
                statusStr = statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
                const row = document.createElement('div');
                row.className = 'flex items-center gap-2';
                const dot = document.createElement('span');
                dot.style.cssText = 'color:#ef4444;font-size:1.2em;';
                dot.textContent = '\u25CF';
                const label = document.createElement('span');
                label.className = 'text-red-700';
                label.textContent = `${serviceName}: ${statusStr}`;
                row.appendChild(dot);
                row.appendChild(label);
                tooltipContent.appendChild(row);
            });
        }
    }
}

// Function to check storage and update the recording button
async function updateRecordingButtonForStorage() {
    try {
        const response = await fetch('/api/storage');
        const data = await response.json();
        const recordingButton = document.getElementById('recordingButton');

        const availObj = data.available_space;
        let availValueGB = 0;
        if (availObj && typeof availObj === 'object') {
            const unit = (availObj.unit || '').toUpperCase();
            if (unit === 'GB') availValueGB = availObj.value;
            else if (unit === 'MB') availValueGB = availObj.value / 1024;
            else if (unit === 'TB') availValueGB = availObj.value * 1024;
            else availValueGB = availObj.value; // fallback
        }
        if (recordingButton) {
            if (availObj === null || typeof availObj !== 'object' || availValueGB >= 0.5) {
                recordingButton.classList.remove('opacity-50');
                recordingButton.removeAttribute('disabled');
                recordingButton.title = '';
            } else {
                recordingButton.classList.add('opacity-50');
                recordingButton.setAttribute('disabled', 'disabled');
                recordingButton.title = 'Not enough space to record (less than 500MB free)';
            }
        }
    } catch (e) { }
}

setTimeout(updateRecordingButtonForStorage, 0);
setInterval(updateRecordingButtonForStorage, 30000);

function showLowDiskDialog(message) {
    let dialog = document.getElementById('lowDiskDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'lowDiskDialog';
        dialog.style.padding = '0';
        dialog.innerHTML = `
            <form method="dialog" style="margin:0;">
                <div style="padding: 2rem 2.5rem; background: #181a2a; color: #fff; border-radius: 1rem; min-width: 320px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.18); display: flex; flex-direction: column; align-items: center;">
                    <div style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: #facc15; display: flex; align-items: center; gap: 0.5rem;">
                        <svg style='width:1.5em;height:1.5em;vertical-align:-0.2em;' fill='none' stroke='currentColor' stroke-width='2' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' stroke='#facc15' stroke-width='2' fill='none'/><path d='M12 8v4m0 4h.01' stroke='#facc15' stroke-width='2' stroke-linecap='round'/></svg>
                        Low Disk Space
                    </div>
                    <div style="margin-bottom: 1.5rem; text-align: center; font-size: 1.08rem; color: #fff;">${message}</div>
                    <button type="submit" style="background: #E8B820; color: #222; font-weight: 600; border: none; border-radius: 0.5rem; padding: 0.6rem 2.2rem; font-size: 1.08rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">OK</button>
                </div>
            </form>
        `;
        document.body.appendChild(dialog);
    } else {
        dialog.querySelector('div[style*="margin-bottom: 1.5rem;"]').textContent = message;
    }
    dialog.showModal();
}

setInterval(checkRecordingStatus, 10000);
