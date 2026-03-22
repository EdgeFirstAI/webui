// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
    listPrograms, startProgram, stopProgram, deleteProgram,
    downloadProgram, createProgram, connectLogs
} from './programApi.js';
import { loadBundle } from './efapp.js';

// --- State ---
let programs = [];
let activeLogId = null;
let logWebSocket = null;
let pollInterval = null;
const LOG_BUFFER_MAX = 500;

// --- DOM refs ---
const grid = document.getElementById('program-grid');
const emptyState = document.getElementById('empty-state');
const logPanel = document.getElementById('log-panel');
const logPanelTitle = document.getElementById('log-panel-title');
const logPanelBody = document.getElementById('log-panel-body');
const logPanelClose = document.getElementById('log-panel-close');
const importFile = document.getElementById('import-file');

// --- Card rendering ---

function createStatusSpan(status) {
    const icons = { running: '\u25cf', stopped: '\u25cb', error: '\u25cf', deploying: '\u25cf' };
    const labels = { running: 'Running', stopped: 'Stopped', error: 'Error', deploying: 'Deploying' };
    const span = document.createElement('span');
    span.className = `program-card-status ${status}`;
    span.textContent = `${icons[status] || '\u25cb'} ${labels[status] || status}`;
    return span;
}

function createCardButton(text, className, testId, handler) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.dataset.testid = testId;
    btn.textContent = text;
    btn.addEventListener('click', handler);
    return btn;
}

function renderCards() {
    grid.replaceChildren();

    if (programs.length === 0) {
        emptyState.style.display = '';
        return;
    }
    emptyState.style.display = 'none';

    for (const p of programs) {
        const card = document.createElement('div');
        card.className = 'program-card';
        card.setAttribute('role', 'listitem');
        card.dataset.status = p.status;
        card.dataset.testid = `programs-card-${p.id}`;

        // Header
        const header = document.createElement('div');
        header.className = 'program-card-header';
        const name = document.createElement('span');
        name.className = 'program-card-name';
        name.textContent = p.name;
        header.appendChild(name);
        header.appendChild(createStatusSpan(p.status));
        card.appendChild(header);

        // Description
        const desc = document.createElement('div');
        desc.className = 'program-card-desc';
        desc.textContent = p.description || '';
        card.appendChild(desc);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'program-card-actions';
        actions.appendChild(createCardButton('Edit', 'btn-edit', `programs-btn-edit-${p.id}`,
            () => { location.href = `program-editor.html?id=${p.id}`; }));
        actions.appendChild(createCardButton('Logs', 'btn-action', `programs-btn-logs-${p.id}`,
            () => showLogs(p.id)));
        if (p.status === 'running') {
            actions.appendChild(createCardButton('Stop', 'btn-action', `programs-btn-stop-${p.id}`,
                () => handleStop(p.id)));
        } else {
            actions.appendChild(createCardButton('Start', 'btn-action', `programs-btn-start-${p.id}`,
                () => handleStart(p.id)));
        }
        actions.appendChild(createCardButton('Export', 'btn-action', `programs-btn-export-${p.id}`,
            () => handleExport(p.id)));
        actions.appendChild(createCardButton('Delete', 'btn-delete', `programs-btn-delete-${p.id}`,
            () => handleDelete(p.id)));
        card.appendChild(actions);

        grid.appendChild(card);
    }
}

// --- Status polling ---

async function refreshPrograms() {
    try {
        programs = await listPrograms();
        renderCards();
    } catch (err) {
        console.error('Failed to refresh programs:', err);
    }
}

function startPolling() {
    if (pollInterval) return; // Prevent duplicate intervals
    refreshPrograms();
    pollInterval = setInterval(refreshPrograms, 5000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// Pause polling and reconnect logs when tab visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        stopPolling();
    } else {
        startPolling();
        // Reconnect log WebSocket if it was disconnected while hidden
        if (activeLogId && (!logWebSocket || logWebSocket.readyState !== WebSocket.OPEN)) {
            logReconnectDelay = 100;
            connectLogStream(activeLogId);
        }
    }
});

window.addEventListener('beforeunload', () => {
    stopPolling();
    if (logWebSocket) logWebSocket.close();
});

// --- Log panel ---

let logReconnectDelay = 100;

function showLogs(id) {
    if (logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }
    activeLogId = id;
    logPanelBody.replaceChildren();
    logPanelTitle.textContent = `Logs \u2014 ${programs.find(p => p.id === id)?.name || id}`;
    logPanel.classList.add('visible');
    logReconnectDelay = 100;
    connectLogStream(id);
}

function hideLogs() {
    logPanel.classList.remove('visible');
    activeLogId = null;
    if (logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }
}

function connectLogStream(id) {
    logWebSocket = connectLogs(id, (msg) => {
        logReconnectDelay = 100; // Reset on successful message
        const line = document.createElement('div');
        line.className = `log-line ${msg.level || 'info'}`;
        const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
        line.textContent = `[${ts}] ${msg.message}`;
        logPanelBody.appendChild(line);

        // Cap buffer
        while (logPanelBody.children.length > LOG_BUFFER_MAX) {
            logPanelBody.removeChild(logPanelBody.firstChild);
        }

        // Auto-scroll
        logPanelBody.scrollTop = logPanelBody.scrollHeight;
    }, () => {
        // Reconnect with backoff, paused when hidden
        if (activeLogId === id && document.visibilityState !== 'hidden') {
            setTimeout(() => {
                if (activeLogId === id) connectLogStream(id);
            }, logReconnectDelay);
            logReconnectDelay = Math.min(logReconnectDelay * 2, 8000);
        }
    });
}

logPanelClose.addEventListener('click', hideLogs);

// --- Toast ---

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 100;
        padding: 12px 20px; border-radius: 6px; font-size: 0.9rem;
        color: white; background: ${isError ? 'var(--color-status-error, #ef4444)' : 'var(--color-status-success, #22c55e)'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;
    `;
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Actions ---

async function handleStart(id) {
    try {
        await startProgram(id);
        showToast('Program started');
        await refreshPrograms();
    } catch (err) {
        showToast('Failed to start: ' + err.message, true);
    }
}

async function handleStop(id) {
    try {
        await stopProgram(id);
        showToast('Program stopped');
        await refreshPrograms();
    } catch (err) {
        showToast('Failed to stop: ' + err.message, true);
    }
}

async function handleDelete(id) {
    const program = programs.find(p => p.id === id);
    if (!confirm(`Delete "${program?.name || id}"? This cannot be undone.`)) return;
    try {
        await deleteProgram(id);
        if (activeLogId === id) hideLogs();
        showToast('Program deleted');
        await refreshPrograms();
    } catch (err) {
        showToast('Failed to delete: ' + err.message, true);
    }
}

async function handleExport(id) {
    try {
        const bytes = await downloadProgram(id);
        const program = programs.find(p => p.id === id);
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${program?.name || id}.efapp`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        console.error('Failed to export program:', err);
    }
}

// --- Import ---

importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFile.value = '';

    try {
        const bytes = await file.arrayBuffer();
        // Validate bundle structure first
        await loadBundle(bytes);
        // Upload to server
        const blob = new Blob([bytes], { type: 'application/zip' });
        await createProgram(blob);
        await refreshPrograms();
    } catch (err) {
        alert('Import failed:\n' + err.message);
    }
});

// --- Init ---

startPolling();
