// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Shared save path for the service configuration pages.
//
// websrv answers POST /api/config/{service} with a JSON object for every
// outcome, and several of those outcomes carry detail the user needs:
//
//   - HTTP 200 with `restart_error` means the file was written but the unit
//     failed to come back up. `response.ok` is true, so a page that only
//     checks the status reports a successful save while the service is down.
//   - HTTP 400 with `rejected` names each refused key and why. Nothing was
//     written; the file is unchanged.
//   - HTTP 404 with `tried` means the service has no configuration file.
//   - `unmatched` names keys that existed nowhere in the file, active or
//     commented, and so were appended as new lines.
//
// Pages call `saveServiceConfig` and show `result.message`. `fileName` is
// added here rather than by each page: websrv requires it to match the
// {service} URL segment, and deriving both from one argument makes them
// unable to disagree.

const SAVE_TIMEOUT_MS = 30000;

/**
 * Turn a `rejected` entry into a sentence. The value is a single-variant
 * enum serialised as `{ "invalid_value": "value contains ..." }`.
 */
function describeReject(reject) {
    if (typeof reject === 'string') {
        return reject;
    }
    if (reject && typeof reject === 'object') {
        const reason = Object.values(reject)[0];
        if (typeof reason === 'string') {
            return reason;
        }
    }
    return 'refused';
}

/**
 * Describe a request that changed nothing. `rejected` is populated for
 * invalid keys and values; everything else arrives as `error`.
 */
function describeFailure(service, status, body) {
    // No JSON body means something other than websrv answered — a proxy, or
    // a gateway error. Nothing can be said about whether the file was
    // written, so do not claim it was left alone.
    if (!body) {
        return `Could not save the ${service} configuration: the server answered HTTP ${status} with no detail. Reload the page to see the stored values.`;
    }

    const rejected = body.rejected || {};
    const keys = Object.keys(rejected);
    if (keys.length > 0) {
        const lines = keys.map(key => `${key} — ${describeReject(rejected[key])}`);
        return [
            `Could not save the ${service} configuration. The file was left unchanged.`,
            '',
            ...lines
        ].join('\n');
    }

    const detail = body.error || `HTTP ${status}`;
    const message = `Could not save the ${service} configuration: ${detail}`;
    if (Array.isArray(body.tried) && body.tried.length > 0) {
        return `${message}\n\nLooked for:\n${body.tried.join('\n')}`;
    }
    return message;
}

/**
 * Describe a 200. Not every 200 is a clean save: the restart is attempted
 * after the write has already succeeded, so a failed restart is reported
 * here rather than as an HTTP error.
 */
function describeSuccess(service, body) {
    if (!body.applied) {
        return {
            level: 'info',
            message: `No changes to save. The ${service} configuration already holds these values.`
        };
    }

    const appended = Array.isArray(body.unmatched) ? body.unmatched : [];
    const note = appended.length > 0
        ? `\n\nAdded as new settings, having appeared nowhere in the file: ${appended.join(', ')}.`
        : '';

    if (body.restart_error) {
        return {
            level: 'warning',
            message: `Configuration saved, but ${service} failed to restart.\n\n${body.restart_error}\n\nThe service may be stopped. Check its status before relying on the new settings.${note}`
        };
    }

    if (body.restarted) {
        return {
            level: 'success',
            message: `Configuration saved and ${service} restarted.${note}`
        };
    }

    return {
        level: 'success',
        message: `Configuration saved. ${service} is not running, so it was not restarted.${note}`
    };
}

/**
 * POST a service configuration and describe what happened.
 *
 * Never rejects: a transport failure is reported as an error result, so
 * callers do not need a `.catch` to hide their loading overlay.
 *
 * @param {string} service - Service name, used as both the URL segment and
 *     the body's `fileName`.
 * @param {object} values - Configuration keys to write. A JSON `null` value
 *     comments the key out; omit a key to leave it alone.
 * @returns {Promise<{ok: boolean, level: string, message: string, body: ?object}>}
 */
async function saveServiceConfig(service, values) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
        return await requestSave(service, values, controller.signal);
    } finally {
        // Cleared only once the body has been read, so the deadline covers
        // the whole exchange rather than just the response headers.
        clearTimeout(timeout);
    }
}

/**
 * Describe an exchange that gave no usable answer. Neither a timeout nor a
 * transport failure says whether websrv wrote the file, so neither may claim
 * it did or did not.
 */
function indeterminate(service, error) {
    const reason = error.name === 'AbortError'
        ? `The server did not answer within ${SAVE_TIMEOUT_MS / 1000} seconds.`
        : 'The server could not be reached.';
    return {
        ok: false,
        level: 'error',
        message: `Could not save the ${service} configuration. ${reason} It may or may not have been written; reload the page to see the current values.`,
        body: null
    };
}

async function requestSave(service, values, signal) {
    let response;
    try {
        response = await fetch(`/api/config/${service}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Spread first so the derived fileName wins: a caller passing its
            // own would otherwise recreate the URL/body mismatch this helper
            // exists to prevent, which websrv rejects with 400.
            body: JSON.stringify({ ...values, fileName: service }),
            signal
        });
    } catch (error) {
        console.error(`Error saving ${service} configuration:`, error);
        return indeterminate(service, error);
    }

    // websrv answers in JSON for every outcome, including the 400 and 415
    // its extractor raises before the handler runs. A body that will not
    // parse means something other than websrv answered.
    let body = null;
    try {
        body = await response.json();
    } catch (error) {
        console.error(`Unparseable response saving ${service} configuration:`, error);
        // The deadline covers the whole exchange, so it can fire after the
        // headers have arrived but while the body is still being read.
        // Falling through would report that 200 as a probable success.
        if (error.name === 'AbortError') {
            return indeterminate(service, error);
        }
    }

    if (!response.ok) {
        const message = describeFailure(service, response.status, body);
        console.error(`Error saving ${service} configuration:`, response.status, body);
        return { ok: false, level: 'error', message, body };
    }

    if (!body) {
        return {
            ok: true,
            level: 'warning',
            message: `The ${service} configuration was accepted, but the server's reply could not be read, so whether the service restarted is unknown. Reload the page to see the stored values.`,
            body: null
        };
    }

    const outcome = describeSuccess(service, body);
    if (outcome.level === 'warning') {
        console.warn(`${service} restart failed after save:`, body);
    }
    return { ok: true, level: outcome.level, message: outcome.message, body };
}

window.saveServiceConfig = saveServiceConfig;
