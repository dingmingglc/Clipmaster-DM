/*
 * ClipMaster Constants
 * License: GPL-2.0-or-later
 */

export const ItemType = {
    TEXT: 'text',
    HTML: 'html',
    IMAGE: 'image',
    FILE: 'file',
    URL: 'url',
    COLOR: 'color',
    CODE: 'code'
};

export let _debugMode = false;

export function debugLog(message) {
    if (!_debugMode)
        return;

    // Support lazy messages: debugLog(() => `expensive ${compute()}`)
    const msg = typeof message === 'function' ? message() : message;

    // Use console.log instead of console.debug so messages reliably
    // appear in journalctl for GNOME Shell sessions.
    console.log(`ClipMaster DEBUG: ${msg}`);
}

export function setDebugMode(enabled) {
    _debugMode = enabled;
    if (enabled) {
        console.log('ClipMaster: Debug mode ENABLED');
    } else {
        console.log('ClipMaster: Debug mode DISABLED');
    }
}

export function isDebugMode() {
    return _debugMode;
}
