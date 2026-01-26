/*
 * ClipMaster Custom - Panel Indicator with Full UI
 * Uses standard PopupMenu for Dash to Panel compatibility
 */

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ItemType, debugLog } from '../Util/Constants.js';
import { SignalManager, TimeoutManager } from '../Util/Utils.js';
import { QrCodeGenerator, QrEcc } from '../Util/QrCodeGenerator.js';

export const ClipMasterIndicator = GObject.registerClass(
class ClipMasterIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'ClipMaster Custom');

        this._extension = extension;
        this._settings = extension._settings;
        this._database = extension._database;
        this._monitor = extension._monitor;

        this._items = [];
        this._selectedIndex = 0;
        this._searchQuery = '';
        this._currentListId = null;
        this._currentType = null;
        this._plainTextMode = false;
        this._isPinned = false;

        this._signalManager = new SignalManager();
        this._timeoutManager = new TimeoutManager();

        // Connect to GNOME interface settings for system theme detection
        this._interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });

        // Panel icon
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                this._extension._extensionPath + '/assets/icons/clipmaster-symbolic.svg'
            ),
            style_class: 'system-status-icon'
        });
        this.add_child(this._icon);

        // Build main content
        this._buildUI();

        // Connect signals
        this._connectSignals();

        this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this._onMenuOpened();
            } else {
                this._onMenuClosed();
            }
        });

        // Create tooltip label
        this._tooltip = new St.Label({
            style_class: 'clipmaster-tooltip',
            visible: false
        });
        Main.uiGroup.add_child(this._tooltip);

        debugLog('ClipMaster Custom Indicator initialized');
    }

    _buildUI() {
        // Main content box
        this._contentBox = new St.BoxLayout({
            style_class: 'clipmaster-popup',
            vertical: true,
            x_expand: true,
            y_expand: true
        });

        // Add content box to menu
        const menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'clipmaster-menu-box'
        });
        menuItem.add_child(this._contentBox);
        this.menu.addMenuItem(menuItem);

        this._buildHeader();
        this._buildSearchBar();
        this._buildFilterBar();
        this._buildItemsList();
        this._buildFooter();

        // Connect key events
        this.menu.actor.connect('key-press-event', this._onKeyPress.bind(this));

        // Apply theme
        this._applyTheme();
    }

    _connectSignals() {
        this._signalManager.connect(
            this._interfaceSettings,
            'changed::color-scheme',
            () => this._applyTheme(),
            'system-theme-changed'
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
    }

    _applyTheme() {
        if (!this._contentBox) return;

        const themeClasses = ['light', 'theme-adwaita', 'theme-catppuccin', 'theme-dracula', 
            'theme-nord', 'theme-gruvbox', 'theme-onedark', 'theme-monokai', 
            'theme-solarized', 'theme-tokyonight', 'theme-rosepine', 'theme-material', 'theme-ayu'];
        
        themeClasses.forEach(cls => this._contentBox.remove_style_class_name(cls));

        const followSystem = this._settings.get_boolean('follow-system-theme');

        if (followSystem) {
            const colorScheme = this._interfaceSettings.get_string('color-scheme');
            if (colorScheme === 'prefer-light') {
                this._contentBox.add_style_class_name('light');
            }
        } else {
            const theme = this._settings.get_string('theme');
            if (theme && theme !== 'default') {
                this._contentBox.add_style_class_name(`theme-${theme}`);
            }
        }

        this._updateSize();
    }

    _updateSize() {
        const width = this._settings.get_int('popup-width') || 450;
        const height = this._settings.get_int('popup-height') || 550;
        
        this._contentBox.set_style(`
            width: ${width}px;
            min-height: ${Math.min(height, 400)}px;
            max-height: ${height}px;
        `);
    }

    _buildHeader() {
        this._header = new St.BoxLayout({
            style_class: 'clipmaster-header',
            x_expand: true
        });

        const headerIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(
                this._extension._extensionPath + '/assets/icons/clipmaster-symbolic.svg'
            ),
            style_class: 'clipmaster-header-icon',
            icon_size: 18
        });
        this._header.add_child(headerIcon);

        const title = new St.Label({
            text: 'ClipMaster',
            style_class: 'clipmaster-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._header.add_child(title);

        // Plain text toggle
        this._plainTextButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'text-x-generic-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true
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
            track_hover: true
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

        // Close button
        this._closeButton = new St.Button({
            style_class: 'clipmaster-close-button',
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true
        });
        this._closeButton._tooltipText = _('Close');
        this._closeButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._closeButton.connect('clicked', () => {
            this._isPinned = false;
            this._pinButton.remove_style_pseudo_class('checked');
            this.menu.close();
            return Clutter.EVENT_STOP;
        });
        this._header.add_child(this._closeButton);

        this._contentBox.add_child(this._header);
    }

    _onButtonHover(button) {
        if (button.hover && button._tooltipText) {
            this._tooltip.set_text(button._tooltipText);
            this._tooltip.visible = true;

            const [x, y] = button.get_transformed_position();
            const [w, h] = button.get_size();
            this._tooltip.set_position(
                Math.round(x + w / 2 - this._tooltip.width / 2),
                Math.round(y + h + 5)
            );
        } else {
            this._tooltip.visible = false;
        }
    }

    _buildSearchBar() {
        this._searchEntry = new St.Entry({
            style_class: 'clipmaster-search',
            hint_text: _('Search...'),
            can_focus: true,
            x_expand: true
        });
        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._searchQuery = this._searchEntry.get_text();
            this._loadItems();
        });
        this._searchEntry.clutter_text.connect('activate', () => {
            this._pasteSelected();
        });
        this._contentBox.add_child(this._searchEntry);
    }

    _buildFilterBar() {
        // Container for filter bar and lists bar
        this._filterBarContainer = new St.BoxLayout({
            style_class: 'clipmaster-filter-bar-container',
            vertical: true,
            x_expand: true
        });

        const filterBar = new St.BoxLayout({
            style_class: 'clipmaster-filter-bar',
            x_expand: true
        });

        // Text button (default)
        this._textButton = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Text'),
            can_focus: false
        });
        this._textButton.connect('clicked', () => this._setFilter(null, ItemType.TEXT));
        filterBar.add_child(this._textButton);

        // Favorites button (second position)
        this._favButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            child: new St.Icon({ icon_name: 'starred-symbolic', icon_size: 14 }),
            can_focus: false,
            track_hover: true
        });
        this._favButton._tooltipText = _('Favorites');
        this._favButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._favButton.connect('clicked', () => this._setFilter(-1));
        filterBar.add_child(this._favButton);

        // URL button
        this._urlButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('URL'),
            can_focus: false
        });
        this._urlButton.connect('clicked', () => this._setFilter(null, ItemType.URL));
        filterBar.add_child(this._urlButton);

        // Code button
        this._codeButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Code'),
            can_focus: false
        });
        this._codeButton.connect('clicked', () => this._setFilter(null, ItemType.CODE));
        filterBar.add_child(this._codeButton);

        // Images button
        this._imageButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Images'),
            can_focus: false
        });
        this._imageButton.connect('clicked', () => this._setFilter(null, ItemType.IMAGE));
        filterBar.add_child(this._imageButton);

        // All button
        this._allButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('All'),
            can_focus: false
        });
        this._allButton.connect('clicked', () => this._setFilter(null));
        filterBar.add_child(this._allButton);

        // Lists management button (at the end)
        this._listsManageButton = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Lists'),
            can_focus: false
        });
        this._listsManageButton.connect('clicked', () => this._setFilter(null, null, true));
        filterBar.add_child(this._listsManageButton);

        this._filterBar = filterBar;
        this._filterBarContainer.add_child(filterBar);

        // Lists bar (second row)
        this._listsBar = new St.BoxLayout({
            style_class: 'clipmaster-lists-bar',
            x_expand: true
        });
        this._filterBarContainer.add_child(this._listsBar);

        this._contentBox.add_child(this._filterBarContainer);

        // Build lists buttons
        this._buildListsBar();
    }

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

        // Add each list as a button with its color as background
        lists.forEach(list => {
            const btn = new St.Button({
                style_class: 'clipmaster-list-tag',
                can_focus: false,
                track_hover: true
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
                style_class: 'clipmaster-list-tag-label'
            });
            btn.set_child(label);
            btn._listId = list.id;

            btn.connect('clicked', () => {
                this._setFilter(list.id);
            });

            this._listsBar.add_child(btn);
            this._listButtons[list.id] = btn;
        });

        // Add "Manage" button to enter list management view
        this._manageListsBtn = new St.Button({
            style_class: 'clipmaster-list-add-btn',
            can_focus: false,
            track_hover: true
        });
        this._manageListsBtn.set_child(new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 12 }));
        this._manageListsBtn._tooltipText = _('Manage Lists');
        this._manageListsBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
        this._manageListsBtn.connect('clicked', () => {
            this._setFilter(null, null, true); // Enter manage mode
        });
        this._listsBar.add_child(this._manageListsBtn);
    }

    _loadManageListsView() {
        // Check if we're in "add new list" mode
        if (this._addingNewList) {
            this._buildAddListForm();
            return;
        }
        
        // Check if we're in "edit list" mode
        if (this._editingList) {
            this._buildEditListForm(this._editingList);
            return;
        }

        // Header row with title and add button
        const headerRow = new St.BoxLayout({
            style_class: 'clipmaster-manage-header',
            x_expand: true
        });

        const headerLabel = new St.Label({
            text: _('Manage Lists'),
            style_class: 'clipmaster-lists-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        headerRow.add_child(headerLabel);

        const addListBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('+ Add'),
            can_focus: false
        });
        addListBtn.connect('clicked', () => {
            this._addingNewList = true;
            this._loadItems();
        });
        headerRow.add_child(addListBtn);

        this._itemsBox.add_child(headerRow);

        // Lists container
        const lists = this._database.getLists();
        if (lists.length === 0) {
            const emptyLabel = new St.Label({
                text: _('No lists yet. Click "+ Add" to create one.'),
                style_class: 'clipmaster-empty',
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                margin_top: 20
            });
            this._itemsBox.add_child(emptyLabel);
        } else {
            lists.forEach(list => {
                const listRow = this._createManageListRow(list);
                this._itemsBox.add_child(listRow);
            });
        }
    }

    _createManageListRow(list) {
        const row = new St.BoxLayout({
            style_class: 'clipmaster-manage-list-row',
            x_expand: true,
            reactive: true,
            track_hover: true
        });

        // Color indicator
        const colorDot = new St.Widget({
            style: `background-color: ${list.color || '#6c7086'}; border-radius: 4px;`,
            width: 16,
            height: 16
        });
        row.add_child(colorDot);

        // List name
        const listLabel = new St.Label({
            text: list.name,
            style_class: 'clipmaster-manage-list-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(listLabel);

        // Item count
        const itemCount = this._database.getItems({ listId: list.id }).length;
        const countLabel = new St.Label({
            text: `${itemCount} items`,
            style_class: 'clipmaster-manage-list-count',
            y_align: Clutter.ActorAlign.CENTER
        });
        row.add_child(countLabel);

        // Edit button
        const editBtn = new St.Button({
            style_class: 'clipmaster-action-button',
            child: new St.Icon({ icon_name: 'document-edit-symbolic', icon_size: 14 }),
            can_focus: false
        });
        editBtn._tooltipText = _('Edit');
        editBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
        editBtn.connect('clicked', () => {
            this._editingList = list;
            this._loadItems();
        });
        row.add_child(editBtn);

        // Delete button
        const deleteBtn = new St.Button({
            style_class: 'clipmaster-action-button clipmaster-delete-button',
            child: new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: 14 }),
            can_focus: false
        });
        deleteBtn._tooltipText = _('Delete');
        deleteBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
        deleteBtn.connect('clicked', () => {
            this._database.deleteList(list.id);
            this._buildListsBar();
            this._loadItems();
        });
        row.add_child(deleteBtn);

        return row;
    }
    
    _buildAddListForm() {
        // Header with back button
        const headerRow = new St.BoxLayout({
            style_class: 'clipmaster-manage-header',
            x_expand: true
        });

        const backBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('← Back'),
            can_focus: false
        });
        backBtn.connect('clicked', () => {
            this._addingNewList = false;
            this._loadItems();
        });
        headerRow.add_child(backBtn);

        const headerLabel = new St.Label({
            text: _('Add New List'),
            style_class: 'clipmaster-lists-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        headerRow.add_child(headerLabel);

        // Spacer for alignment
        const spacerHeader = new St.Widget({ width: 60 });
        headerRow.add_child(spacerHeader);

        this._itemsBox.add_child(headerRow);

        // Form container
        const formBox = new St.BoxLayout({
            style_class: 'clipmaster-inline-form',
            vertical: true,
            x_expand: true
        });

        // Name entry
        const nameLabel = new St.Label({
            text: _('List Name:'),
            style_class: 'clipmaster-context-label',
            x_align: Clutter.ActorAlign.START
        });
        formBox.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-inline-entry',
            hint_text: _('Enter list name...'),
            x_expand: true,
            can_focus: true
        });
        formBox.add_child(nameEntry);

        // Color row
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            x_align: Clutter.ActorAlign.START,
            margin_top: 12
        });
        formBox.add_child(colorLabel);

        const colorRow = new St.BoxLayout({ x_expand: true, spacing: 6 });

        const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#95a5a6'];
        let selectedColor = colors[0];

        colors.forEach(color => {
            const colorBtn = new St.Button({
                style_class: 'clipmaster-color-button',
                style: `background-color: ${color};`,
                can_focus: false
            });
            if (color === selectedColor) {
                colorBtn.add_style_class_name('selected');
            }
            colorBtn.connect('clicked', () => {
                colorRow.get_children().forEach(c => {
                    if (c instanceof St.Button) c.remove_style_class_name('selected');
                });
                colorBtn.add_style_class_name('selected');
                selectedColor = color;
            });
            colorRow.add_child(colorBtn);
        });
        formBox.add_child(colorRow);

        // Create button
        const createBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Create List'),
            can_focus: false,
            x_expand: true,
            margin_top: 16
        });
        createBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (name) {
                this._database.createList(name, selectedColor);
                this._buildListsBar();
                this._addingNewList = false;
                this._loadItems();
            }
        });
        formBox.add_child(createBtn);

        this._itemsBox.add_child(formBox);

        // Focus on name entry
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            nameEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _buildEditListForm(list) {
        // Header with back button
        const headerRow = new St.BoxLayout({
            style_class: 'clipmaster-manage-header',
            x_expand: true
        });

        const backBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('← Back'),
            can_focus: false
        });
        backBtn.connect('clicked', () => {
            this._editingList = null;
            this._loadItems();
        });
        headerRow.add_child(backBtn);

        const headerLabel = new St.Label({
            text: _('Edit List'),
            style_class: 'clipmaster-lists-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        headerRow.add_child(headerLabel);

        // Spacer for alignment
        const spacerHeader = new St.Widget({ width: 60 });
        headerRow.add_child(spacerHeader);

        this._itemsBox.add_child(headerRow);

        // Form container
        const formBox = new St.BoxLayout({
            style_class: 'clipmaster-inline-form',
            vertical: true,
            x_expand: true
        });

        // Name entry
        const nameLabel = new St.Label({
            text: _('List Name:'),
            style_class: 'clipmaster-context-label',
            x_align: Clutter.ActorAlign.START
        });
        formBox.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-inline-entry',
            text: list.name,
            x_expand: true,
            can_focus: true
        });
        formBox.add_child(nameEntry);

        // Color row
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            x_align: Clutter.ActorAlign.START,
            margin_top: 12
        });
        formBox.add_child(colorLabel);

        const colorRow = new St.BoxLayout({ x_expand: true, spacing: 6 });

        const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#95a5a6'];
        let selectedColor = list.color || colors[0];

        colors.forEach(color => {
            const colorBtn = new St.Button({
                style_class: 'clipmaster-color-button',
                style: `background-color: ${color};`,
                can_focus: false
            });
            if (color === selectedColor) {
                colorBtn.add_style_class_name('selected');
            }
            colorBtn.connect('clicked', () => {
                colorRow.get_children().forEach(c => {
                    if (c instanceof St.Button) c.remove_style_class_name('selected');
                });
                colorBtn.add_style_class_name('selected');
                selectedColor = color;
            });
            colorRow.add_child(colorBtn);
        });
        formBox.add_child(colorRow);

        // Save button
        const saveBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Save Changes'),
            can_focus: false,
            x_expand: true,
            margin_top: 16
        });
        saveBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (name) {
                this._database.updateList(list.id, { name, color: selectedColor });
                this._buildListsBar();
                this._editingList = null;
                this._loadItems();
            }
        });
        formBox.add_child(saveBtn);

        this._itemsBox.add_child(formBox);

        // Focus on name entry
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            nameEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _buildItemsList() {
        this._scrollView = new St.ScrollView({
            style_class: 'clipmaster-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
            y_expand: true
        });

        this._itemsBox = new St.BoxLayout({
            style_class: 'clipmaster-items',
            vertical: true,
            x_expand: true
        });

        this._scrollView.add_child(this._itemsBox);
        this._contentBox.add_child(this._scrollView);
    }

    _buildFooter() {
        const footer = new St.BoxLayout({
            style_class: 'clipmaster-footer',
            x_expand: true
        });

        const shortcutText = new St.Label({
            text: '↑↓ Nav • Enter Paste • Del Delete • Esc Close',
            style_class: 'clipmaster-footer-text',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER
        });
        footer.add_child(shortcutText);

        this._contentBox.add_child(footer);
    }

    _onMenuOpened() {
        debugLog('Menu opened');
        this._searchEntry.set_text('');
        this._searchQuery = '';
        this._selectedIndex = 0;
        this._currentListId = null;
        this._currentType = ItemType.TEXT;
        this._manageMode = false;
        this._addingNewList = false;
        this._editingList = null;
        this._plainTextMode = false;
        this._plainTextButton.remove_style_pseudo_class('checked');

        this._isPinned = false;
        this._pinButton.remove_style_pseudo_class('checked');

        // Rebuild lists bar (in case lists changed)
        this._buildListsBar();

        // Reset filter buttons
        [this._allButton, this._favButton, this._textButton, this._imageButton,
         this._urlButton, this._codeButton, this._listsManageButton].forEach(b => {
            if (b) b.remove_style_class_name('active');
        });
        
        // Clear list button states
        if (this._listButtons) {
            Object.values(this._listButtons).forEach(b => {
                if (b) b.remove_style_class_name('active');
            });
        }
        
        this._textButton.add_style_class_name('active');

        this._loadItems();

        this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (this.menu.isOpen) {
                this._searchEntry.grab_key_focus();
            }
            return GLib.SOURCE_REMOVE;
        }, 'focus-search');
    }

    _onMenuClosed() {
        debugLog('Menu closed');
        this._closeContextPanel();
        this._closeQrPanel();
        if (this._tooltip) {
            this._tooltip.visible = false;
        }
    }

    // Only handle clicks when menu is closed (to open it).
    // When menu is open, let all clicks propagate normally to buttons inside.
    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1) {
            // If menu is already open, let clicks propagate normally (don't intercept)
            if (this.menu.isOpen) {
                return Clutter.EVENT_PROPAGATE;
            }
            
            // Menu is closed, open it
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }

    _setFilter(listId, type = null, manageMode = false) {
        this._currentListId = listId;
        this._currentType = type;
        this._manageMode = manageMode;

        // Clear all filter button states
        [this._allButton, this._favButton, this._textButton, this._imageButton, 
         this._urlButton, this._codeButton, this._listsManageButton].forEach(b => {
            if (b) b.remove_style_class_name('active');
        });

        // Clear list button states
        if (this._listButtons) {
            Object.values(this._listButtons).forEach(b => {
                if (b) b.remove_style_class_name('active');
            });
        }

        // Clear manage button state (old gear button)
        if (this._manageListsBtn) {
            this._manageListsBtn.remove_style_class_name('active');
        }

        if (manageMode) {
            // Manage lists mode
            if (this._listsManageButton) {
                this._listsManageButton.add_style_class_name('active');
            }
        } else if (listId === -1) {
            // Favorites
            this._favButton.add_style_class_name('active');
        } else if (listId !== null && listId !== undefined && listId > 0) {
            // Custom list
            if (this._listButtons && this._listButtons[listId]) {
                this._listButtons[listId].add_style_class_name('active');
            }
        } else if (type === ItemType.TEXT) {
            this._textButton.add_style_class_name('active');
        } else if (type === ItemType.IMAGE) {
            this._imageButton.add_style_class_name('active');
        } else if (type === ItemType.URL) {
            this._urlButton.add_style_class_name('active');
        } else if (type === ItemType.CODE) {
            this._codeButton.add_style_class_name('active');
        } else {
            // All
            this._allButton.add_style_class_name('active');
        }

        this._loadItems();
    }

    _loadItems() {
        if (!this._itemsBox || !this._database) return;

        this._closeContextPanel();
        this._closeQrPanel();
        this._itemsBox.destroy_all_children();

        // If in manage mode, show list management UI
        if (this._manageMode) {
            this._loadManageListsView();
            return;
        }

        const limit = this._settings.get_int('items-per-page') || 50;
        const options = {
            limit: limit,
            search: this._searchQuery || null,
            listId: this._currentListId,
            type: this._currentType,
            // Exclude favorites from type filters (they have their own tab)
            excludeFavorites: this._currentType !== null && this._currentListId !== -1
        };

        this._items = this._database.getItems(options);

        if (this._items.length === 0) {
            const emptyLabel = new St.Label({
                text: _('No clipboard items'),
                style_class: 'clipmaster-empty',
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER
            });
            this._itemsBox.add_child(emptyLabel);
            return;
        }

        this._items.forEach((item, index) => {
            const row = this._createItemRow(item, index);
            this._itemsBox.add_child(row);
        });

        this._updateSelection();
    }

    _createItemRow(item, index) {
        const row = new St.BoxLayout({
            style_class: 'clipmaster-item',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true
        });
        row._item = item;
        row._index = index;

        // Apply list color as background if item belongs to a list
        if (item.listId) {
            const list = this._database.getListById(item.listId);
            if (list && list.color) {
                // Mix list color with base background (#242424) to avoid transparency issues
                const mixedColor = this._mixColors('#242424', list.color, 0.2);
                row.set_style(`background-color: ${mixedColor};`);
                row._listColor = list.color;
            }
        }

        // Click handler
        row.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._selectedIndex = index;
                this._updateSelection();
                this._pasteSelected();
                return Clutter.EVENT_STOP;
            } else if (event.get_button() === 3) {
                this._selectedIndex = index;
                this._updateSelection();
                this._showContextMenu(item, row);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Hover handler
        row.connect('enter-event', () => {
            if (this._contextPanelRow && this._contextPanelRow !== row) {
                this._closeContextPanel();
            }
            if (this._qrPanelRow && this._qrPanelRow !== row) {
                this._closeQrPanel();
            }
            this._selectedIndex = index;
            this._updateSelection();
        });

        // Number label (1-9)
        if (index < 9) {
            const numLabel = new St.Label({
                text: (index + 1).toString(),
                style_class: 'clipmaster-item-number'
            });
            row.add_child(numLabel);
        } else {
            const spacer = new St.Widget({ width: 24 });
            row.add_child(spacer);
        }

        // Type icon
        const iconName = this._getTypeIcon(item.type);
        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 16,
            style_class: 'clipmaster-item-icon'
        });
        row.add_child(icon);

        // Content box
        const contentBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'clipmaster-item-content'
        });

        // Title
        if (item.title) {
            const titleLabel = new St.Label({
                text: item.title,
                style_class: 'clipmaster-item-title',
                x_expand: true,
                x_align: Clutter.ActorAlign.START
            });
            titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            contentBox.add_child(titleLabel);
        }

        // Preview text
        let previewText = item.preview || item.plainText || item.content || '';
        if (item.type === ItemType.IMAGE) {
            const size = item.metadata?.size ? ` (${Math.round(item.metadata.size / 1024)}KB)` : '';
            previewText = `🖼️ Image${size}`;
        }

        const previewLength = this._settings.get_int('preview-length') || 100;
        if (previewText.length > previewLength) {
            previewText = previewText.substring(0, previewLength) + '...';
        }
        previewText = previewText.replace(/\n/g, ' ').trim();

        const previewLabel = new St.Label({
            text: previewText,
            style_class: 'clipmaster-item-preview',
            x_expand: true,
            x_align: Clutter.ActorAlign.START
        });
        previewLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        contentBox.add_child(previewLabel);

        // Bottom row: time + actions
        const bottomRow = new St.BoxLayout({
            style_class: 'clipmaster-item-bottom',
            x_expand: true
        });

        if (item.created) {
            const timeLabel = new St.Label({
                text: this._formatTime(item.created),
                style_class: 'clipmaster-item-time',
                y_align: Clutter.ActorAlign.CENTER
            });
            bottomRow.add_child(timeLabel);
        }

        const spacer = new St.Widget({ x_expand: true });
        bottomRow.add_child(spacer);

        const iconSize = 12;

        // QR button for TEXT items
        if (item.type === ItemType.TEXT && QrCodeGenerator.canEncode(item.content || item.plainText)) {
            const qrButton = new St.Button({
                style_class: 'clipmaster-action-button',
                can_focus: false,
                reactive: true,
                track_hover: true
            });
            qrButton.set_child(new St.Icon({ icon_name: 'view-grid-symbolic', icon_size: iconSize }));
            qrButton._tooltipText = _('QR Code');
            qrButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
            qrButton.connect('button-press-event', (actor, event) => {
                if (event.get_button() === 1) {
                    this._showQrPanel(item, row);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            bottomRow.add_child(qrButton);
        }

        // Favorite button
        const favButton = new St.Button({
            style_class: 'clipmaster-action-button',
            can_focus: false,
            reactive: true,
            track_hover: true
        });
        const favIcon = new St.Icon({
            icon_name: item.isFavorite ? 'starred-symbolic' : 'non-starred-symbolic',
            icon_size: iconSize,
            style_class: item.isFavorite ? 'clipmaster-item-fav' : 'clipmaster-item-fav-inactive'
        });
        favButton.set_child(favIcon);
        favButton._tooltipText = item.isFavorite ? _('Unfavorite') : _('Favorite');
        favButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
        favButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                const newState = this._database.toggleFavorite(item.id);
                
                // If we're in a type filter (not favorites or all), refresh to remove/show the item
                if (this._currentType !== null && this._currentListId !== -1) {
                    // Item was just favorited, remove it from current type filter
                    if (newState) {
                        this._loadItems();
                    }
                } else if (this._currentListId === -1 && !newState) {
                    // In favorites view and item was unfavorited, remove it
                    this._loadItems();
                } else {
                    // Just update the icon
                    favIcon.icon_name = newState ? 'starred-symbolic' : 'non-starred-symbolic';
                    favIcon.style_class = newState ? 'clipmaster-item-fav' : 'clipmaster-item-fav-inactive';
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
            track_hover: true
        });
        deleteButton.set_child(new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: iconSize }));
        deleteButton._tooltipText = _('Delete');
        deleteButton.connect('notify::hover', (btn) => this._onButtonHover(btn));
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
    }

    _showContextMenu(item, row) {
        // Toggle: if clicking same row that's already open, close it
        if (this._contextPanelRow === row && this._contextPanel) {
            this._closeContextPanel();
            return;
        }

        this._closeContextPanel();
        this._closeQrPanel();

        // Create context panel
        this._contextPanel = new St.BoxLayout({
            style_class: 'clipmaster-context-panel',
            vertical: true,
            x_expand: true,
            reactive: true
        });

        // Edit Title Row
        const titleRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });

        const titleLabel = new St.Label({
            text: _('Title:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        titleRow.add_child(titleLabel);

        const titleEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            text: item.title || '',
            hint_text: _('Enter title...'),
            x_expand: true,
            can_focus: true
        });
        titleRow.add_child(titleEntry);

        const saveTitleBtn = new St.Button({
            style_class: 'clipmaster-context-save-button',
            child: new St.Icon({ icon_name: 'object-select-symbolic', icon_size: 14 }),
            can_focus: false
        });
        saveTitleBtn.connect('clicked', () => {
            const newTitle = titleEntry.get_text().trim();
            this._database.updateItem(item.id, { title: newTitle || null });
            this._closeContextPanel();
            this._loadItems();
        });
        titleRow.add_child(saveTitleBtn);

        this._contextPanel.add_child(titleRow);

        // Edit Content Row (only for text types)
        if (item.type === ItemType.TEXT || item.type === ItemType.URL || 
            item.type === ItemType.CODE || item.type === ItemType.HTML) {
            const contentRow = new St.BoxLayout({
                style_class: 'clipmaster-context-row',
                x_expand: true
            });

            const contentLabel = new St.Label({
                text: _('Content:'),
                style_class: 'clipmaster-context-label',
                y_align: Clutter.ActorAlign.CENTER
            });
            contentRow.add_child(contentLabel);

            const contentEntry = new St.Entry({
                style_class: 'clipmaster-context-entry',
                text: item.content || item.plainText || '',
                x_expand: true,
                can_focus: true
            });
            contentRow.add_child(contentEntry);

            const saveContentBtn = new St.Button({
                style_class: 'clipmaster-context-save-button',
                child: new St.Icon({ icon_name: 'object-select-symbolic', icon_size: 14 }),
                can_focus: false
            });
            saveContentBtn.connect('clicked', () => {
                const newContent = contentEntry.get_text();
                this._database.updateItem(item.id, {
                    content: newContent,
                    plainText: newContent,
                    preview: newContent.substring(0, 200)
                });
                this._closeContextPanel();
                this._loadItems();
            });
            contentRow.add_child(saveContentBtn);

            this._contextPanel.add_child(contentRow);
        }

        // Add to List Row
        const lists = this._database.getLists();
        if (lists.length > 0) {
            const listRow = new St.BoxLayout({
                style_class: 'clipmaster-context-row',
                x_expand: true
            });

            const listLabel = new St.Label({
                text: _('Add to List:'),
                style_class: 'clipmaster-context-label',
                y_align: Clutter.ActorAlign.CENTER
            });
            listRow.add_child(listLabel);

            // Current list indicator
            const currentList = item.listId ? lists.find(l => l.id === item.listId) : null;
            
            lists.forEach(list => {
                const listBtn = new St.Button({
                    style_class: 'clipmaster-list-select-button',
                    can_focus: false
                });
                
                const btnBox = new St.BoxLayout({ vertical: false });
                if (list.color) {
                    const colorDot = new St.Widget({
                        style: `background-color: ${list.color}; border-radius: 50%;`,
                        width: 8,
                        height: 8
                    });
                    btnBox.add_child(colorDot);
                }
                const btnLabel = new St.Label({ 
                    text: list.name,
                    y_align: Clutter.ActorAlign.CENTER
                });
                btnBox.add_child(btnLabel);
                listBtn.set_child(btnBox);

                if (item.listId === list.id) {
                    listBtn.add_style_class_name('selected');
                }

                listBtn.connect('clicked', () => {
                    if (item.listId === list.id) {
                        // Remove from list
                        this._database.updateItem(item.id, { listId: null });
                    } else {
                        // Add to list
                        this._database.addItemToList(item.id, list.id);
                    }
                    this._closeContextPanel();
                    this._loadItems();
                });
                listRow.add_child(listBtn);
            });

            this._contextPanel.add_child(listRow);
        }

        // Insert panel after row
        const rowIndex = this._itemsBox.get_children().indexOf(row);
        if (rowIndex >= 0) {
            this._itemsBox.insert_child_above(this._contextPanel, row);
        }

        this._contextPanelRow = row;

        // Focus title entry
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (this._contextPanel) {
                titleEntry.grab_key_focus();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _closeContextPanel() {
        if (this._contextPanel) {
            this._contextPanel.destroy();
            this._contextPanel = null;
            this._contextPanelRow = null;
        }
    }

    _showQrPanel(item, row) {
        if (this._qrPanelRow === row && this._qrPanel) {
            this._closeQrPanel();
            return;
        }

        this._closeContextPanel();
        this._closeQrPanel();

        const text = item.content || item.plainText || '';

        if (!QrCodeGenerator.canEncode(text)) {
            Main.notify(_('ClipMaster'), _('Text too long for QR code'));
            return;
        }

        this._qrPanel = new St.BoxLayout({
            style_class: 'clipmaster-qr-panel',
            vertical: true,
            x_expand: true,
            reactive: true
        });

        try {
            const { size, modules } = QrCodeGenerator.generate(text, QrEcc.MEDIUM);
            const qrSize = 160;
            const cellSize = Math.floor(qrSize / (size + 4));
            const actualSize = cellSize * (size + 4);

            const qrContainer = new St.Widget({
                style_class: 'clipmaster-qr-inline-container',
                width: actualSize,
                height: actualSize,
                x_align: Clutter.ActorAlign.CENTER
            });

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (modules[y][x]) {
                        const cell = new St.Widget({
                            style: 'background-color: #000000;',
                            width: cellSize,
                            height: cellSize,
                            x: (x + 2) * cellSize,
                            y: (y + 2) * cellSize
                        });
                        qrContainer.add_child(cell);
                    }
                }
            }

            const centerBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER });
            centerBox.add_child(qrContainer);
            this._qrPanel.add_child(centerBox);

            const previewText = text.length > 50 ? text.substring(0, 50) + '...' : text;
            const previewLabel = new St.Label({
                text: previewText,
                style_class: 'clipmaster-qr-preview',
                x_align: Clutter.ActorAlign.CENTER
            });
            this._qrPanel.add_child(previewLabel);

        } catch (e) {
            const errorLabel = new St.Label({
                text: _('Failed to generate QR code'),
                style_class: 'clipmaster-qr-error',
                x_align: Clutter.ActorAlign.CENTER
            });
            this._qrPanel.add_child(errorLabel);
        }

        const rowIndex = this._itemsBox.get_children().indexOf(row);
        if (rowIndex >= 0) {
            this._itemsBox.insert_child_above(this._qrPanel, row);
        }

        this._qrPanelRow = row;
    }

    _closeQrPanel() {
        if (this._qrPanel) {
            this._qrPanel.destroy();
            this._qrPanel = null;
            this._qrPanelRow = null;
        }
    }

    _getTypeIcon(type) {
        const icons = {
            [ItemType.TEXT]: 'text-x-generic-symbolic',
            [ItemType.HTML]: 'text-html-symbolic',
            [ItemType.IMAGE]: 'image-x-generic-symbolic',
            [ItemType.FILE]: 'folder-documents-symbolic',
            [ItemType.URL]: 'web-browser-symbolic',
            [ItemType.COLOR]: 'color-select-symbolic',
            [ItemType.CODE]: 'text-x-script-symbolic'
        };
        return icons[type] || 'text-x-generic-symbolic';
    }

    _formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return _('Just now');
        if (diffMins < 60) return _('%d min ago').format(diffMins);
        if (diffHours < 24) return _('%d hr ago').format(diffHours);
        if (diffDays < 7) return _('%d days ago').format(diffDays);
        return date.toLocaleDateString();
    }

    _hexToRgba(hex, alpha = 1) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Parse hex values
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            return `rgba(0, 0, 0, ${alpha})`;
        }
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16)
            };
        } else if (hex.length === 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16)
            };
        }
        return { r: 0, g: 0, b: 0 };
    }

    _mixColors(baseHex, colorHex, amount) {
        // Mix two colors: result = base * (1-amount) + color * amount
        const base = this._hexToRgb(baseHex);
        const color = this._hexToRgb(colorHex);
        
        const r = Math.round(base.r * (1 - amount) + color.r * amount);
        const g = Math.round(base.g * (1 - amount) + color.g * amount);
        const b = Math.round(base.b * (1 - amount) + color.b * amount);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    _updateSelection() {
        if (!this._itemsBox) return;

        const children = this._itemsBox.get_children();
        children.forEach((child, index) => {
            if (child._index !== undefined) {
                if (child._index === this._selectedIndex) {
                    child.add_style_class_name('selected');
                } else {
                    child.remove_style_class_name('selected');
                }
            }
        });
    }

    _scrollToSelected() {
        const children = this._itemsBox.get_children();
        const selected = children.find(c => c._index === this._selectedIndex);
        if (selected) {
            const adj = this._scrollView.vscroll.adjustment;
            const [, y] = selected.get_transformed_position();
            const [, boxY] = this._scrollView.get_transformed_position();
            const relY = y - boxY;
            
            if (relY < 0) {
                adj.value += relY;
            } else if (relY + selected.height > this._scrollView.height) {
                adj.value += relY + selected.height - this._scrollView.height;
            }
        }
    }

    _pasteSelected(fromHover = false) {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._items.length) {
            return;
        }

        const item = this._items[this._selectedIndex];

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

        const closeOnPaste = this._settings.get_boolean('close-on-paste');

        if (closeOnPaste && !fromHover && !this._isPinned) {
            this.menu.close();
        }
    }

    _onKeyPress(actor, event) {
        const symbol = event.get_key_symbol();

        if (symbol === Clutter.KEY_Escape) {
            this._isPinned = false;
            this._pinButton.remove_style_pseudo_class('checked');
            this.menu.close();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up) {
            if (this._selectedIndex > 0) {
                this._selectedIndex--;
                this._updateSelection();
                this._scrollToSelected();
            }
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down) {
            if (this._selectedIndex < this._items.length - 1) {
                this._selectedIndex++;
                this._updateSelection();
                this._scrollToSelected();
            }
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            this._pasteSelected();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Delete) {
            if (this._items.length > 0 && this._selectedIndex < this._items.length) {
                this._database.deleteItem(this._items[this._selectedIndex].id);
                this._loadItems();
            }
            return Clutter.EVENT_STOP;
        }

        // Number keys 1-9 for quick paste
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

    refresh() {
        if (this.menu.isOpen) {
            this._loadItems();
        }
    }

    destroy() {
        this._closeContextPanel();
        this._closeQrPanel();

        if (this._tooltip && this._tooltip.get_parent()) {
            this._tooltip.get_parent().remove_child(this._tooltip);
            this._tooltip.destroy();
            this._tooltip = null;
        }

        if (this._signalManager) {
            this._signalManager.disconnectAll();
            this._signalManager = null;
        }

        if (this._timeoutManager) {
            this._timeoutManager.removeAll();
            this._timeoutManager = null;
        }

        this._interfaceSettings = null;
        this._extension = null;
        this._settings = null;
        this._database = null;
        this._monitor = null;

        super.destroy();
    }
});
