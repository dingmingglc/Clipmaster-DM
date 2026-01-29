/*
 * ClipMaster Custom - Theme Management
 * Extracted from Indicator.js for better code organization
 */

import St from 'gi://St';

import { debugLog } from '../Util/Constants.js';
import { tr as _ } from '../Util/Translations.js';

/**
 * Theme Management Mixin
 * These methods will be mixed into ClipMasterIndicator class
 */
export const ThemeManagerMixin = {
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

        debugLog(() => `_applyTheme: themeMode=${this._themeMode}, isLight=${isLight}`);

        if (isLight) {
            this._contentBox.add_style_class_name('light');
            debugLog('_applyTheme: Applied light theme');
        } else {
            debugLog('_applyTheme: Applied dark theme');
        }

        // Also apply the selected theme style on top
        if (theme && theme !== 'default') {
            this._contentBox.add_style_class_name(`theme-${theme}`);
            debugLog(() => `_applyTheme: Also applied theme-${theme}`);
        }

        this._updateSize();
    },

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
    },

    _updateSize() {
        const width = this._settings.get_int('popup-width') || 450;
        const height = this._settings.get_int('popup-height') || 550;

        this._contentBox.set_style(`
            width: ${width}px;
            min-height: ${Math.min(height, 400)}px;
            max-height: ${height}px;
        `);
    },

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
    },

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
    },

    _mixColors(baseHex, colorHex, amount) {
        // Mix two colors: result = base * (1-amount) + color * amount
        const base = this._hexToRgb(baseHex);
        const color = this._hexToRgb(colorHex);
        
        const r = Math.round(base.r * (1 - amount) + color.r * amount);
        const g = Math.round(base.g * (1 - amount) + color.g * amount);
        const b = Math.round(base.b * (1 - amount) + color.b * amount);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
};
