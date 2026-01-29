/*
 * ClipMaster Custom - Context Panels
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ItemType } from '../Util/Constants.js';
import { QrCodeGenerator, QrEcc } from '../Util/QrCodeGenerator.js';
import { tr as _ } from '../Util/Translations.js';

/**
 * Context Panels Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const ContextPanelsMixin = {
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
            reactive: true,
        });

        // Edit Title Row
        const titleRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true,
        });

        const titleLabel = new St.Label({
            text: _('Title:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleRow.add_child(titleLabel);

        const titleEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            text: item.title || '',
            hint_text: _('Enter title...'),
            x_expand: true,
            can_focus: true,
        });
        titleRow.add_child(titleEntry);

        const saveTitleBtn = new St.Button({
            style_class: 'clipmaster-context-save-button',
            child: new St.Icon({ icon_name: 'object-select-symbolic', icon_size: 14 }),
            can_focus: false,
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
                x_expand: true,
            });

            const contentLabel = new St.Label({
                text: _('Content:'),
                style_class: 'clipmaster-context-label',
                y_align: Clutter.ActorAlign.START,
            });
            contentRow.add_child(contentLabel);

            const contentEntry = new St.Entry({
                style_class: 'clipmaster-context-entry clipmaster-context-entry-content',
                text: item.content || item.plainText || '',
                x_expand: true,
                y_expand: true,
                can_focus: true,
            });
            // Make content entry multiline (textarea-like)
            const contentText = contentEntry.get_clutter_text();
            contentText.set_single_line_mode(false);
            contentText.set_line_wrap(true);
            contentEntry.set_clip_to_allocation(true);
            contentText.set_clip_to_allocation(true);
            contentText.connect('key-press-event', (actor, event) => {
                const symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                    actor.insert_text('\n', -1);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            contentRow.add_child(contentEntry);

            const saveContentBtn = new St.Button({
                style_class: 'clipmaster-context-save-button',
                child: new St.Icon({ icon_name: 'object-select-symbolic', icon_size: 14 }),
                can_focus: false,
            });
            saveContentBtn.y_align = Clutter.ActorAlign.START;
            saveContentBtn.connect('clicked', () => {
                const newContent = contentEntry.get_text();
                this._database.updateItem(item.id, {
                    content: newContent,
                    plainText: newContent,
                    preview: newContent.substring(0, 200),
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
                x_expand: true,
            });

            const listLabel = new St.Label({
                text: _('Add to List:'),
                style_class: 'clipmaster-context-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            listRow.add_child(listLabel);

            lists.forEach(list => {
                const listBtn = new St.Button({
                    style_class: 'clipmaster-list-select-button',
                    can_focus: false,
                });

                const btnBox = new St.BoxLayout({ vertical: false });
                if (list.color) {
                    const colorDot = new St.Widget({
                        style: `background-color: ${list.color}; border-radius: 50%;`,
                        width: 8,
                        height: 8,
                    });
                    btnBox.add_child(colorDot);
                }

                const btnLabel = new St.Label({
                    text: list.name,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                btnBox.add_child(btnLabel);
                listBtn.set_child(btnBox);

                if (item.listId === list.id)
                    listBtn.add_style_class_name('selected');

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
        if (rowIndex >= 0)
            this._itemsBox.insert_child_above(this._contextPanel, row);

        this._contextPanelRow = row;

        // Focus title entry
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            if (this._contextPanel)
                titleEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    },

    _closeContextPanel() {
        if (!this._contextPanel) return;
        this._contextPanel.destroy();
        this._contextPanel = null;
        this._contextPanelRow = null;
    },

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
            reactive: true,
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
                x_align: Clutter.ActorAlign.CENTER,
            });

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (!modules[y][x])
                        continue;
                    const cell = new St.Widget({
                        style: 'background-color: #000000;',
                        width: cellSize,
                        height: cellSize,
                        x: (x + 2) * cellSize,
                        y: (y + 2) * cellSize,
                    });
                    qrContainer.add_child(cell);
                }
            }

            const centerBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER });
            centerBox.add_child(qrContainer);
            this._qrPanel.add_child(centerBox);

            const previewText = text.length > 50 ? `${text.substring(0, 50)}...` : text;
            const previewLabel = new St.Label({
                text: previewText,
                style_class: 'clipmaster-qr-preview',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._qrPanel.add_child(previewLabel);
        } catch (e) {
            const errorLabel = new St.Label({
                text: _('Failed to generate QR code'),
                style_class: 'clipmaster-qr-error',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._qrPanel.add_child(errorLabel);
        }

        const rowIndex = this._itemsBox.get_children().indexOf(row);
        if (rowIndex >= 0)
            this._itemsBox.insert_child_above(this._qrPanel, row);

        this._qrPanelRow = row;
    },

    _closeQrPanel() {
        if (!this._qrPanel) return;
        this._qrPanel.destroy();
        this._qrPanel = null;
        this._qrPanelRow = null;
    },
};
