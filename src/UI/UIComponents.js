/*
 * ClipMaster Custom - UI Components Builder
 * Extracted from Indicator.js for better code organization
 */

import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { ItemType, debugLog } from '../Util/Constants.js';
import { tr as _ } from '../Util/Translations.js';

/**
 * UI Components Builder Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const UIComponentsMixin = {
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

        // Handle arrow keys in search entry - if empty, navigate items instead
        this._searchEntry.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            const text = this._searchEntry.get_text();

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

        this._contentBox.add_child(this._searchEntry);
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

        // URL button
        this._urlButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('URL'),
            can_focus: false,
        });
        this._urlButton.connect('clicked', () => this._setFilter(null, ItemType.URL));
        filterBar.add_child(this._urlButton);

        // Code button
        this._codeButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Code'),
            can_focus: false,
        });
        this._codeButton.connect('clicked', () => this._setFilter(null, ItemType.CODE));
        filterBar.add_child(this._codeButton);

        // Images button
        this._imageButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Images'),
            can_focus: false,
        });
        this._imageButton.connect('clicked', () => this._setFilter(null, ItemType.IMAGE));
        filterBar.add_child(this._imageButton);

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
            this._listsBar.visible = false;
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
