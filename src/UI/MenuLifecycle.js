/*
 * ClipMaster Custom - Menu lifecycle / state logic
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ItemType, debugLog } from '../Util/Constants.js';

export const MenuLifecycleMixin = {
    _connectSignals() {
        this._signalManager.connect(
            this._interfaceSettings,
            'changed::color-scheme',
            () => this._applyTheme(),
            'system-theme-changed'
        );

        this._signalManager.connect(
            this._interfaceSettings,
            'changed::gtk-theme',
            () => this._applyTheme(),
            'gtk-theme-changed'
        );

        this._signalManager.connect(
            this._settings,
            'changed::follow-system-theme',
            () => this._applyTheme(),
            'follow-theme-changed'
        );

        this._signalManager.connect(
            this._settings,
            'changed::theme',
            () => this._applyTheme(),
            'theme-changed'
        );
    },

    _onMenuOpened() {
        debugLog('Menu opened');

        // Capture DEL globally while menu is open.
        // Reason: key focus often stays in search entry; relying on actor key-press-event is flaky.
        if (!this._keyCaptureId) {
            this._keyCaptureId = global.stage.connect('captured-event', (stage, event) => {
                try {
                    if (!this.menu?.isOpen)
                        return Clutter.EVENT_PROPAGATE;

                    if (event.type?.() !== Clutter.EventType.KEY_PRESS)
                        return Clutter.EVENT_PROPAGATE;

                    const symbol = event.get_key_symbol?.();
                    // Some keyboards label "Del" but emit BackSpace; support it when a row is selected.
                    if (symbol !== Clutter.KEY_Delete && symbol !== Clutter.KEY_KP_Delete && symbol !== Clutter.KEY_BackSpace)
                        return Clutter.EVENT_PROPAGATE;

                    debugLog(() => `_captured-event: delete pressed (symbol=${symbol}), items.length=${this._items?.length || 0}, selectedIndex=${this._selectedIndex}`);

                    if (this._items?.length > 0 && this._selectedIndex >= 0 && this._selectedIndex < this._items.length) {
                        const itemId = this._items[this._selectedIndex].id;
                        debugLog(() => `_captured-event: Deleting item id=${itemId} at index ${this._selectedIndex}`);
                        this._database.deleteItem(itemId);
                        this._loadItems();
                        return Clutter.EVENT_STOP;
                    }

                    return Clutter.EVENT_PROPAGATE;
                } catch (e) {
                    debugLog(() => `_captured-event: error: ${e.message}`);
                    return Clutter.EVENT_PROPAGATE;
                }
            });
        }

        // Cleanup duplicates on first open
        if (!this._duplicatesCleanedUp && this._database) {
            const removed = this._database.cleanupDuplicates();
            if (removed > 0)
                debugLog(() => `Cleaned up ${removed} duplicate items`);
            this._duplicatesCleanedUp = true;
        }

        // Initialize theme mode if not set (default to auto)
        if (!this._themeMode) {
            this._themeMode = 'auto';
            this._updateThemeToggleIcon();
            this._applyTheme();
        }

        this._searchEntry.set_text('');
        this._searchQuery = '';
        this._selectedIndex = -1; // No item selected initially
        this._currentListId = null;
        this._currentType = ItemType.TEXT;
        this._manageMode = false;
        // Keep plainTextMode state across menu open/close

        this._isPinned = false;
        this._pinButton.remove_style_pseudo_class('checked');

        // Rebuild lists bar (in case lists changed)
        this._buildListsBar();

        // Reset filter buttons
        [this._allButton, this._favButton, this._textButton, this._imageButton,
         this._urlButton, this._codeButton].forEach(b => {
            if (b) b.remove_style_class_name('active');
        });

        // Clear list button states
        if (this._listButtons) {
            Object.values(this._listButtons).forEach(b => {
                if (b) b.remove_style_class_name('active');
            });
        }
        if (this._listsAllButton)
            this._listsAllButton.remove_style_class_name('active');

        this._textButton.add_style_class_name('active');

        this._loadItems();

        this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (this.menu.isOpen)
                this._searchEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        }, 'focus-search');

        // Fix menu position when panel is hidden (e.g., Dash to Panel auto-hide)
        this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (!this.menu.isOpen) return GLib.SOURCE_REMOVE;

            const [menuX, menuY] = this.menu.actor.get_transformed_position();
            const monitor = Main.layoutManager.primaryMonitor;
            const isPanelVisible = this._isPanelVisible();

            // If menu is at top-left (0, 0 or very close) OR panel is hidden, reposition it
            if ((menuX < 50 && menuY < 50) || !isPanelVisible) {
                debugLog(() => `Menu position incorrect or panel hidden (visible: ${isPanelVisible}), fixing...`);
                // Position at top-right, similar to where Dash to Panel (top) would be
                const menuWidth = this.menu.actor.width || 450;
                const x = monitor.x + monitor.width - menuWidth - 20;
                // Adjust Y based on panel visibility
                const y = isPanelVisible ? monitor.y + 5 : monitor.y + 2;

                this.menu.actor.set_position(x, y);
                debugLog(() => `Menu repositioned to: ${x}, ${y} (panel visible: ${isPanelVisible})`);
            }

            return GLib.SOURCE_REMOVE;
        }, 'fix-menu-position');
    },

    _clearAllHoverStates() {
        if (!this._itemsBox) return;
        this._itemsBox.get_children().forEach(child => {
            if (child.hover !== undefined)
                child.hover = false;
            child.remove_style_pseudo_class('hover');
        });
    },

    _clearSelection() {
        this._selectedIndex = -1;
        this._updateSelection();
    },

    _onMenuClosed() {
        debugLog('Menu closed');

        if (this._keyCaptureId) {
            try {
                global.stage.disconnect(this._keyCaptureId);
            } catch (_) {}
            this._keyCaptureId = null;
        }

        this._closeContextPanel();
        this._closeQrPanel();
        this._closeListFormPanel();
        if (this._tooltip)
            this._tooltip.visible = false;

        // Clear hover state from all items when menu closes
        this._clearAllHoverStates();
        // Clear selected state (from keyboard navigation) when menu closes
        this._clearSelection();
    },

    _setFilter(listId, type = null, manageMode = false) {
        this._currentListId = listId;
        this._currentType = type;
        this._manageMode = manageMode;

        // Clear all filter button states
        [this._allButton, this._favButton, this._textButton, this._imageButton,
         this._urlButton, this._codeButton].forEach(b => {
            if (b) b.remove_style_class_name('active');
        });

        // Clear list button states
        if (this._listButtons) {
            Object.values(this._listButtons).forEach(b => {
                if (b) b.remove_style_class_name('active');
            });
        }
        if (this._listsAllButton)
            this._listsAllButton.remove_style_class_name('active');

        // Clear manage button state (old gear button)
        if (this._manageListsBtn)
            this._manageListsBtn.remove_style_class_name('active');

        if (manageMode) {
            if (this._manageListsBtn)
                this._manageListsBtn.add_style_class_name('active');
        } else if (listId === -1) {
            this._favButton.add_style_class_name('active');
        } else if (listId !== null && listId !== undefined && listId > 0) {
            if (this._listButtons?.[listId])
                this._listButtons[listId].add_style_class_name('active');
        } else if (type === ItemType.TEXT) {
            this._textButton.add_style_class_name('active');
        } else if (type === ItemType.IMAGE) {
            this._imageButton.add_style_class_name('active');
        } else if (type === ItemType.URL) {
            this._urlButton.add_style_class_name('active');
        } else if (type === ItemType.CODE) {
            this._codeButton.add_style_class_name('active');
        } else {
            this._allButton.add_style_class_name('active');
        }

        this._loadItems();
    }
};

