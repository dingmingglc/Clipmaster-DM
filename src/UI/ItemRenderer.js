/*
 * ClipMaster Custom - ItemRenderer
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';

import { ItemType, debugLog } from '../Util/Constants.js';
import { QrCodeGenerator } from '../Util/QrCodeGenerator.js';
import { tr as _ } from '../Util/Translations.js';


/**
 * ItemRenderer Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const ItemRendererMixin = {
    _createItemRow(item, index) {
        const row = new St.BoxLayout({
            style_class: 'clipmaster-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
        });
        row._item = item;
        row._index = index;

        // Connect key-focus-in event to auto-scroll when item gets focus
        // This is the Clipboard Indicator way: when focus moves to an item, scroll to make it visible
        row.connect('key-focus-in', () => {
            debugLog(() => `key-focus-in triggered for row index ${row._index}`);
            const rowDestroyed =
                typeof row?.is_destroyed === 'function'
                    ? row.is_destroyed()
                    : (row?.get_stage?.() === null);

            if (this._scrollView && row && !rowDestroyed) {
                try {
                    AnimationUtils.ensureActorVisibleInScrollView(this._scrollView, row);
                    debugLog(() => `key-focus-in: scrolled to row index ${row._index}`);
                } catch (e) {
                    debugLog(() => `key-focus-in scroll error: ${e.message}`);
                }
            }
        });

        // Apply list color as background if item belongs to a list
        if (item.listId) {
            const list = this._database.getListById(item.listId);
            if (list && list.color) {
                // Fixed palette: prefer CSS classes over inline styles (so hover/selected can override cleanly)
                const listColorClassMap = {
                    '#e74c3c': 'clipmaster-list-color-red',
                    '#e67e22': 'clipmaster-list-color-orange',
                    '#f1c40f': 'clipmaster-list-color-yellow',
                    '#2ecc71': 'clipmaster-list-color-green',
                    '#3498db': 'clipmaster-list-color-blue',
                    '#9b59b6': 'clipmaster-list-color-purple',
                    '#95a5a6': 'clipmaster-list-color-gray',
                };

                const cls = listColorClassMap[String(list.color).toLowerCase()];
                if (cls)
                    row.add_style_class_name(cls);
            }
        }

        // Click handler
        row.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                // Paste directly without setting selected state
                this._pasteItem(item);
                return Clutter.EVENT_STOP;
            } else if (event.get_button() === 3) {
                this._showContextMenu(item, row);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Hover handler
        row.connect('enter-event', () => {
            if (this._contextPanelRow && this._contextPanelRow !== row)
                this._closeContextPanel();
            if (this._qrPanelRow && this._qrPanelRow !== row)
                this._closeQrPanel();
        });

        // Number label (show for all items)
        const numLabel = new St.Label({
            text: (index + 1).toString(),
            style_class: 'clipmaster-item-number',
        });
        row.add_child(numLabel);

        // Content box
        const contentBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'clipmaster-item-content',
        });

        // Title
        if (item.title) {
            const titleLabel = new St.Label({
                text: item.title,
                style_class: 'clipmaster-item-title',
                x_expand: true,
                x_align: Clutter.ActorAlign.START,
            });
            titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            contentBox.add_child(titleLabel);
        }

        // Preview text
        let previewText = item.preview || item.plainText || item.content || '';
        if (item.type === ItemType.IMAGE) {
            const size = item.metadata?.size
                ? ` (${Math.round(item.metadata.size / 1024)}KB)`
                : '';
            previewText = `🖼️ Image${size}`;
        }

        const previewLength = this._settings.get_int('preview-length') || 100;
        if (previewText.length > previewLength)
            previewText = `${previewText.substring(0, previewLength)}...`;
        previewText = previewText.replace(/\n/g, ' ').trim();

        const previewLabel = new St.Label({
            text: previewText,
            style_class: 'clipmaster-item-preview',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        previewLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        contentBox.add_child(previewLabel);

        // Bottom row: time + actions
        const bottomRow = new St.BoxLayout({
            style_class: 'clipmaster-item-bottom',
            x_expand: true,
        });

        if (item.created) {
            const timeLabel = new St.Label({
                text: this._formatTime(item.created),
                style_class: 'clipmaster-item-time',
                y_align: Clutter.ActorAlign.CENTER,
            });
            bottomRow.add_child(timeLabel);
        }

        bottomRow.add_child(new St.Widget({ x_expand: true }));

        const iconSize = 12;

        // QR button for TEXT items
        if (item.type === ItemType.TEXT && QrCodeGenerator.canEncode(item.content || item.plainText)) {
            const qrButton = new St.Button({
                style_class: 'clipmaster-action-button',
                can_focus: false,
                reactive: true,
                track_hover: true,
            });
            const qrIcon = new St.Icon({ icon_name: 'view-grid-symbolic', icon_size: iconSize });
            qrButton.set_child(qrIcon);
            qrButton._tooltipText = _('QR Code');
            qrButton.connect('notify::hover', btn => this._onButtonHover(btn));
            qrButton.connect('button-press-event', (actor, event) => {
                if (event.get_button() === 1) {
                    this._showQrPanel(item, row);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            bottomRow.add_child(qrButton);
        }

        // Type label [Text], [Code], etc.
        let listName = null;
        if (item.listId) {
            const list = this._database.getListById(item.listId);
            listName = list?.name ? String(list.name) : null;
        }

        const typeLabel = new St.Label({
            text: listName
                ? `[${this._getTypeLabel(item.type)}] [${listName}]`
                : `[${this._getTypeLabel(item.type)}]`,
            style_class: 'clipmaster-item-type-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        bottomRow.add_child(typeLabel);

        // Favorite button
        const favButton = new St.Button({
            style_class: 'clipmaster-action-button',
            can_focus: false,
            reactive: true,
            track_hover: true,
        });
        const favIcon = new St.Icon({
            icon_name: item.isFavorite ? 'starred-symbolic' : 'non-starred-symbolic',
            icon_size: iconSize,
            // For non-favorite: no special class (match QR icon behavior; inherit from button color)
            style_class: item.isFavorite ? 'clipmaster-item-fav' : '',
        });
        // Don't apply listTextColor to fav icon - let CSS handle it for better contrast
        favButton.set_child(favIcon);
        favButton._tooltipText = item.isFavorite ? _('Unfavorite') : _('Favorite');
        favButton.connect('notify::hover', btn => this._onButtonHover(btn));
        favButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                const newState = this._database.toggleFavorite(item.id);

                // If we're in a type filter (not favorites or all), refresh to remove/show the item
                if (this._currentType !== null && this._currentListId !== -1) {
                    // Item was just favorited, remove it from current type filter
                    if (newState)
                        this._loadItems();
                } else if (this._currentListId === -1 && !newState) {
                    // In favorites view and item was unfavorited, remove it
                    this._loadItems();
                } else {
                    // Just update the icon
                    favIcon.icon_name = newState ? 'starred-symbolic' : 'non-starred-symbolic';
                    favIcon.style_class = newState ? 'clipmaster-item-fav' : '';
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        bottomRow.add_child(favButton);

        // Delete button
        const deleteButton = new St.Button({
            style_class: 'clipmaster-action-button clipmaster-delete-button',
            can_focus: false,
            reactive: true,
            track_hover: true,
        });
        const deleteIcon = new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: iconSize });
        // Don't apply listTextColor to delete icon - let CSS handle it for better contrast
        deleteButton.set_child(deleteIcon);
        deleteButton._tooltipText = _('Delete');
        deleteButton.connect('notify::hover', btn => this._onButtonHover(btn));
        deleteButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._database.deleteItem(item.id);
                this._loadItems();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        bottomRow.add_child(deleteButton);

        contentBox.add_child(bottomRow);
        row.add_child(contentBox);

        return row;
    },

    _loadItems() {
        if (!this._itemsBox || !this._database) return;

        this._closeContextPanel();
        this._closeQrPanel();
        this._itemsBox.destroy_all_children();
        this._itemRows = []; // Clear row references

        // Cancel any in-flight incremental render from a previous load
        if (this._renderItemsSourceId) {
            try {
                GLib.source_remove(this._renderItemsSourceId);
            } catch (_) {}
            this._renderItemsSourceId = null;
        }

        // If in manage mode, show list management UI
        if (this._manageMode) {
            this._loadManageListsView();
            return;
        }

        const limit = this._settings.get_int('items-per-page') || 50;
        const textIncludeUrlCode = this._settings.get_boolean('text-include-url-code');
        const options = {
            limit,
            search: this._searchQuery || null,
            listId: this._currentListId,
            type: this._currentType,
            textIncludeUrlCode,
            // Exclude favorites from type filters (they have their own tab)
            excludeFavorites: this._currentType !== null && this._currentListId !== -1,
        };

        this._items = this._database.getItems(options);

        if (this._items.length === 0) {
            const emptyLabel = new St.Label({
                text: _('No clipboard items'),
                style_class: 'clipmaster-empty',
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._itemsBox.add_child(emptyLabel);
            return;
        }

        // Clear row references
        this._itemRows = [];

        // Render items incrementally to reduce UI jank on large lists
        const items = this._items;
        const batchSize = 8;
        let i = 0;

        const addBatch = () => {
            // If actor got destroyed or replaced mid-render, stop
            if (!this._itemsBox || typeof this._itemsBox.get_stage === 'function' && this._itemsBox.get_stage() === null) {
                this._renderItemsSourceId = null;
                return GLib.SOURCE_REMOVE;
            }

            const end = Math.min(i + batchSize, items.length);
            for (; i < end; i++) {
                const row = this._createItemRow(items[i], i);
                this._itemsBox.add_child(row);
                this._itemRows[i] = row;
            }

            if (i >= items.length) {
                this._renderItemsSourceId = null;
                if (this._selectedIndex >= 0)
                    this._updateSelection();
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        };

        // First batch immediately, then continue in idle
        addBatch();
        this._renderItemsSourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, addBatch);
    },

};