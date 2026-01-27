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
import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ItemType, debugLog } from '../Util/Constants.js';
import { SignalManager, TimeoutManager } from '../Util/Utils.js';
import { QrCodeGenerator, QrEcc } from '../Util/QrCodeGenerator.js';
import { Keyboard } from '../Util/Keyboard.js';
import { tr as _, initTranslations } from '../Util/Translations.js';

export const ClipMasterIndicator = GObject.registerClass(
class ClipMasterIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'ClipMaster Custom');

        this._extension = extension;
        this._settings = extension._settings;
        this._database = extension._database;
        this._monitor = extension._monitor;

        this._items = [];
        this._itemRows = []; // Array to store row references by index
        this._selectedIndex = -1; // No item selected initially
        this._searchQuery = '';
        this._currentListId = null;
        this._currentType = null;
        this._plainTextMode = false;
        this._isPinned = false;

        this._signalManager = new SignalManager();
        this._timeoutManager = new TimeoutManager();
        this._keyboard = new Keyboard();

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
        global.stage.add_child(this._tooltip);

        debugLog('ClipMaster Custom Indicator initialized');
    }

    _buildUI() {
        // Main content box
        this._contentBox = new St.BoxLayout({
            style_class: 'clipmaster-popup',
            vertical: true,
            x_expand: true,
            y_expand: true,
            can_focus: true
        });

        // Add content box to menu
        const menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'clipmaster-menu-box'
        });
        menuItem.add_child(this._contentBox);
        this.menu.addMenuItem(menuItem);
        
        // Connect keyboard events to content box as well
        this._contentBox.connect('key-press-event', this._onKeyPress.bind(this));
        
        // Clear hover state when mouse leaves the entire menu (not just content area)
        this.menu.actor.connect('leave-event', () => {
            this._clearAllHoverStates();
            // Removed: no longer clear selected on mouse leave (selected is only for keyboard navigation)
            return Clutter.EVENT_PROPAGATE;
        });

        this._buildHeader();
        this._buildSearchBar();
        this._buildFilterBar();
        this._buildItemsList();
        this._buildFooter();

        // Note: Key events are handled by _contentBox.connect('key-press-event') in _buildSearchBar()
        // We don't need to connect to menu.actor to avoid duplicate event handling

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
    }

    _applyTheme() {
        if (!this._contentBox) return;

        const themeClasses = ['light', 'theme-adwaita', 'theme-catppuccin', 'theme-dracula', 
            'theme-nord', 'theme-gruvbox', 'theme-onedark', 'theme-monokai', 
            'theme-solarized', 'theme-tokyonight', 'theme-rosepine', 'theme-material', 'theme-ayu'];
        
        themeClasses.forEach(cls => this._contentBox.remove_style_class_name(cls));

        const theme = this._settings.get_string('theme');
        
        // Determine light/dark based on theme mode
        let isLight = false;
        
        if (this._themeMode === 'light') {
            isLight = true;
        } else if (this._themeMode === 'dark') {
            isLight = false;
        } else {
            // Auto mode - follow system
            const colorScheme = this._interfaceSettings.get_string('color-scheme');
            const gtkTheme = this._interfaceSettings.get_string('gtk-theme');
            
            if (colorScheme === 'prefer-light') {
                isLight = true;
            } else if (colorScheme === 'default') {
                isLight = gtkTheme && !gtkTheme.toLowerCase().includes('dark');
            }
            // colorScheme === 'prefer-dark' -> isLight stays false
        }
        
        debugLog(`_applyTheme: themeMode=${this._themeMode}, isLight=${isLight}`);
        
        if (isLight) {
            this._contentBox.add_style_class_name('light');
            debugLog('_applyTheme: Applied light theme');
        } else {
            debugLog('_applyTheme: Applied dark theme');
        }
        
        // Also apply the selected theme style on top
        if (theme && theme !== 'default') {
            this._contentBox.add_style_class_name(`theme-${theme}`);
            debugLog(`_applyTheme: Also applied theme-${theme}`);
        }

        this._updateSize();
    }

    _updateThemeToggleIcon() {
        if (!this._themeToggleButton) return;
        
        let iconName, tooltip;
        if (this._themeMode === 'dark') {
            iconName = 'weather-clear-night-symbolic';
            tooltip = _('Dark mode (click for Light)');
        } else if (this._themeMode === 'light') {
            iconName = 'weather-clear-symbolic';
            tooltip = _('Light mode (click for Auto)');
        } else {
            iconName = 'emblem-system-symbolic';
            tooltip = _('Follow system (click for Dark)');
        }
        
        this._themeToggleButton.set_child(new St.Icon({ 
            icon_name: iconName, 
            icon_size: 16 
        }));
        this._themeToggleButton._tooltipText = tooltip;
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
            icon_size: 14
        });
        this._header.add_child(headerIcon);

        const title = new St.Label({
            text: 'ClipMaster',
            style_class: 'clipmaster-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._header.add_child(title);

        // Dark/Light/Auto toggle button
        this._themeToggleButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            can_focus: false,
            track_hover: true
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

        // Clear all button (keeps favorites)
        this._clearAllButton = new St.Button({
            style_class: 'clipmaster-toggle-button',
            child: new St.Icon({ icon_name: 'edit-clear-all-symbolic', icon_size: 16 }),
            can_focus: false,
            track_hover: true
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
            track_hover: true
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
    }

    _onButtonHover(button) {
        if (button.hover && button._tooltipText && this._tooltip) {
            this._tooltip.text = button._tooltipText;
            
            // Get button position in screen coordinates
            let [bx, by] = button.get_transformed_position();
            let [bw, bh] = button.get_size();
            
            // Position tooltip below button, centered
            let tx = bx + bw / 2;
            let ty = by + bh + 6;
            
            // Adjust after showing so we know the tooltip size
            this._tooltip.set_position(tx, ty);
            this._tooltip.show();
            
            // Re-center after size is known
            tx = bx + (bw - this._tooltip.width) / 2;
            if (tx < 0) tx = 4;
            this._tooltip.set_position(tx, ty);
            
        } else if (this._tooltip) {
            this._tooltip.hide();
        }
    }

    /**
     * Check if the panel (Dash to Panel) is currently visible
     * @returns {boolean} True if panel is visible, false if hidden
     */
    _isPanelVisible() {
        try {
            // Check if this button (indicator) is visible
            if (!this.visible || !this.get_parent()) {
                return false;
            }
            
            // Check if panel is visible
            if (Main.panel && Main.panel.visible !== undefined) {
                if (!Main.panel.visible) {
                    return false;
                }
            }
            
            // Check button position - if it's off-screen or at (0,0), panel is likely hidden
            const [x, y] = this.get_transformed_position();
            const [w, h] = this.get_size();
            
            // If button is at (0,0) or has zero size, panel is likely hidden
            if ((x === 0 && y === 0 && w === 0 && h === 0) || w === 0 || h === 0) {
                return false;
            }
            
            // Check if button is actually on screen
            const monitor = Main.layoutManager.primaryMonitor;
            if (x < monitor.x || y < monitor.y || 
                x > monitor.x + monitor.width || y > monitor.y + monitor.height) {
                return false;
            }
            
            return true;
        } catch (e) {
            debugLog(`Error checking panel visibility: ${e.message}`);
            // Default to visible if we can't determine
            return true;
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
                    debugLog(`_searchEntry Down: oldIndex=${oldIndex}, newIndex=${this._selectedIndex}, items.length=${this._items.length}, itemRows.length=${this._itemRows?.length || 0}`);
                    this._updateSelection();
                    // Scrolling is now handled automatically by key-focus-in event
                    // Focus is transferred to the selected row in _updateSelection()
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
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

        // Add "All" button at the beginning to show all items (clear list filter)
        this._listsAllButton = new St.Button({
            style_class: 'clipmaster-list-tag',
            can_focus: false,
            track_hover: true
        });
        const allLabel = new St.Label({
            text: _('All'),
            style_class: 'clipmaster-list-tag-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        this._listsAllButton.set_child(allLabel);
        this._listsAllButton.set_style('background-color: #6c7086; padding: 2px 8px;');
        this._listsAllButton.connect('clicked', () => {
            // Clear list filter, keep current type filter
            this._currentListId = null;
            this._loadItems();
            // Update button states
            if (this._listButtons) {
                Object.values(this._listButtons).forEach(b => b.remove_style_class_name('active'));
            }
            this._listsAllButton.add_style_class_name('active');
        });
        this._listsBar.add_child(this._listsAllButton);

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
            this._showAddListPanel(headerRow);
        });
        headerRow.add_child(addListBtn);

        this._itemsBox.add_child(headerRow);
        this._manageHeaderRow = headerRow;

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
            this._showEditListPanel(list, row);
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

    _closeListFormPanel() {
        if (this._listFormPanel) {
            this._listFormPanel.destroy();
            this._listFormPanel = null;
            this._listFormPanelRow = null;
        }
    }

    _showAddListPanel(afterRow) {
        // Toggle: if already open, close it
        if (this._listFormPanelRow === afterRow && this._listFormPanel) {
            this._closeListFormPanel();
            return;
        }

        this._closeListFormPanel();

        // Create form panel
        this._listFormPanel = new St.BoxLayout({
            style_class: 'clipmaster-context-panel',
            vertical: true,
            x_expand: true,
            reactive: true
        });

        // Name row
        const nameRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const nameLabel = new St.Label({
            text: _('Name:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        nameRow.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            hint_text: _('List name...'),
            x_expand: true,
            can_focus: true
        });
        nameRow.add_child(nameEntry);
        this._listFormPanel.add_child(nameRow);

        // Color row
        const colorRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        colorRow.add_child(colorLabel);

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
        this._listFormPanel.add_child(colorRow);

        // Buttons row
        const btnRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const spacer = new St.Widget({ x_expand: true });
        btnRow.add_child(spacer);

        const cancelBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Cancel'),
            can_focus: false
        });
        cancelBtn.connect('clicked', () => this._closeListFormPanel());
        btnRow.add_child(cancelBtn);

        const createBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Create'),
            can_focus: false
        });
        createBtn.set_style('margin-left: 8px;');
        createBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (name) {
                this._database.createList(name, selectedColor);
                this._buildListsBar();
                this._closeListFormPanel();
                this._loadItems();
            }
        });
        btnRow.add_child(createBtn);
        this._listFormPanel.add_child(btnRow);

        // Insert after the header row (shows at top of list)
        this._itemsBox.insert_child_above(this._listFormPanel, afterRow);
        this._listFormPanelRow = afterRow;

        // Focus on name entry
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            nameEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _showEditListPanel(list, afterRow) {
        // Toggle: if clicking same row that's already open, close it
        if (this._listFormPanelRow === afterRow && this._listFormPanel) {
            this._closeListFormPanel();
            return;
        }

        this._closeListFormPanel();

        // Create form panel
        this._listFormPanel = new St.BoxLayout({
            style_class: 'clipmaster-context-panel',
            vertical: true,
            x_expand: true,
            reactive: true
        });

        // Name row
        const nameRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const nameLabel = new St.Label({
            text: _('Name:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        nameRow.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            text: list.name,
            x_expand: true,
            can_focus: true
        });
        nameRow.add_child(nameEntry);
        this._listFormPanel.add_child(nameRow);

        // Color row
        const colorRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        colorRow.add_child(colorLabel);

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
        this._listFormPanel.add_child(colorRow);

        // Buttons row
        const btnRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true
        });
        const spacer = new St.Widget({ x_expand: true });
        btnRow.add_child(spacer);

        const cancelBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Cancel'),
            can_focus: false
        });
        cancelBtn.connect('clicked', () => this._closeListFormPanel());
        btnRow.add_child(cancelBtn);

        const saveBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Save'),
            can_focus: false
        });
        saveBtn.set_style('margin-left: 8px;');
        saveBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (name) {
                this._database.updateList(list.id, { name, color: selectedColor });
                this._buildListsBar();
                this._closeListFormPanel();
                this._loadItems();
            }
        });
        btnRow.add_child(saveBtn);
        this._listFormPanel.add_child(btnRow);

        // Insert above the clicked row (shows below visually in vertical layout)
        this._itemsBox.insert_child_above(this._listFormPanel, afterRow);
        this._listFormPanelRow = afterRow;

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
        
        // Cleanup duplicates on first open
        if (!this._duplicatesCleanedUp && this._database) {
            const removed = this._database.cleanupDuplicates();
            if (removed > 0) {
                debugLog(`Cleaned up ${removed} duplicate items`);
            }
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
        if (this._listsAllButton) {
            this._listsAllButton.remove_style_class_name('active');
        }
        
        this._textButton.add_style_class_name('active');

        this._loadItems();

        this._timeoutManager.add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (this.menu.isOpen) {
                this._searchEntry.grab_key_focus();
            }
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
                debugLog(`Menu position incorrect or panel hidden (visible: ${isPanelVisible}), fixing...`);
                // Position at top-right, similar to where Dash to Panel (top) would be
                const menuWidth = this.menu.actor.width || 450;
                const menuHeight = this.menu.actor.height || 550;
                const x = monitor.x + monitor.width - menuWidth - 20;
                // Adjust Y based on panel visibility
                const y = isPanelVisible ? monitor.y + 5 : monitor.y + 2;
                
                this.menu.actor.set_position(x, y);
                debugLog(`Menu repositioned to: ${x}, ${y} (panel visible: ${isPanelVisible})`);
            }
            
            return GLib.SOURCE_REMOVE;
        }, 'fix-menu-position');
    }

    _clearAllHoverStates() {
        if (this._itemsBox) {
            const children = this._itemsBox.get_children();
            children.forEach(child => {
                if (child.hover !== undefined) {
                    child.hover = false;
                }
                // Remove any hover-related style classes
                child.remove_style_pseudo_class('hover');
            });
        }
    }

    _clearSelection() {
        // Clear selected state when mouse leaves menu
        this._selectedIndex = -1;
        this._updateSelection();
    }

    _onMenuClosed() {
        debugLog('Menu closed');
        this._closeContextPanel();
        this._closeQrPanel();
        this._closeListFormPanel();
        if (this._tooltip) {
            this._tooltip.visible = false;
        }
        
        // Clear hover state from all items when menu closes
        this._clearAllHoverStates();
        // Clear selected state (from keyboard navigation) when menu closes
        this._clearSelection();
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
         this._urlButton, this._codeButton].forEach(b => {
            if (b) b.remove_style_class_name('active');
        });

        // Clear list button states
        if (this._listButtons) {
            Object.values(this._listButtons).forEach(b => {
                if (b) b.remove_style_class_name('active');
            });
        }
        if (this._listsAllButton) {
            this._listsAllButton.remove_style_class_name('active');
        }

        // Clear manage button state (old gear button)
        if (this._manageListsBtn) {
            this._manageListsBtn.remove_style_class_name('active');
        }

        if (manageMode) {
            // Manage lists mode
            if (this._manageListsBtn) {
                this._manageListsBtn.add_style_class_name('active');
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
        this._itemRows = []; // Clear row references

        // If in manage mode, show list management UI
        if (this._manageMode) {
            this._loadManageListsView();
            return;
        }

        const limit = this._settings.get_int('items-per-page') || 50;
        const textIncludeUrlCode = this._settings.get_boolean('text-include-url-code');
        const options = {
            limit: limit,
            search: this._searchQuery || null,
            listId: this._currentListId,
            type: this._currentType,
            textIncludeUrlCode: textIncludeUrlCode,
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

        // Clear row references
        this._itemRows = [];
        
        this._items.forEach((item, index) => {
            const row = this._createItemRow(item, index);
            this._itemsBox.add_child(row);
            // Store row reference by index for direct access
            this._itemRows[index] = row;
            debugLog(`_loadItems: index=${index}, row._index=${row._index}, itemRows.length=${this._itemRows.length}`);
        });
        
        // Verify itemRows array is continuous
        const missingIndices = [];
        for (let i = 0; i < this._items.length; i++) {
            if (!this._itemRows[i]) {
                missingIndices.push(i);
            } else if (this._itemRows[i]._index !== i) {
                debugLog(`_loadItems WARNING: itemRows[${i}]._index=${this._itemRows[i]._index}, expected ${i}`);
            }
        }
        if (missingIndices.length > 0) {
            debugLog(`_loadItems WARNING: Missing indices in itemRows: ${missingIndices.join(', ')}`);
        }
        debugLog(`_loadItems: Total items=${this._items.length}, itemRows.length=${this._itemRows.length}, itemRows indices: ${this._itemRows.map((r, i) => r ? `${i}:${r._index}` : `${i}:null`).join(', ')}`);

        // Only update selection if there's an active selection (from keyboard navigation)
        if (this._selectedIndex >= 0) {
            this._updateSelection();
        }
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

        // Connect key-focus-in event to auto-scroll when item gets focus
        // This is the Clipboard Indicator way: when focus moves to an item, scroll to make it visible
        row.connect('key-focus-in', () => {
            debugLog(`key-focus-in triggered for row index ${row._index}`);
            if (this._scrollView && row && !row.is_destroyed()) {
                try {
                    AnimationUtils.ensureActorVisibleInScrollView(this._scrollView, row);
                    debugLog(`key-focus-in: scrolled to row index ${row._index}`);
                } catch (e) {
                    debugLog(`key-focus-in scroll error: ${e.message}`);
                }
            }
        });

        // Apply list color as background if item belongs to a list
        let listTextColor = null;
        if (item.listId) {
            const list = this._database.getListById(item.listId);
            if (list && list.color) {
                // Fixed color-to-text mapping for readability
                const textColorMap = {
                    '#e74c3c': '#ffffff', // red -> white
                    '#e67e22': '#ffffff', // orange -> white
                    '#f1c40f': '#1a1a1a', // yellow -> dark
                    '#2ecc71': '#1a1a1a', // green -> dark
                    '#3498db': '#ffffff', // blue -> white
                    '#9b59b6': '#ffffff', // purple -> white
                    '#95a5a6': '#ffffff'  // gray -> white
                };
                listTextColor = textColorMap[list.color] || '#ffffff';
                row.set_style(`background-color: ${list.color};`);
                row._listColor = list.color;
                row._textColor = listTextColor;
            }
        }

        // Click handler
        row.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                // Paste directly without setting selected state
                this._pasteItem(item);
                return Clutter.EVENT_STOP;
            } else if (event.get_button() === 3) {
                // Removed: no longer set selected on right-click
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
            // Removed: no longer set selected on mouse hover
        });

        // Number label (show for all items)
        const numLabel = new St.Label({
            text: (index + 1).toString(),
            style_class: 'clipmaster-item-number'
        });
        if (listTextColor) numLabel.set_style(`color: ${listTextColor};`);
        row.add_child(numLabel);

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
            if (listTextColor) titleLabel.set_style(`color: ${listTextColor};`);
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
        if (listTextColor) previewLabel.set_style(`color: ${listTextColor};`);
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
            if (listTextColor) timeLabel.set_style(`color: ${listTextColor};`);
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
            const qrIcon = new St.Icon({ icon_name: 'view-grid-symbolic', icon_size: iconSize });
            if (listTextColor) qrIcon.set_style(`color: ${listTextColor};`);
            qrButton.set_child(qrIcon);
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

        // Type label [Text], [Code], etc.
        const typeLabel = new St.Label({
            text: `[${this._getTypeLabel(item.type)}]`,
            style_class: 'clipmaster-item-type-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        if (listTextColor) typeLabel.set_style(`color: ${listTextColor};`);
        bottomRow.add_child(typeLabel);

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
        // Don't apply listTextColor to fav icon - let CSS handle it for better contrast
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
        const deleteIcon = new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: iconSize });
        // Don't apply listTextColor to delete icon - let CSS handle it for better contrast
        deleteButton.set_child(deleteIcon);
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

    _getTypeLabel(type) {
        const labels = {
            [ItemType.TEXT]: 'Text',
            [ItemType.HTML]: 'HTML',
            [ItemType.IMAGE]: 'Image',
            [ItemType.FILE]: 'File',
            [ItemType.URL]: 'URL',
            [ItemType.COLOR]: 'Color',
            [ItemType.CODE]: 'Code'
        };
        return labels[type] || 'Text';
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
        
        // Clear all selections first
        if (this._itemRows) {
            this._itemRows.forEach((row) => {
                if (row) {
                    row.remove_style_class_name('selected');
                }
            });
        }
        
        // Then, select the item at _selectedIndex if valid
        if (this._selectedIndex >= 0 && this._itemRows && this._itemRows[this._selectedIndex]) {
            const selectedRow = this._itemRows[this._selectedIndex];
            selectedRow.add_style_class_name('selected');
            
            // Transfer focus to the selected row (Clipboard Indicator way)
            // This will trigger key-focus-in event, which will auto-scroll
            // Also directly call ensureActorVisibleInScrollView as a fallback
            // Use multiple delays to ensure layout is complete and scrolling works
            const scrollToRow = () => {
                try {
                    if (!selectedRow || selectedRow.is_destroyed() || !this._scrollView) {
                        debugLog(`_updateSelection: scrollToRow - invalid state`);
                        return;
                    }
                    
                    // 确保布局完成
                    this._scrollView.queue_relayout();
                    this._itemsBox.queue_relayout();
                    selectedRow.queue_relayout();
                    
                    debugLog(`_updateSelection: scrolling to row ${this._selectedIndex}, scrollView.height=${this._scrollView.height}, row.height=${selectedRow.height}`);
                    
                    // 方法1: 使用 AnimationUtils (Clipboard Indicator 方式)
                    if (AnimationUtils && typeof AnimationUtils.ensureActorVisibleInScrollView === 'function') {
                        try {
                            AnimationUtils.ensureActorVisibleInScrollView(this._scrollView, selectedRow);
                            debugLog(`_updateSelection: called AnimationUtils.ensureActorVisibleInScrollView`);
                        } catch (e) {
                            debugLog(`_updateSelection: AnimationUtils error: ${e.message}`);
                        }
                    }
                    
                    // 方法2: 使用标准的 get_vadjustment() 方法
                    let adj = null;
                    try {
                        // 尝试使用标准方法
                        if (typeof this._scrollView.get_vadjustment === 'function') {
                            adj = this._scrollView.get_vadjustment();
                            debugLog(`_updateSelection: got adjustment via get_vadjustment()`);
                        } else if (this._scrollView.vscroll?.adjustment) {
                            adj = this._scrollView.vscroll.adjustment;
                            debugLog(`_updateSelection: got adjustment via vscroll.adjustment`);
                        }
                    } catch (e) {
                        debugLog(`_updateSelection: error getting adjustment: ${e.message}`);
                    }
                    
                    if (adj) {
                        // 直接使用累积高度计算位置（更可靠的方法）
                        let itemY = 0;
                        for (let i = 0; i < this._selectedIndex; i++) {
                            if (this._itemRows[i] && this._itemRows[i].height > 0) {
                                itemY += this._itemRows[i].height;
                            }
                        }
                        
                        const itemHeight = selectedRow.height || 50;
                        const itemBottom = itemY + itemHeight;
                        const scrollViewHeight = this._scrollView.height || 300;
                        const currentScroll = adj.value;
                        const visibleTop = currentScroll;
                        const visibleBottom = currentScroll + scrollViewHeight;
                        
                        debugLog(`_updateSelection: calc - itemY=${itemY}, itemBottom=${itemBottom}, visibleTop=${visibleTop}, visibleBottom=${visibleBottom}, adj.value=${adj.value}, adj.upper=${adj.upper}, adj.page_size=${adj.page_size}, adj.lower=${adj.lower}`);
                        
                        // 处理向上和向下滚动
                        if (itemY < visibleTop || itemBottom > visibleBottom) {
                            let newScroll = currentScroll;
                            if (itemY < visibleTop) {
                                // 向上滚动：项目在可见区域上方
                                newScroll = Math.max(adj.lower || 0, itemY);
                            } else if (itemBottom > visibleBottom) {
                                // 向下滚动：项目在可见区域下方
                                newScroll = Math.max(adj.lower || 0, itemBottom - scrollViewHeight);
                            }
                            
                            // 确保 newScroll 在有效范围内
                            const maxScroll = Math.max(adj.lower || 0, adj.upper - adj.page_size);
                            newScroll = Math.min(newScroll, maxScroll);
                            newScroll = Math.max(adj.lower || 0, newScroll);
                            
                            debugLog(`_updateSelection: setting adj.value from ${adj.value} to ${newScroll}`);
                            adj.set_value(newScroll);
                            // 触发 changed 事件以确保 UI 更新
                            adj.emit('changed');
                            debugLog(`_updateSelection: adj.value after set_value: ${adj.value}`);
                        } else {
                            debugLog(`_updateSelection: item already visible, no scroll needed`);
                        }
                    } else {
                        debugLog(`_updateSelection: no adjustment available`);
                    }
                } catch (e) {
                    debugLog(`_updateSelection: scroll error: ${e.message}, stack: ${e.stack}`);
                }
            };
            
            // Call immediately
            scrollToRow();
            
            // Also call after a delay to ensure layout is complete
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                scrollToRow();
                
                // Try to transfer focus (this will trigger key-focus-in as a bonus)
                try {
                    if (selectedRow && !selectedRow.is_destroyed()) {
                        const stage = global.stage;
                        const currentFocus = stage.get_key_focus();
                        if (currentFocus !== selectedRow) {
                            selectedRow.grab_key_focus();
                            debugLog(`_updateSelection: transferred focus to row ${this._selectedIndex}`);
                        }
                    }
                } catch (e) {
                    debugLog(`_updateSelection: focus error: ${e.message}`);
                }
                
                return GLib.SOURCE_REMOVE;
            });
            
            // Call again after a longer delay as a fallback
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                scrollToRow();
                return GLib.SOURCE_REMOVE;
            });
            
            debugLog(`_updateSelection: selectedIndex=${this._selectedIndex}, row._index=${selectedRow._index}`);
        } else if (this._selectedIndex >= 0) {
            debugLog(`_updateSelection: selectedIndex=${this._selectedIndex} but row not found, itemRows.length=${this._itemRows?.length || 0}`);
        }
    }

    _scrollToSelected() {
        if (this._selectedIndex < 0 || !this._itemRows || !this._itemRows[this._selectedIndex]) {
            return;
        }
        
        const selected = this._itemRows[this._selectedIndex];
        if (!selected || !this._scrollView) {
            return;
        }
        
        const adj = this._scrollView.vscroll.adjustment;
        if (!adj) {
            return;
        }
        
        // Use a timeout to ensure layout is complete before calculating positions
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
            if (!selected || !this._scrollView || !this._itemRows) {
                return GLib.SOURCE_REMOVE;
            }
            
            // Calculate cumulative Y position by summing heights of all items before selected
            let itemTop = 0;
            for (let i = 0; i < this._selectedIndex; i++) {
                if (this._itemRows[i] && this._itemRows[i].height > 0) {
                    itemTop += this._itemRows[i].height;
                }
            }
            
            const itemHeight = selected.height;
            const itemBottom = itemTop + itemHeight;
            const scrollViewHeight = this._scrollView.height;
            const currentScroll = adj.value;
            const visibleTop = currentScroll;
            const visibleBottom = currentScroll + scrollViewHeight;
            
            // Check if item is above visible area
            if (itemTop < visibleTop) {
                // Scroll up to show the item at the top
                adj.value = Math.max(0, itemTop);
            }
            // Check if item is below visible area
            else if (itemBottom > visibleBottom) {
                // Scroll down to show the item at the bottom
                const newScroll = itemBottom - scrollViewHeight;
                adj.value = Math.max(0, newScroll);
            }
            
            // Ensure we don't scroll beyond the content
            const maxScroll = Math.max(0, adj.upper - scrollViewHeight);
            if (adj.value > maxScroll) {
                adj.value = maxScroll;
            }
            
            return GLib.SOURCE_REMOVE;
        });
    }

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
                        debugLog(`Auto-paste failed: ${e.message}`);
                    }
                    return GLib.SOURCE_REMOVE;
                }, 'paste-on-select');
            }
        }
    }

    _pasteSelected(fromHover = false) {
        if (this._selectedIndex < 0 || this._selectedIndex >= this._items.length) {
            return;
        }

        const item = this._items[this._selectedIndex];
        this._pasteItem(item, fromHover);
    }

    _onKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        
        // For arrow keys, always process them here (navigation mode)
        // This ensures navigation works even if focus hasn't fully transferred from search entry
        const isArrowKey = symbol === Clutter.KEY_Up || symbol === Clutter.KEY_KP_Up ||
                          symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down;
        
        // For non-arrow keys, check if search entry has focus
        if (!isArrowKey) {
            const stage = global.stage;
            const keyFocus = stage.get_key_focus();
            if (keyFocus === this._searchEntry || 
                keyFocus === this._searchEntry.clutter_text ||
                actor === this._searchEntry ||
                (this._searchEntry.clutter_text && actor === this._searchEntry.clutter_text)) {
                // Let search entry handle non-arrow keys
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
            
            if (this._selectedIndex < 0) {
                // First time: select last item
                this._selectedIndex = this._items.length - 1;
            } else if (this._selectedIndex > 0) {
                this._selectedIndex--;
            } else {
                // Already at first item, wrap to last
                this._selectedIndex = this._items.length - 1;
            }
            this._updateSelection();
            // Scrolling is now handled automatically by key-focus-in event
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_KP_Down) {
            if (this._items.length === 0) return Clutter.EVENT_STOP;
            
            const oldIndex = this._selectedIndex;
            if (this._selectedIndex < 0) {
                // First time: select first item
                this._selectedIndex = 0;
            } else if (this._selectedIndex < this._items.length - 1) {
                this._selectedIndex++;
            } else {
                // Already at last item, wrap to first
                this._selectedIndex = 0;
            }
            debugLog(`_onKeyPress Down: oldIndex=${oldIndex}, newIndex=${this._selectedIndex}, items.length=${this._items.length}, itemRows.length=${this._itemRows?.length || 0}`);
            this._updateSelection();
            // Scrolling is now handled automatically by key-focus-in event
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
        }

        if (this._keyboard) {
            this._keyboard.destroy();
            this._keyboard = null;
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
