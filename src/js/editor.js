// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Blockly, En, pythonGenerator } from './vendor/blockly.es.js';
import { register, edgefirstToolbox, edgefirstTheme } from './vendor/edgefirst-blockly.es.js';
import { buildBundle, loadBundle } from './efapp.js';
import {
    updateProgram, createProgram, downloadProgram,
    startProgram, stopProgram, connectLogs, ApiError
} from './programApi.js';

// --- State ---
let workspace = null;
let programId = null;
let programName = 'Untitled';
let programCreated = null;
let isDirty = false;
let codeVisible = false;
let logVisible = false;
let logWebSocket = null;
let lastGeneratedCode = '';
let draftTimer = null;

// --- DOM refs ---
const nameInput = document.getElementById('editor-name');
const workspaceDiv = document.getElementById('blockly-workspace');
const spinner = document.getElementById('workspace-spinner');
const codePanel = document.getElementById('editor-code-panel');
const codeOutput = document.getElementById('code-output');
const logPanel = document.getElementById('editor-log-panel');
const logBody = document.getElementById('log-drawer-body');

const btnSave = document.getElementById('btn-save');
const btnDeploy = document.getElementById('btn-deploy');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnCode = document.getElementById('btn-code');
const btnLogs = document.getElementById('btn-logs');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnLogClose = document.getElementById('btn-log-close');

// --- Blockly initialization ---

function init() {
    Blockly.setLocale(En);
    register();

    workspace = Blockly.inject(workspaceDiv, {
        toolbox: edgefirstToolbox,
        theme: edgefirstTheme,
        renderer: 'zelos',
        grid: { spacing: 20, length: 3, colour: '#444', snap: true },
        zoom: { controls: true, wheel: true, startScale: 1.0, pinch: true },
        trashcan: true,
        sounds: false,
        maxUndoStackSize: 64,
    });

    // Remove spinner
    if (spinner) spinner.remove();

    // Track changes
    workspace.addChangeListener((event) => {
        if (event.isUiEvent) return;
        isDirty = true;

        // Code generation (only when visible)
        if (codeVisible) {
            scheduleCodeGen();
        }

        // Draft auto-save (debounced 10s)
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraft, 10000);
    });

    // Wire up buttons
    btnSave.addEventListener('click', save);
    btnDeploy.addEventListener('click', deploy);
    btnStart.addEventListener('click', () => handleStartStop('start'));
    btnStop.addEventListener('click', () => handleStartStop('stop'));
    btnCode.addEventListener('click', toggleCode);
    btnLogs.addEventListener('click', toggleLogs);
    btnCopyCode.addEventListener('click', copyCode);
    btnLogClose.addEventListener('click', () => toggleLogs(false));
    nameInput.addEventListener('input', () => {
        programName = nameInput.value;
        isDirty = true;
    });

    // Ctrl+S / Cmd+S keyboard shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            save();
        }
    });

    // Unsaved changes warning
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
        if (logWebSocket) logWebSocket.close();
    });
}

// --- Code preview ---

let codeGenPending = null;

function scheduleCodeGen() {
    if (codeGenPending) return;
    if (typeof requestIdleCallback === 'function') {
        codeGenPending = requestIdleCallback(generateCode, { timeout: 500 });
    } else {
        codeGenPending = setTimeout(generateCode, 100);
    }
}

function generateCode() {
    codeGenPending = null;
    const code = pythonGenerator.workspaceToCode(workspace);
    if (code === lastGeneratedCode) return;
    lastGeneratedCode = code;
    renderHighlightedCode(code);
}

function renderHighlightedCode(code) {
    // Clear and rebuild with safe DOM methods
    codeOutput.textContent = '';

    // Simple line-by-line highlighting
    const lines = code.split('\n');
    for (const line of lines) {
        const lineEl = document.createElement('div');
        highlightLine(line, lineEl);
        codeOutput.appendChild(lineEl);
    }
}

function highlightLine(line, container) {
    // Comment
    const commentIdx = line.indexOf('#');
    if (commentIdx === 0) {
        const span = document.createElement('span');
        span.className = 'cmt';
        span.textContent = line;
        container.appendChild(span);
        return;
    }

    // Simple keyword + string highlighting
    const keywords = /\b(import|from|def|class|if|else|elif|for|while|return|async|await|try|except|finally|with|as|in|not|and|or|True|False|None|pass|break|continue|raise|yield)\b/g;
    const parts = line.split(keywords);

    for (const part of parts) {
        if (!part) continue;
        if (keywords.test(part)) {
            keywords.lastIndex = 0; // reset regex state
            const span = document.createElement('span');
            span.className = 'kw';
            span.textContent = part;
            container.appendChild(span);
        } else {
            container.appendChild(document.createTextNode(part));
        }
    }
}

function toggleCode(forceState) {
    codeVisible = typeof forceState === 'boolean' ? forceState : !codeVisible;
    codePanel.classList.toggle('visible', codeVisible);
    workspaceDiv.classList.toggle('code-open', codeVisible);

    // Resize Blockly workspace to fit new bounds
    Blockly.svgResize(workspace);

    if (codeVisible) {
        generateCode();
    }
}

function copyCode() {
    navigator.clipboard.writeText(lastGeneratedCode).then(() => {
        btnCopyCode.textContent = 'Copied!';
        setTimeout(() => { btnCopyCode.textContent = 'Copy'; }, 2000);
    });
}

// --- Save / Deploy ---

let lastSaveBlob = null;

async function save() {
    const wsJson = Blockly.serialization.workspaces.save(workspace);
    const code = pythonGenerator.workspaceToCode(workspace);
    const blob = await buildBundle(wsJson, code, {
        name: programName,
        description: '',
        created: programCreated || new Date().toISOString(),
    });
    lastSaveBlob = blob;

    try {
        let result;
        if (programId) {
            result = await updateProgram(programId, blob);
        } else {
            result = await createProgram(blob);
            programId = result.id;
            programCreated = new Date().toISOString();
            // Update URL without reload
            const url = new URL(location);
            url.searchParams.set('id', programId);
            history.replaceState(null, '', url);
        }
        isDirty = false;
        clearDraft();
        showToast('Saved');
    } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
            if (confirm('A program with this name already exists. Open it for editing?')) {
                // Try to find the existing program's ID from the error
                location.href = `program-editor.html`;
            }
        } else {
            showToast('Save failed: ' + err.message, true);
        }
    }
}

async function deploy() {
    await save();
    if (programId) {
        try {
            await startProgram(programId);
            showToast('Deployed and started');
        } catch (err) {
            showToast('Deploy failed: ' + err.message, true);
        }
    }
}

async function handleStartStop(action) {
    if (!programId) return;
    try {
        if (action === 'start') {
            await startProgram(programId);
            showToast('Started');
        } else {
            await stopProgram(programId);
            showToast('Stopped');
        }
    } catch (err) {
        showToast(`${action} failed: ${err.message}`, true);
    }
}

// --- Load ---

async function loadProgram(id) {
    // Check sessionStorage cache first
    const cacheKey = `efapp-cache-${id}`;
    const cached = sessionStorage.getItem(cacheKey);

    let wsState, config;
    if (cached) {
        const parsed = JSON.parse(cached);
        wsState = parsed.workspace;
        config = parsed.config;
    } else {
        try {
            const bytes = await downloadProgram(id);
            const bundle = await loadBundle(bytes);
            wsState = bundle.workspace;
            config = bundle.config;
            // Cache for re-opens
            sessionStorage.setItem(cacheKey, JSON.stringify(bundle));
        } catch (err) {
            showToast('Failed to load program: ' + err.message, true);
            return;
        }
    }

    // Count blocks before loading
    const serializedBlockCount = wsState.blocks?.blocks?.length || 0;

    Blockly.serialization.workspaces.load(wsState, workspace);

    // Check for missing blocks
    const liveBlockCount = workspace.getAllBlocks(false).length;
    if (serializedBlockCount > 0 && liveBlockCount < serializedBlockCount) {
        const missing = serializedBlockCount - liveBlockCount;
        showToast(`${missing} block(s) could not be loaded (created with a newer version of EdgeFirst Blockly)`, true);
    }

    programName = config.name || 'Untitled';
    programCreated = config.created;
    nameInput.value = programName;
    isDirty = false;
}

// --- Draft persistence ---

function saveDraft() {
    const state = Blockly.serialization.workspaces.save(workspace);
    const key = `efapp-draft-${programId || 'new'}`;
    localStorage.setItem(key, JSON.stringify({
        state,
        name: programName,
        timestamp: Date.now(),
    }));
}

function clearDraft() {
    localStorage.removeItem(`efapp-draft-${programId || 'new'}`);
}

function checkDraftRecovery() {
    const key = `efapp-draft-${programId || 'new'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;

    try {
        const draft = JSON.parse(raw);
        if (confirm('You have unsaved changes from a previous session. Restore?')) {
            Blockly.serialization.workspaces.load(draft.state, workspace);
            programName = draft.name || programName;
            nameInput.value = programName;
            isDirty = true;
            return true;
        } else {
            localStorage.removeItem(key);
        }
    } catch {
        localStorage.removeItem(key);
    }
    return false;
}

// --- Log drawer ---

const LOG_BUFFER_MAX = 500;
let logReconnectDelay = 100;

function toggleLogs(forceState) {
    logVisible = typeof forceState === 'boolean' ? forceState : !logVisible;
    logPanel.classList.toggle('visible', logVisible);

    if (logVisible && programId) {
        logReconnectDelay = 100;
        connectLogStream();
    } else if (!logVisible && logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }
}

function connectLogStream() {
    if (logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }

    logWebSocket = connectLogs(programId, (msg) => {
        const line = document.createElement('div');
        line.className = `log-line ${msg.level || 'info'}`;
        const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
        line.textContent = `[${ts}] ${msg.message}`;
        logBody.appendChild(line);

        while (logBody.children.length > LOG_BUFFER_MAX) {
            logBody.removeChild(logBody.firstChild);
        }
        logBody.scrollTop = logBody.scrollHeight;
    }, () => {
        if (logVisible && programId && document.visibilityState !== 'hidden') {
            setTimeout(connectLogStream, logReconnectDelay);
            logReconnectDelay = Math.min(logReconnectDelay * 2, 8000);
        }
    });
}

// Reconnect on tab visibility
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && logVisible && programId && !logWebSocket) {
        logReconnectDelay = 100;
        connectLogStream();
    }
});

// --- Toast notifications ---

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 100;
        padding: 12px 20px; border-radius: 6px; font-size: 0.9rem;
        color: white; background: ${isError ? '#ef4444' : '#22c55e'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: opacity 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Startup ---

document.addEventListener('DOMContentLoaded', async () => {
    init();

    // Parse program ID from URL
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (id) {
        programId = id;
        // Check for draft recovery first
        if (!checkDraftRecovery()) {
            await loadProgram(id);
        }
    } else {
        // New program — check for draft of unsaved work
        if (!checkDraftRecovery()) {
            // Place a starter on_message block
            const starterBlock = {
                type: 'edgefirst_zenoh_on_message',
                x: 50,
                y: 50,
            };
            Blockly.serialization.blocks.append(starterBlock, workspace);
        }
    }
});
