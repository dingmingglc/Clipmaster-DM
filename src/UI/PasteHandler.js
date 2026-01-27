/*
 * ClipMaster Custom - Paste Handler
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';

import { ItemType, debugLog } from '../Util/Constants.js';

/**
 * Paste Handler Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const PasteHandlerMixin = {
    _pasteItem(item, fromHover = false) {
        if (!item) return;

        if (item.type === ItemType.IMAGE && item.content) {
            this._monitor.copyImageToClipboard(item.content);
        } else {
            const content = this._plainTextMode ? item.plainText : item.content;
            this._monitor.copyToClipboard(content, this._plainTextMode);
        }

        this._database.updateItem(item.id, {
            lastUsed: Date.now(),
            useCount: (item.useCount || 1) + 1
        });

        // Move item to top of the list
        this._database.moveToTop(item.id);

        const closeOnPaste = this._settings.get_boolean('close-on-paste');
        const pasteOnSelect = this._settings.get_boolean('paste-on-select');

        if (closeOnPaste && !fromHover && !this._isPinned) {
            this.menu.close();

            // Auto-paste if enabled (simulate Shift+Insert after a short delay)
            if (pasteOnSelect && this._keyboard) {
                this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 50, () => {
                    try {
                        this._keyboard.paste();
                        debugLog('Auto-paste triggered via virtual keyboard');
                    } catch (e) {
                        debugLog(() => `Auto-paste failed: ${e.message}`);
                    }
                    return GLib.SOURCE_REMOVE;
                }, 'paste-on-select');
            }
        }
    },

    _pasteSelected(fromHover = false) {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._items.length) {
            return;
        }

        const item = this._items[this._selectedIndex];
        this._pasteItem(item, fromHover);
    }
};
