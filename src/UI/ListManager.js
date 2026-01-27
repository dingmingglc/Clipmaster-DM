/*
 * ClipMaster Custom - ListManager
 * Extracted from Indicator.js for better code organization
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { tr as _ } from '../Util/Translations.js';


/**
 * ListManager Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const ListManagerMixin = {
    _loadManageListsView() {
        // Header row with title and add button
        const headerRow = new St.BoxLayout({
            style_class: 'clipmaster-manage-header',
            x_expand: true,
        });

        const headerLabel = new St.Label({
            text: _('Manage Lists'),
            style_class: 'clipmaster-lists-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        headerRow.add_child(headerLabel);

        const addListBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('+ Add'),
            can_focus: false,
        });
        addListBtn.connect('clicked', () => this._showAddListPanel(headerRow));
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
                margin_top: 20,
            });
            this._itemsBox.add_child(emptyLabel);
        } else {
            lists.forEach(list => {
                const listRow = this._createManageListRow(list);
                this._itemsBox.add_child(listRow);
            });
        }
    },

    _createManageListRow(list) {
        const row = new St.BoxLayout({
            style_class: 'clipmaster-manage-list-row',
            x_expand: true,
            reactive: true,
            track_hover: true,
        });

        // Color indicator
        const colorDot = new St.Widget({
            style: `background-color: ${list.color || '#6c7086'}; border-radius: 4px;`,
            width: 16,
            height: 16,
        });
        row.add_child(colorDot);

        // List name
        const listLabel = new St.Label({
            text: list.name,
            style_class: 'clipmaster-manage-list-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(listLabel);

        // Item count
        const itemCount = this._database.getItems({ listId: list.id }).length;
        const countLabel = new St.Label({
            text: `${itemCount} items`,
            style_class: 'clipmaster-manage-list-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(countLabel);

        // Edit button
        const editBtn = new St.Button({
            style_class: 'clipmaster-action-button',
            child: new St.Icon({ icon_name: 'document-edit-symbolic', icon_size: 14 }),
            can_focus: false,
        });
        editBtn._tooltipText = _('Edit');
        editBtn.connect('notify::hover', (btn) => this._onButtonHover(btn));
        editBtn.connect('clicked', () => this._showEditListPanel(list, row));
        row.add_child(editBtn);

        // Delete button
        const deleteBtn = new St.Button({
            style_class: 'clipmaster-action-button clipmaster-delete-button',
            child: new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: 14 }),
            can_focus: false,
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
    },

    _closeListFormPanel() {
        if (!this._listFormPanel) return;
        this._listFormPanel.destroy();
        this._listFormPanel = null;
        this._listFormPanelRow = null;
    },

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
            reactive: true,
        });

        // Name row
        const nameRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true,
        });
        const nameLabel = new St.Label({
            text: _('Name:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        nameRow.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            hint_text: _('List name...'),
            x_expand: true,
            can_focus: true,
        });
        nameRow.add_child(nameEntry);
        this._listFormPanel.add_child(nameRow);

        // Color row
        const colorRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true,
        });
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        colorRow.add_child(colorLabel);

        const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#95a5a6'];
        let selectedColor = colors[0];

        colors.forEach(color => {
            const colorBtn = new St.Button({
                style_class: 'clipmaster-color-button',
                style: `background-color: ${color};`,
                can_focus: false,
            });
            if (color === selectedColor)
                colorBtn.add_style_class_name('selected');

            colorBtn.connect('clicked', () => {
                colorRow.get_children().forEach(c => {
                    if (c instanceof St.Button)
                        c.remove_style_class_name('selected');
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
            x_expand: true,
        });
        btnRow.add_child(new St.Widget({ x_expand: true }));

        const cancelBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Cancel'),
            can_focus: false,
        });
        cancelBtn.connect('clicked', () => this._closeListFormPanel());
        btnRow.add_child(cancelBtn);

        const createBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Create'),
            can_focus: false,
        });
        createBtn.set_style('margin-left: 8px;');
        createBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (!name) return;
            this._database.createList(name, selectedColor);
            this._buildListsBar();
            this._closeListFormPanel();
            this._loadItems();
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
    },

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
            reactive: true,
        });

        // Name row
        const nameRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true,
        });
        const nameLabel = new St.Label({
            text: _('Name:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        nameRow.add_child(nameLabel);

        const nameEntry = new St.Entry({
            style_class: 'clipmaster-context-entry',
            text: list.name,
            x_expand: true,
            can_focus: true,
        });
        nameRow.add_child(nameEntry);
        this._listFormPanel.add_child(nameRow);

        // Color row
        const colorRow = new St.BoxLayout({
            style_class: 'clipmaster-context-row',
            x_expand: true,
        });
        const colorLabel = new St.Label({
            text: _('Color:'),
            style_class: 'clipmaster-context-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        colorRow.add_child(colorLabel);

        const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#95a5a6'];
        let selectedColor = list.color || colors[0];

        colors.forEach(color => {
            const colorBtn = new St.Button({
                style_class: 'clipmaster-color-button',
                style: `background-color: ${color};`,
                can_focus: false,
            });
            if (color === selectedColor)
                colorBtn.add_style_class_name('selected');

            colorBtn.connect('clicked', () => {
                colorRow.get_children().forEach(c => {
                    if (c instanceof St.Button)
                        c.remove_style_class_name('selected');
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
            x_expand: true,
        });
        btnRow.add_child(new St.Widget({ x_expand: true }));

        const cancelBtn = new St.Button({
            style_class: 'clipmaster-filter-button',
            label: _('Cancel'),
            can_focus: false,
        });
        cancelBtn.connect('clicked', () => this._closeListFormPanel());
        btnRow.add_child(cancelBtn);

        const saveBtn = new St.Button({
            style_class: 'clipmaster-filter-button active',
            label: _('Save'),
            can_focus: false,
        });
        saveBtn.set_style('margin-left: 8px;');
        saveBtn.connect('clicked', () => {
            const name = nameEntry.get_text().trim();
            if (!name) return;
            this._database.updateList(list.id, { name, color: selectedColor });
            this._buildListsBar();
            this._closeListFormPanel();
            this._loadItems();
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

};