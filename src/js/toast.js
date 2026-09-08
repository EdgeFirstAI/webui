// Copyright (C) 2025 Au-Zone Technologies Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Shared toast notifications for the whole WebUI.
//
// Replaces alert() as the way pages report an outcome. alert() blocks the
// page until it is acknowledged, renders unstyled, and cannot show two
// results at once — during a bulk delete of twenty recordings it produced
// twenty modal prompts in sequence. Toasts are non-blocking and stack, so a
// batch that partly failed shows one entry per failure.
//
// Two things are needed to survive an open modal <dialog>, and they are not
// the same problem:
//
//   Painting. A modal dialog renders in the browser's top layer, above every
//   ordinary stacking context, so a plain fixed toast is painted behind it no
//   matter its z-index. A popover shares that top layer, so it paints above.
//
//   Interaction. showModal() makes everything outside the dialog's subtree
//   inert, and inert content cannot be clicked. A popover parented to <body>
//   is therefore visible above an open dialog but its dismiss button does
//   nothing — which strands an error toast, since errors wait to be
//   dismissed. Hosting the container inside the dialog keeps it in the
//   non-inert subtree; it is still a popover, so it still paints on top.
//
// The container therefore follows the topmost modal dialog, moving into it
// while one is open and back to <body> when it closes. Callers that report
// from inside a dialog — the MCAP file browser, the play options modal — are
// the reason this matters.
//
// Levels decide how long a toast lives. Success and info are routine
// acknowledgements and time out; an error carries detail the user has to read
// and act on — a rejected configuration save names every refused key and why —
// so it waits to be dismissed, as alert() did.

const LEVELS = {
    success: { duration: 5000, role: 'status' },
    info: { duration: 5000, role: 'status' },
    warning: { duration: 10000, role: 'alert' },
    // 0 means the toast stays until dismissed.
    error: { duration: 0, role: 'alert' }
};

const DEFAULT_LEVEL = 'info';

// Below this many toasts the individual close buttons are enough; at or above
// it, dismissing a failed batch one by one is tedious.
const DISMISS_ALL_THRESHOLD = 3;

const ICONS = {
    success: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.5"/>',
    warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9.5v4.5"/><path d="M12 17.5v.5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'
};

let container = null;
let dismissAllButton = null;

/** Whether this browser puts popovers in the top layer for us. */
function supportsPopover() {
    return typeof HTMLElement !== 'undefined' &&
        Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
}

/**
 * The element the container has to live under to be both visible and usable.
 * See the note above: <body> is fine until a modal dialog is open, at which
 * point everything outside that dialog stops responding to clicks.
 */
function hostFor() {
    try {
        return document.querySelector('dialog:modal') || document.body;
    } catch {
        // An unsupported selector must not take the notification with it.
        return document.body;
    }
}

/**
 * Re-enter the top layer, which orders by when an element joined it. A dialog
 * opened after the container would otherwise paint over the toasts already
 * showing.
 */
function raise() {
    if (container.matches('[popover]') && container.matches(':popover-open')) {
        container.hidePopover();
        container.showPopover();
    }
}

function attachTo(host) {
    if (container.parentNode === host) {
        return;
    }
    const wasOpen = container.matches('[popover]') && container.matches(':popover-open');
    if (wasOpen) {
        container.hidePopover();
    }
    host.appendChild(container);
    if (wasOpen) {
        container.showPopover();
    }
}

/**
 * Follow dialogs as they open and close. showModal() sets the `open`
 * attribute, so watching that one attribute is enough. Only runs while
 * toasts are showing.
 */
let dialogObserver = null;

function watchDialogs() {
    if (dialogObserver) {
        return;
    }
    dialogObserver = new MutationObserver(() => {
        if (toastElements().length === 0) {
            return;
        }
        attachTo(hostFor());
        raise();
    });
    dialogObserver.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['open']
    });
}

function unwatchDialogs() {
    if (dialogObserver) {
        dialogObserver.disconnect();
        dialogObserver = null;
    }
}

function createContainer() {
    const element = document.createElement('div');
    element.id = 'toast-container';
    element.className = 'toast-container';
    element.setAttribute('data-testid', 'toast-container');
    if (supportsPopover()) {
        // "manual" rather than "auto": an auto popover light-dismisses on any
        // outside click, which would wipe an error the user has not read.
        element.setAttribute('popover', 'manual');
    } else {
        element.classList.add('toast-container--fixed');
    }

    dismissAllButton = document.createElement('button');
    dismissAllButton.type = 'button';
    dismissAllButton.className = 'toast-dismiss-all';
    dismissAllButton.textContent = 'Dismiss all';
    dismissAllButton.setAttribute('data-testid', 'toast-dismiss-all');
    dismissAllButton.hidden = true;
    dismissAllButton.addEventListener('click', dismissAll);
    element.appendChild(dismissAllButton);

    hostFor().appendChild(element);
    return element;
}

function ensureContainer() {
    // Recreated if a previous document.body was replaced wholesale.
    if (!container || !container.isConnected) {
        container = createContainer();
    }
    attachTo(hostFor());
    if (container.matches('[popover]') && !container.matches(':popover-open')) {
        container.showPopover();
    } else {
        raise();
    }
    watchDialogs();
    return container;
}

function toastElements() {
    return container ? Array.from(container.querySelectorAll('.toast-item')) : [];
}

/**
 * Hide the container once it is empty and show or hide the bulk dismiss
 * control. An empty popover left open would sit in the top layer for nothing.
 */
function syncContainer() {
    if (!container) {
        return;
    }
    const count = toastElements().length;
    if (dismissAllButton) {
        dismissAllButton.hidden = count < DISMISS_ALL_THRESHOLD;
    }
    if (count === 0) {
        if (container.matches('[popover]') && container.matches(':popover-open')) {
            container.hidePopover();
        }
        // Left inside a dialog, the container would vanish with it on close.
        attachTo(document.body);
        unwatchDialogs();
    }
}

function removeToast(toast) {
    if (!toast.isConnected || toast.classList.contains('toast-item--leaving')) {
        return;
    }
    toast.classList.add('toast-item--leaving');
    const drop = () => {
        toast.remove();
        syncContainer();
    };
    // Driven by a CSS animation; the timeout is what actually reaps the node.
    setTimeout(drop, 250);
}

function dismissAll() {
    toastElements().forEach(removeToast);
}

/**
 * Start a dismissal timer that pauses while the pointer is over the toast, so
 * a message being read does not disappear mid-sentence.
 */
function startTimer(toast, duration) {
    let remaining = duration;
    let startedAt = Date.now();
    let timer = setTimeout(() => removeToast(toast), remaining);

    toast.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        remaining -= Date.now() - startedAt;
    });
    toast.addEventListener('mouseleave', () => {
        startedAt = Date.now();
        timer = setTimeout(() => removeToast(toast), Math.max(remaining, 1000));
    });
}

function buildToast(message, level) {
    const settings = LEVELS[level];
    const toast = document.createElement('div');
    toast.className = `toast-item toast-item--${level}`;
    toast.setAttribute('role', settings.role);
    toast.setAttribute('data-testid', 'toast-message');
    toast.setAttribute('data-level', level);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'toast-item__icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[level];
    toast.appendChild(icon);

    // textContent, not innerHTML: messages carry server text such as a
    // rejected key's reason, which must never be parsed as markup.
    const text = document.createElement('p');
    text.className = 'toast-item__text';
    text.textContent = message;
    toast.appendChild(text);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-item__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.setAttribute('data-testid', 'toast-close');
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener('click', () => removeToast(toast));
    toast.appendChild(close);

    return toast;
}

/**
 * Show a toast.
 *
 * @param {string} message - Text to display. Newlines are preserved, so the
 *     multi-line messages built by configSave.js keep their structure.
 * @param {string} [level] - 'success', 'info', 'warning' or 'error'.
 * @param {object} [options]
 * @param {number} [options.duration] - Override the level's lifetime, in
 *     milliseconds. 0 keeps the toast until it is dismissed.
 * @returns {function(): void} Dismisses this toast.
 */
function showToast(message, level, options) {
    const text = typeof message === 'string' ? message : String(message);
    const resolved = Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : DEFAULT_LEVEL;
    const settings = options || {};

    const parent = ensureContainer();
    const toast = buildToast(text, resolved);
    parent.appendChild(toast);

    const duration = typeof settings.duration === 'number'
        ? settings.duration
        : LEVELS[resolved].duration;
    if (duration > 0) {
        startTimer(toast, duration);
    }

    syncContainer();
    return () => removeToast(toast);
}

// popover="manual" does not light-dismiss, so Escape is wired up by hand.
// Only the newest toast goes, matching how a stack of dialogs unwinds.
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
        return;
    }
    const toasts = toastElements();
    if (toasts.length > 0) {
        removeToast(toasts[toasts.length - 1]);
    }
});

window.showToast = showToast;
window.dismissAllToasts = dismissAll;
