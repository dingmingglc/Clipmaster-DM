/*
 * ClipMaster DM - GNOME Shell Extension
 * Based on ClipMaster, modified for Dash to Panel compatibility
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { SignalManager, ValidationUtils } from './src/Util/Utils.js';
import { setDebugMode, debugLog } from './src/Util/Constants.js';
import { ClipboardDatabase } from './src/Manager/Database.js';
import { ClipboardMonitor } from './src/Manager/ClipboardMonitor.js';
import { ClipMasterIndicator } from './src/UI/Indicator.js';
import { initTranslations } from './src/Util/Translations.js';


export default class ClipMasterCustomExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._extensionPath = this.path;
        this._signalManager = new SignalManager();

        // Initialize translations
        initTranslations(this._settings);

        setDebugMode(this._settings.get_boolean('debug-mode'));
        this._signalManager.connect(
            this._settings,
            'changed::debug-mode',
            () => setDebugMode(this._settings.get_boolean('debug-mode')),
            'debug-mode-changed'
        );

        const storagePath = this._settings.get_string('storage-path');
        this._database = new ClipboardDatabase(
            storagePath || null,
            this._settings,
            (title, message) => Main.notify(title, message)
        );

        // Initialize database asynchronously
        this._database.init().catch(e => {
            console.error(`ClipMaster DM: Database initialization error: ${e.message}`);
        });

        this._monitor = new ClipboardMonitor(
            this._settings,
            this._database,
            this._onNewItem.bind(this)
        );
        this._monitor.start();

        // Create indicator (contains the full UI as standard PopupMenu)
        if (this._settings.get_boolean('show-indicator')) {
            this._indicator = new ClipMasterIndicator(this);
            Main.panel.addToStatusArea('clipmaster-dm', this._indicator);
        }

        this._bindShortcuts();

        // Watch for show-indicator setting changes
        this._signalManager.connect(
            this._settings,
            'changed::show-indicator',
            () => this._updateIndicatorVisibility(),
            'show-indicator-changed'
        );

        console.log('ClipMaster DM extension enabled');
    }

    disable() {
        this._unbindShortcuts();

        if (this._monitor) {
            this._monitor.stop();
            this._monitor = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._database) {
            this._database.destroy();
            this._database = null;
        }

        if (this._signalManager) {
            this._signalManager.disconnectAll();
            this._signalManager = null;
        }

        this._settings = null;

        console.log('ClipMaster DM extension disabled');
    }

    _updateIndicatorVisibility() {
        const showIndicator = this._settings.get_boolean('show-indicator');
        
        if (showIndicator && !this._indicator) {
            this._indicator = new ClipMasterIndicator(this);
            Main.panel.addToStatusArea('clipmaster-dm', this._indicator);
        } else if (!showIndicator && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _bindShortcuts() {
        Main.wm.addKeybinding(
            'toggle-popup',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this.togglePopup()
        );

        Main.wm.addKeybinding(
            'paste-as-plain',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this.pasteAsPlainText()
        );
    }

    _unbindShortcuts() {
        Main.wm.removeKeybinding('toggle-popup');
        Main.wm.removeKeybinding('paste-as-plain');
    }

    _onNewItem(item) {
        debugLog(`New item received: ${item?.id}`);

        // Safety check - extension might be disabled during async callback
        if (!this._settings) {
            debugLog('_onNewItem: settings is null, skipping');
            return;
        }

        // Refresh indicator if visible and menu is open
        if (this._indicator) {
            this._indicator.refresh();
        }

        if (this._settings.get_boolean('notification-on-copy')) {
            Main.notify('ClipMaster', _('New item added to clipboard'));
        }
    }

    showPopup() {
        if (this._indicator) {
            this._indicator.menu.open();
            debugLog('Popup opened via indicator menu');
        } else {
            debugLog('showPopup: No indicator available');
        }
    }

    hidePopup() {
        if (this._indicator) {
            this._indicator.menu.close();
            debugLog('Popup closed via indicator menu');
        }
    }

    togglePopup() {
        if (this._indicator) {
            this._indicator.menu.toggle();
            debugLog(`Popup toggled: ${this._indicator.menu.isOpen}`);
        } else {
            debugLog('togglePopup: No indicator available');
        }
    }

    pasteAsPlainText() {
        const items = this._database.getItems({ limit: 1 });
        if (items.length > 0) {
            this._monitor.copyToClipboard(items[0].plainText, true);
        }
    }
}
