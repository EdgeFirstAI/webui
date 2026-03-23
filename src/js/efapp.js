// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// .efapp bundle creation and extraction.
// Lazy-loads JSZip on first use to keep it off the critical path.

let JSZipModule = null;

async function getJSZip() {
    if (!JSZipModule) {
        JSZipModule = await import('./vendor/jszip.js');
    }
    return JSZipModule.default || JSZipModule;
}

/**
 * Build an .efapp bundle from workspace state and generated Python code.
 * Uses STORE compression (no compression) since HTTP transport handles it.
 *
 * @param {Object} workspaceJson - Serialized Blockly workspace
 * @param {string} pythonCode - Generated Python source
 * @param {Object} metadata - { name, description, author, created }
 * @returns {Promise<Blob>} The .efapp ZIP blob
 */
export async function buildBundle(workspaceJson, pythonCode, metadata) {
    const JSZip = await getJSZip();
    const zip = new JSZip();

    const config = {
        version: 1,
        name: metadata.name || 'Untitled',
        description: metadata.description || '',
        author: metadata.author || '',
        created: metadata.created || new Date().toISOString(),
        modified: new Date().toISOString(),
        edgefirst_blockly_version: '0.1.0',
        python: { entry: 'app.py', dependencies: [] },
    };

    zip.file('workspace.json', JSON.stringify(workspaceJson, null, 2));
    zip.file('app.py', pythonCode);
    zip.file('config.json', JSON.stringify(config, null, 2));

    console.log('[efapp] buildBundle config:', config);
    console.log('[efapp] buildBundle app.py length:', pythonCode.length);

    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/**
 * Load an .efapp bundle and extract workspace state + config.
 *
 * @param {ArrayBuffer} zipBytes - Raw ZIP bytes
 * @returns {Promise<{workspace: Object, config: Object}>}
 * @throws {Error} If the bundle is invalid (missing required files)
 */
export async function loadBundle(zipBytes) {
    const JSZip = await getJSZip();
    const zip = await JSZip.loadAsync(zipBytes);

    const errors = [];
    const workspaceFile = zip.file('workspace.json');
    const configFile = zip.file('config.json');
    const appFile = zip.file('app.py');

    if (!workspaceFile) errors.push('Missing workspace.json');
    if (!configFile) errors.push('Missing config.json');
    if (!appFile) errors.push('Missing app.py');

    if (errors.length > 0) {
        throw new Error('Invalid .efapp bundle:\n' + errors.join('\n'));
    }

    return {
        workspace: JSON.parse(await workspaceFile.async('string')),
        config: JSON.parse(await configFile.async('string')),
    };
}
