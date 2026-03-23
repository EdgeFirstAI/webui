// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const BASE = '/api/programs';

export async function listPrograms() {
    const res = await fetch(BASE);
    if (!res.ok) throw new ApiError(res);
    const data = await res.json();
    return data.programs;
}

export async function createProgram(blob) {
    console.log('[programApi] POST /api/programs', { size: blob.size, type: blob.type });
    const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: blob
    });
    if (!res.ok) throw await ApiError.fromResponse(res, 'POST', BASE);
    return res.json();
}

export async function updateProgram(id, blob) {
    console.log(`[programApi] PUT /api/programs/${id}`, { size: blob.size, type: blob.type });
    const res = await fetch(`${BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: blob
    });
    if (!res.ok) throw await ApiError.fromResponse(res, 'PUT', `${BASE}/${id}`);
    return res.json();
}

export async function downloadProgram(id) {
    const res = await fetch(`${BASE}/${id}`, {
        headers: { 'Accept': 'application/zip' }
    });
    if (!res.ok) throw new ApiError(res);
    return res.arrayBuffer();
}

export async function deleteProgram(id) {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new ApiError(res);
    return res.json();
}

export async function startProgram(id) {
    const res = await fetch(`${BASE}/${id}/start`, { method: 'POST' });
    if (!res.ok) throw new ApiError(res);
    return res.json();
}

export async function stopProgram(id) {
    const res = await fetch(`${BASE}/${id}/stop`, { method: 'POST' });
    if (!res.ok) throw new ApiError(res);
    return res.json();
}

export async function programStatus(id) {
    const res = await fetch(`${BASE}/${id}/status`);
    if (!res.ok) throw new ApiError(res);
    return res.json();
}

export async function probeAvailable() {
    try {
        const res = await fetch(BASE);
        return res.ok;
    } catch {
        return false;
    }
}

export function connectLogs(id, onMessage, onClose, tail = 50) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}${BASE}/${id}/logs?tail=${tail}`;
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
        try {
            onMessage(JSON.parse(e.data));
        } catch {
            onMessage({ level: 'info', message: e.data, timestamp: new Date().toISOString() });
        }
    };
    ws.onclose = () => onClose && onClose();
    ws.onerror = () => ws.close();
    return ws;
}

export class ApiError extends Error {
    constructor(status, statusText, body, method, url) {
        const serverMsg = body?.error || statusText;
        super(`${method || 'API'} ${url || ''} ${status}: ${serverMsg}`);
        this.status = status;
        this.body = body;
        this.serverError = serverMsg;
        this.serverCode = body?.code;
    }

    static async fromResponse(res, method, url) {
        let body = null;
        try {
            body = await res.json();
        } catch {
            // Response body is not JSON
        }
        console.error(`[programApi] ${method} ${url} → ${res.status}`, body || res.statusText);
        return new ApiError(res.status, res.statusText, body, method, url);
    }
}
