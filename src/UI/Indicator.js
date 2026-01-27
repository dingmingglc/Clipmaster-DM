/*
 * ClipMaster Custom - Panel Indicator with Full UI
 * Uses standard PopupMenu for Dash to Panel compatibility
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { debugLog } from '../Util/Constants.js';
import { SignalManager, TimeoutManager } from '../Util/Utils.js';
import { Keyboard } from '../Util/Keyboard.js';

// Mixin imports for code organization
import { UIUtilsMixin } from './UIUtils.js';
import { ThemeManagerMixin } from './ThemeManager.js';
import { PasteHandlerMixin } from './PasteHandler.js';
import { ContextPanelsMixin } from './ContextPanels.js';
import { NavigationHandlerMixin } from './NavigationHandler.js';
import { MenuLifecycleMixin } from './MenuLifecycle.js';
import { ListManagerMixin } from './ListManager.js';
import { ItemRendererMixin } from './ItemRenderer.js';
import { UIComponentsMixin } from './UIComponents.js';

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

// Apply mixins once (prototype-level), so methods exist before _buildUI()
Object.assign(
    ClipMasterIndicator.prototype,
    UIUtilsMixin,
    ThemeManagerMixin,
    PasteHandlerMixin,
    ContextPanelsMixin,
    NavigationHandlerMixin,
    MenuLifecycleMixin,
    ListManagerMixin,
    ItemRendererMixin,
    UIComponentsMixin
);
