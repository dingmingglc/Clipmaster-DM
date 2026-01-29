/*
 * ClipMaster Custom - UI Components Builder
 * Extracted from Indicator.js for better code organization
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ItemType, debugLog } from '../Util/Constants.js';
import { tr as _ } from '../Util/Translations.js';
import { SMILEY_EMOJIS } from '../Util/SmileyData.js';

/**
 * UI Components Builder Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const UIComponentsMixin = {
    _initSearchHistory() {
        if (!this._searchHistory)
            this._searchHistory = [];
        if (!this._searchHistoryMax)
            this._searchHistoryMax = 20;
        if (this._searchHistoryActiveIndex === undefined)
            this._searchHistoryActiveIndex = -1;
    },

    _addToSearchHistory(query) {
        this._initSearchHistory();
        const q = String(query ?? '').trim();
        if (!q)
            return;

        // Deduplicate and move to front
        this._searchHistory = this._searchHistory.filter(x => x !== q);
        this._searchHistory.unshift(q);
        if (this._searchHistory.length > this._searchHistoryMax)
            this._searchHistory.length = this._searchHistoryMax;

        this._refreshSearchHistoryMenu();
    },

    _refreshSearchHistoryMenu() {
        if (!this._searchHistoryMenu)
            return;

        this._searchHistoryMenu.removeAll();
        this._searchHistoryActiveIndex = -1;

        const history = this._searchHistory || [];
        if (history.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(_('No history'), { reactive: false, can_focus: false });
            this._searchHistoryMenu.addMenuItem(empty);
        } else {
            history.forEach((text, idx) => {
                const item = new PopupMenu.PopupMenuItem(text);
                item.connect('activate', () => {
                    this._searchEntry.set_text(text);
                    this._searchQuery = text;
                    this._loadItems();
                    this._searchEntry.grab_key_focus();
                    this._searchHistoryMenu.close();
                });
                this._searchHistoryMenu.addMenuItem(item);
            });

            this._searchHistoryMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const clearItem = new PopupMenu.PopupMenuItem(_('Clear history'));
            clearItem.connect('activate', () => {
                this._searchHistory = [];
                this._refreshSearchHistoryMenu();
            });
            this._searchHistoryMenu.addMenuItem(clearItem);
        }
    },

    _toggleSearchHistoryMenu() {
        if (!this._searchHistoryMenu)
            return;

        if (this._searchHistoryMenu.isOpen) {
            this._searchHistoryMenu.close();
        } else {
            this._refreshSearchHistoryMenu();
            this._searchHistoryMenu.open();
        }
    },

    _cycleSearchHistory(delta) {
        this._initSearchHistory();
        const history = this._searchHistory || [];
        if (history.length === 0)
            return;

        if (!this._searchHistoryMenu?.isOpen)
            this._toggleSearchHistoryMenu();

        if (this._searchHistoryActiveIndex < 0)
            this._searchHistoryActiveIndex = 0;
        else
            this._searchHistoryActiveIndex = (this._searchHistoryActiveIndex + delta + history.length) % history.length;

        const text = history[this._searchHistoryActiveIndex];
        this._searchEntry.set_text(text);
        this._searchQuery = text;
        this._loadItems();
        this._searchEntry.grab_key_focus();
    },

    _buildHeader() {
        this._header = new St.BoxLayout({
            style_class: 'clipmaster-header',
            x_expand: true,
        });

        const headerIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                this._extension._extensionPath + '/assets/icons/clipmaster-symbolic.svg'
            ),
            style_class: 'clipmaster-header-icon',
            icon_size: 14,
        });
        this._header.add_child(headerIcon);

        const title = new St.Label({
            text: 'ClipMaster',
            style_class: 'clipmaster-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._header.add_child(title);

        // Dark/Light/Auto toggle button
        this._themeToggleButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            can_focus: false,
            track_hover: true,
        });
        this._themeMode = 'auto'; // 'dark', 'light', 'auto'
        this._updateThemeToggleIcon();
        this._themeToggleButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._themeToggleButton.connect('clicked', () => {
            // Cycle: auto -> dark -> light -> auto
            if (this._themeMode === 'auto') {
                this._themeMode = 'dark';
            } else if (this._themeMode === 'dark') {
                this._themeMode = 'light';
            } else {
                this._themeMode = 'auto';
            }
            this._applyTheme();
            this._updateThemeToggleIcon();
        });
        this._header.add_child(this._themeToggleButton);

        // Plain text toggle
        this._plainTextButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'text-x-generic-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true,
        });
        this._plainTextButton._tooltipText = _('Paste as plain text');
        this._plainTextButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._plainTextButton.connect('clicked', () => {
            this._plainTextMode = !this._plainTextMode;
            if (this._plainTextMode) {
                this._plainTextButton.add_style_pseudo_class('checked');
            } else {
                this._plainTextButton.remove_style_pseudo_class('checked');
            }
        });
        this._header.add_child(this._plainTextButton);

        // Pin button
        this._pinButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'view-pin-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true,
        });
        this._pinButton._tooltipText = _('Pin popup (keep open)');
        this._pinButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._pinButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._isPinned = !this._isPinned;
                if (this._isPinned) {
                    this._pinButton.add_style_pseudo_class('checked');
                } else {
                    this._pinButton.remove_style_pseudo_class('checked');
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._header.add_child(this._pinButton);

        // Clear all button (keeps favorites)
        this._clearAllButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'edit-clear-all-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true,
        });
        this._clearAllButton._tooltipText = _('Clear all (keeps favorites)');
        this._clearAllButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._clearAllButton.connect('clicked', () => {
            this._database.clearHistory(true); // true = keep favorites
            this._loadItems();
            return Clutter.EVENT_STOP;
        });
        this._header.add_child(this._clearAllButton);

        // Settings button
        this._settingsButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'preferences-system-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true,
        });
        this._settingsButton._tooltipText = _('Settings');
        this._settingsButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._settingsButton.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
            return Clutter.EVENT_STOP;
        });
        this._header.add_child(this._settingsButton);

        this._contentBox.add_child(this._header);
    },

    _buildSearchBar() {
        this._initSearchHistory();

        this._searchRow = new St.BoxLayout({
            style_class: 'clipmaster-search-row',
            x_expand: true,
        });

        this._searchEntry = new St.Entry({
            style_class: 'clipmaster-search',
            hint_text: _('Search...'),
            can_focus: true,
            x_expand: true,
        });
        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._searchQuery = this._searchEntry.get_text();
            this._loadItems();
        });
        this._searchEntry.clutter_text.connect('activate', () => {
            this._pasteSelected();
        });

        // Search history button (dropdown)
        this._searchHistoryButton = new St.Button({
            style_class: 'clipmaster-search-history-button',
            can_focus: false,
            track_hover: true,
            child: new St.Icon({ icon_name: 'document-open-recent-symbolic', icon_size: 16 }),
        });
        this._searchHistoryButton._tooltipText = _('Search history');
        this._searchHistoryButton.connect('notify::hover', (btn) => this._onButtonHover(btn));

        this._searchHistoryMenu = new PopupMenu.PopupMenu(this._searchHistoryButton, 0.5, St.Side.TOP);
        this._searchHistoryMenu.actor.add_style_class_name('clipmaster-search-history-menu');
        Main.uiGroup.add_child(this._searchHistoryMenu.actor);
        this._searchHistoryMenu.actor.hide();

        this._searchHistoryButton.connect('clicked', () => {
            this._toggleSearchHistoryMenu();
            return Clutter.EVENT_STOP;
        });

        // Handle keys in the actual text actor (this is what receives key focus)
        this._searchEntry.clutter_text.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const text = this._searchEntry.get_text();

            // When search entry is focused: if there is a selected item, DEL should delete it
            // (instead of deleting text), matching the footer hint.
            if (symbol === Clutter.KEY_Delete || symbol === Clutter.KEY_KP_Delete) {
                debugLog(() => `_searchEntry: DEL pressed, items.length=${this._items.length}, selectedIndex=${this._selectedIndex}, text.length=${text.length}`);
                if (this._items.length > 0 && this._selectedIndex >= 0 && this._selectedIndex < this._items.length) {
                    const itemId = this._items[this._selectedIndex].id;
                    debugLog(() => `_searchEntry: Deleting item id=${itemId} at index ${this._selectedIndex}`);
                    this._database.deleteItem(itemId);
                    this._loadItems();

                    if (this._selectedIndex >= this._items.length) {
                        this._selectedIndex = Math.max(0, this._items.length - 1);
                        this._updateSelection();
                    }
                    return Clutter.EVENT_STOP;
                }

                // No valid selection -> let the entry handle DEL normally (delete character).
                return Clutter.EVENT_PROPAGATE;
            }

            // If search is empty and arrow keys are pressed, navigate items
            if (text.length === 0) {
                if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up) {
                    if (this._items.length === 0) return Clutter.EVENT_STOP;
                    if (this._selectedIndex < 0) {
                        this._selectedIndex = this._items.length - 1;
                    } else if (this._selectedIndex > 0) {
                        this._selectedIndex--;
                    } else {
                        this._selectedIndex = this._items.length - 1;
                    }
                    this._updateSelection();
                    // Scrolling is now handled automatically by key-focus-in event
                    // Focus is transferred to the selected row in _updateSelection()
                    return Clutter.EVENT_STOP;
                } else if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down) {
                    if (this._items.length === 0) return Clutter.EVENT_STOP;
                    const oldIndex = this._selectedIndex;
                    if (this._selectedIndex < 0) {
                        this._selectedIndex = 0;
                    } else if (this._selectedIndex < this._items.length - 1) {
                        this._selectedIndex++;
                    } else {
                        this._selectedIndex = 0;
                    }
                    debugLog(() => `_searchEntry Down: oldIndex=${oldIndex}, newIndex=${this._selectedIndex}, items.length=${this._items.length}, itemRows.length=${this._itemRows?.length || 0}`);
                    this._updateSelection();
                    // Scrolling is now handled automatically by key-focus-in event
                    // Focus is transferred to the selected row in _updateSelection()
                    return Clutter.EVENT_STOP;
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });

        this._searchRow.add_child(this._searchEntry);
        this._searchRow.add_child(this._searchHistoryButton);
        this._contentBox.add_child(this._searchRow);
    },

    _buildFilterBar() {
        // Container for filter bar and lists bar
        this._filterBarContainer = new St.BoxLayout({
            style_class: 'clipmaster-filter-bar-container',
            vertical: true,
            x_expand: true,
        });

        const filterBar = new St.BoxLayout({
            style_class: 'clipmaster-filter-bar',
            x_expand: true,
        });

        // Text button (default)
        this._textButton = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Text'),
            can_focus: false,
        });
        this._textButton.connect('clicked', () => this._setFilter(null, ItemType.TEXT));
        filterBar.add_child(this._textButton);

        // Favorites button (second position)
        this._favButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'starred-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true,
        });
        this._favButton._tooltipText = _('Favorites');
        this._favButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._favButton.connect('clicked', () => this._setFilter(-1));
        filterBar.add_child(this._favButton);

        // URL button (icon)
        this._urlButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'emblem-web-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true,
        });
        this._urlButton._tooltipText = _('URL');
        this._urlButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._urlButton.connect('clicked', () => this._setFilter(null, ItemType.URL));
        filterBar.add_child(this._urlButton);

        // Code button (icon)
        this._codeButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'accessories-text-editor-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true,
        });
        this._codeButton._tooltipText = _('Code');
        this._codeButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._codeButton.connect('clicked', () => this._setFilter(null, ItemType.CODE));
        filterBar.add_child(this._codeButton);

        // Images button (icon)
        this._imageButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'image-x-generic-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true,
        });
        this._imageButton._tooltipText = _('Images');
        this._imageButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._imageButton.connect('clicked', () => this._setFilter(null, ItemType.IMAGE));
        filterBar.add_child(this._imageButton);

        // Smiley button
        this._iconButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'face-smile-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true,
        });
        this._iconButton._tooltipText = _('Smileys');
        this._iconButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._iconButton.connect('clicked', () => this._setFilter(null, null, false, true));
        filterBar.add_child(this._iconButton);

        // All button
        this._allButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('All'),
            can_focus: false,
        });
        this._allButton.connect('clicked', () => this._setFilter(null));
        filterBar.add_child(this._allButton);

        this._filterBar = filterBar;
        this._filterBarContainer.add_child(filterBar);

        // Lists bar (second row)
        this._listsBar = new St.BoxLayout({
            style_class: 'clipmaster-lists-bar',
            x_expand: true,
        });
        this._filterBarContainer.add_child(this._listsBar);

        this._contentBox.add_child(this._filterBarContainer);

        // Build lists buttons
        this._buildListsBar();
    },

    _buildListsBar() {
        if (!this._listsBar || !this._database) return;

        this._listsBar.destroy_all_children();
        this._listButtons = {};

        const lists = this._database.getLists();

        if (lists.length === 0) {
            this._listsBar.visible = true;

            const emptyLabel = new St.Label({
                text: _('Lists'),
                style_class: 'clipmaster-list-tag-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._listsBar.add_child(emptyLabel);

            // Add "Manage" button to enter list management view
            this._manageListsBtn = new St.Button({
                style_class: 'clipmaster-list-add-btn',
                can_focus: false,
                track_hover: true,
            });
            this._manageListsBtn.set_child(new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 12 }));
            this._manageListsBtn._tooltipText = _('Manage Lists');
            this._manageListsBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
            this._manageListsBtn.connect('clicked', () => {
                this._setFilter(null, null, true); // Enter manage mode
            });
            this._listsBar.add_child(this._manageListsBtn);
            return;
        }

        this._listsBar.visible = true;

        // Add "All" button at the beginning to show all items (clear list filter)
        this._listsAllButton = new St.Button({
            style_class: 'clipmaster-list-tag',
            can_focus: false,
            track_hover: true,
        });
        const allLabel = new St.Label({
            text: _('All'),
            style_class: 'clipmaster-list-tag-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._listsAllButton.set_child(allLabel);
        this._listsAllButton.set_style('background-color: #6c7086; padding: 2px 8px;');
        this._listsAllButton.connect('clicked', () => {
            // Clear list filter, keep current type filter
            this._currentListId = null;
            this._loadItems();
            // Update button states
            if (this._listButtons)
                Object.values(this._listButtons).forEach(b => b.remove_style_class_name('active'));
            this._listsAllButton.add_style_class_name('active');
        });
        this._listsBar.add_child(this._listsAllButton);

        // Add each list as a button with its color as background
        lists.forEach(list => {
            const btn = new St.Button({
                style_class: 'clipmaster-list-tag',
                can_focus: false,
                track_hover: true,
            });

            // Set background color from list color (use !important equivalent with full style)
            const color = list.color || '#6c7086';
            btn.set_style(`
                background-color: ${color} !important;
                background: ${color} !important;
            `);

            const label = new St.Label({
                text: list.name,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'clipmaster-list-tag-label',
            });
            btn.set_child(label);
            btn._listId = list.id;

            btn.connect('clicked', () => this._setFilter(list.id));

            this._listsBar.add_child(btn);
            this._listButtons[list.id] = btn;
        });

        // Add "Manage" button to enter list management view
        this._manageListsBtn = new St.Button({
            style_class: 'clipmaster-list-add-btn',
            can_focus: false,
            track_hover: true,
        });
        this._manageListsBtn.set_child(new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 12 }));
        this._manageListsBtn._tooltipText = _('Manage Lists');
        this._manageListsBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._manageListsBtn.connect('clicked', () => {
            this._setFilter(null, null, true); // Enter manage mode
        });
        this._listsBar.add_child(this._manageListsBtn);
    },

    _loadIconsView() {
        if (!this._itemsBox) return;
        this._closeContextPanel();
        this._closeQrPanel();
        this._itemsBox.destroy_all_children();
        this._itemRows = [];

        const perRow = 8;
        const closeOnPaste = this._settings.get_boolean('close-on-paste');
        const pasteOnSelect = this._settings.get_boolean('paste-on-select');

        for (let i = 0; i < SMILEY_EMOJIS.length; i += perRow) {
            const row = new St.BoxLayout({
                style_class: 'clipmaster-icons-row',
                x_expand: true,
            });
            for (let j = 0; j < perRow && i + j < SMILEY_EMOJIS.length; j++) {
                const emoji = SMILEY_EMOJIS[i + j];
                const btn = new St.Button({
                    style_class: 'clipmaster-icon-button',
                    label: emoji,
                    can_focus: true,
                    track_hover: true,
                });
                btn.connect('clicked', () => {
                    this._monitor.copyToClipboard(emoji);
                    if (closeOnPaste && !this._isPinned) {
                        this.menu.close();
                        if (pasteOnSelect && this._keyboard) {
                            this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 50, () => {
                                try {
                                    this._keyboard.paste();
                                } catch (e) {}
                                return GLib.SOURCE_REMOVE;
                            }, 'paste-on-select');
                        }
                    }
                });
                row.add_child(btn);
            }
            this._itemsBox.add_child(row);
        }
    },

    _buildItemsList() {
        this._scrollView = new St.ScrollView({
            style_class: 'clipmaster-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true,
        });

        this._itemsBox = new St.BoxLayout({
            style_class: 'clipmaster-items',
            vertical: true,
            x_expand: true,
        });

        // St.ScrollView is a single-child container; use set_child so the
        // scrollable wiring (adjustments) is done via the proper API.
        this._scrollView.set_child(this._itemsBox);
        this._contentBox.add_child(this._scrollView);
    },

    _buildFooter() {
        const footer = new St.BoxLayout({
            style_class: 'clipmaster-footer',
            x_expand: true,
        });

        const shortcutText = new St.Label({
            text: '↑↓ Nav • Enter Paste • Del Delete • Esc Close',
            style_class: 'clipmaster-footer-text',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        footer.add_child(shortcutText);

        this._contentBox.add_child(footer);
    }

};
