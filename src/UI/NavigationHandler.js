/*
 * ClipMaster Custom - Navigation Handler
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';

import { debugLog } from '../Util/Constants.js';

/**
 * Navigation Handler Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const NavigationHandlerMixin = {
    _updateSelection() {
        if (!this._itemsBox) return;

        // Clear selections
        if (this._itemRows)
            this._itemRows.forEach(row => row?.remove_style_class_name('selected'));

        const selectedRow = this._itemRows?.[this._selectedIndex] ?? null;
        if (!selectedRow) {
            if (this._selectedIndex >= 0) {
                debugLog(() => `_updateSelection: selectedIndex=${this._selectedIndex} but row not found, itemRows.length=${this._itemRows?.length || 0}`);
            }
            return;
        }

        selectedRow.add_style_class_name('selected');

        const scrollView = this._scrollView;
        if (!scrollView) return;

        const scrollToRow = () => {
            try {
                const rowDestroyed =
                    typeof selectedRow?.is_destroyed === 'function'
                        ? selectedRow.is_destroyed()
                        : (selectedRow?.get_stage?.() === null);
                if (rowDestroyed) return;

                // Method 1: Clipboard Indicator style helper
                if (AnimationUtils?.ensureActorVisibleInScrollView) {
                    try {
                        AnimationUtils.ensureActorVisibleInScrollView(scrollView, selectedRow);
                    } catch (e) {
                        debugLog(() => `_updateSelection: ensureActorVisibleInScrollView failed: ${e.message}`);
                    }
                }

                // Method 2: manual adjustment fallback
                let adj = null;
                try {
                    if (typeof scrollView.get_vadjustment === 'function')
                        adj = scrollView.get_vadjustment();
                    else if (scrollView.vscroll?.adjustment)
                        adj = scrollView.vscroll.adjustment;
                } catch (e) {
                    debugLog(() => `_updateSelection: get adjustment failed: ${e.message}`);
                }

                const childAdj = this._itemsBox?.vadjustment ?? null;
                const useAdj = childAdj || adj;
                if (!useAdj) return;

                const getValue = () => {
                    try {
                        if (typeof useAdj.get_value === 'function')
                            return useAdj.get_value();
                    } catch (_) {}
                    return useAdj.value ?? 0;
                };

                const setValue = (v) => {
                    if (typeof useAdj.set_value === 'function')
                        useAdj.set_value(v);
                    else
                        useAdj.value = v;
                };

                const lower = useAdj.lower ?? 0;
                const upper = useAdj.upper ?? 0;
                const pageSize = useAdj.page_size ?? (scrollView.height || 300);

                // Fast path: compute row Y relative to items box using transformed positions (O(1))
                let itemY = null;
                try {
                    if (typeof selectedRow.get_transformed_position === 'function' &&
                        typeof this._itemsBox?.get_transformed_position === 'function') {
                        const [, rowY] = selectedRow.get_transformed_position();
                        const [, boxY] = this._itemsBox.get_transformed_position();
                        itemY = rowY - boxY;
                    }
                } catch (_) {}

                // Fallback: estimate row top Y by summing previous row heights (O(n))
                if (itemY === null) {
                    itemY = 0;
                    for (let i = 0; i < this._selectedIndex; i++) {
                        const r = this._itemRows?.[i];
                        if (r?.height > 0) itemY += r.height;
                    }
                }

                const itemHeight = selectedRow.height || 50;
                const itemBottom = itemY + itemHeight;
                const current = getValue();
                const visibleTop = current;
                const visibleBottom = current + pageSize;

                if (itemY < visibleTop || itemBottom > visibleBottom) {
                    let next = current;
                    if (itemY < visibleTop)
                        next = itemY;
                    else
                        next = itemBottom - pageSize;

                    const maxScroll = Math.max(lower, upper - pageSize);
                    next = Math.max(lower, Math.min(next, maxScroll));
                    setValue(next);
                }
            } catch (e) {
                debugLog(() => `_updateSelection: scroll error: ${e.message}`);
            }
        };

        scrollToRow();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => { scrollToRow(); return GLib.SOURCE_REMOVE; });
    },

    _onKeyPress(actor, event) {
        const symbol = event.get_key_symbol();

        debugLog(() => `_onKeyPress: symbol=${symbol}, KEY_Delete=${Clutter.KEY_Delete}, KEY_KP_Delete=${Clutter.KEY_KP_Delete}`);

        // Handle Delete key BEFORE checking search entry focus
        // This ensures DEL works even when search entry has focus (but only if search is empty)
        if (symbol === Clutter.KEY_Delete || symbol === Clutter.KEY_KP_Delete) {
            const keyFocus = global.stage.get_key_focus();
            const searchText = this._searchEntry?.get_text() || '';
            
            // If search entry has focus and has text, let it handle DEL (delete character)
            if ((keyFocus === this._searchEntry || keyFocus === this._searchEntry?.clutter_text) && searchText.length > 0) {
                debugLog(() => `_onKeyPress: DEL in search entry with text, propagating`);
                return Clutter.EVENT_PROPAGATE;
            }
            
            // Otherwise, delete the selected item
            debugLog(() => `_onKeyPress: DEL key pressed, items.length=${this._items.length}, selectedIndex=${this._selectedIndex}`);
            if (this._items.length > 0 && this._selectedIndex >= 0 && this._selectedIndex < this._items.length) {
                const itemId = this._items[this._selectedIndex].id;
                debugLog(() => `_onKeyPress: Deleting item id=${itemId} at index ${this._selectedIndex}`);
                this._database.deleteItem(itemId);
                this._loadItems();
                // After deletion, adjust selectedIndex if needed
                if (this._selectedIndex >= this._items.length) {
                    this._selectedIndex = Math.max(0, this._items.length - 1);
                    this._updateSelection();
                }
            } else {
                debugLog(() => `_onKeyPress: DEL ignored - no items or invalid selectedIndex`);
            }
            return Clutter.EVENT_STOP;
        }

        // Arrow keys: always handle here for navigation
        const isArrowKey =
            symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up ||
            symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down;

        // Non-arrow keys: let search entry handle when focused
        if (!isArrowKey) {
            const keyFocus = global.stage.get_key_focus();
            if (keyFocus === this._searchEntry ||
                keyFocus === this._searchEntry?.clutter_text ||
                actor === this._searchEntry ||
                (this._searchEntry?.clutter_text && actor === this._searchEntry.clutter_text)) {
                return Clutter.EVENT_PROPAGATE;
            }
        }

        if (symbol === Clutter.KEY_Escape) {
            this._isPinned = false;
            this._pinButton.remove_style_pseudo_class('checked');
            this.menu.close();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up) {
            if (this._items.length === 0) return Clutter.EVENT_STOP;

            if (this._selectedIndex < 0) this._selectedIndex = this._items.length - 1;
            else if (this._selectedIndex > 0) this._selectedIndex--;
            else this._selectedIndex = this._items.length - 1;

            this._updateSelection();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down) {
            if (this._items.length === 0) return Clutter.EVENT_STOP;

            if (this._selectedIndex < 0) this._selectedIndex = 0;
            else if (this._selectedIndex < this._items.length - 1) this._selectedIndex++;
            else this._selectedIndex = 0;

            this._updateSelection();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            this._pasteSelected();
            return Clutter.EVENT_STOP;
        }

        // Number keys 1-9: quick paste
        if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9) {
            const index = symbol - Clutter.KEY_1;
            if (index < this._items.length) {
                this._selectedIndex = index;
                this._pasteSelected();
            }
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
};

