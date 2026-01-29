/*
 * ClipMaster Custom - UI Utility Functions
 * Extracted from Indicator.js for better code organization
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ItemType, debugLog } from '../Util/Constants.js';
import { tr as _ } from '../Util/Translations.js';

/**
 * UI Utility Functions Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const UIUtilsMixin = {
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
    },

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
    },

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
    },

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
    },

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
            debugLog(() => `Error checking panel visibility: ${e.message}`);
            // Default to visible if we can't determine
            return true;
        }
    }
};
