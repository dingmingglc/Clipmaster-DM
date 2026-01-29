/*
 * ClipMaster - Clipboard Monitor
 * License: GPL-2.0-or-later
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SignalManager, TimeoutManager, SettingsCache, HashUtils, ValidationUtils } from '../Util/Utils.js';
import { ItemType, debugLog } from '../Util/Constants.js';
import { ImageStorage } from '../Util/ImageStorage.js';

export class ClipboardMonitor {
    constructor(settings, database, onNewItem) {
        this._settings = settings;
        this._database = database;
        this._onNewItem = onNewItem;
        this._clipboard = St.Clipboard.get_default();
        this._selection = global.display.get_selection();
        this._lastContent = null;
        this._lastPrimaryContent = null;
        this._lastImageHash = null;
        this._isStopped = false;

        this._signalManager = new SignalManager();
        this._timeoutManager = new TimeoutManager();
        this._settingsCache = new SettingsCache(settings);

        // Initialize image storage for file-based image handling
        this._imageStorage = new ImageStorage();

        this._primaryGracePeriodEnd = 0;
        this._primaryGracePeriodMs = 5000;

        const maxItemSize = this._settingsCache.getInt('max-item-size-mb', 1) * 1024 * 1024;
        const maxImageSize = this._settingsCache.getInt('max-image-size-mb', 5) * 1024 * 1024;

        this._cachedSettings = {
            trackImages: this._settingsCache.getBoolean('track-images', false),
            trackFiles: this._settingsCache.getBoolean('track-files', false),
            stripWhitespace: this._settingsCache.getBoolean('strip-whitespace', false),
            showNotification: this._settingsCache.getBoolean('show-notification', false),
            maxItemSize: maxItemSize,
            maxImageSize: maxImageSize,
            historySize: this._settingsCache.getInt('history-size', 100)
        };

        this._signalManager.connect(
            settings,
            'changed',
            (settings, key) => this._updateCachedSetting(key),
            'settings-changed'
        );

        // Pre-compile regex patterns for code detection (performance optimization)
        this._codePatterns = {
            shell: [
                /^\s*(sudo|apt|apt-get|dnf|yum|pacman|brew|npm|yarn|pnpm|pip|pip3|python|python3|node|cargo|go|rustc|gcc|g\+\+|make|cmake|git|docker|kubectl|helm|terraform|ansible|ssh|scp|curl|wget|chmod|chown|mkdir|rm|cp|mv|ls|cd|cat|grep|sed|awk|find|tar|zip|unzip)\s+/im,
                /^\s*\$\s+\w+/m,
                /^\s*PS\s*\w*>/m,
                /^\s*#\s*(install|update|run|build|test|deploy)/im
            ],
            powershell: [
                /^\s*(Get-|Set-|New-|Remove-|Invoke-|Start-|Stop-|Out-|Write-|Read-|Import-|Export-)\w+/im,
                /\$\w+\s*=\s*/,
                /\|\s*(Where-Object|Select-Object|ForEach-Object|Sort-Object)/i
            ],
            code: [
                /^\s*(const|let|var|function|class|import|export|async|await|=>\s*{|\(\)\s*=>)/m,
                /^\s*(if|else|for|while|switch|try|catch|throw|return)\s*[({]/m,
                /\bconsole\.(log|error|warn|info|debug)\s*\(/,
                /\bmodule\.exports\s*=/,
                /\brequire\s*\(['"]/,
                /^\s*(def|class|import|from|if __name__|@\w+|async def|lambda)\s+/m,
                /^\s*print\s*\(/m,
                /^\s*(for|while|if|elif|else|try|except|with|raise|return|yield)\s+/m,
                /^\s*(fn|let|mut|impl|struct|enum|trait|pub|mod|use|crate|match)\s+/m,
                /^\s*println!\s*\(/m,
                /^\s*(func|package|import|type|struct|interface|go|defer|chan)\s+/m,
                /^\s*fmt\.(Print|Sprintf|Errorf)/m,
                /^\s*(public|private|protected|static|void|class|interface|abstract|override|final)\s+/m,
                /^\s*System\.(out|err)\./m,
                /^\s*Console\.(Write|Read)/m,
                /^\s*#\s*(include|define|ifdef|ifndef|pragma)\s+/m,
                /^\s*(int|void|char|float|double|long|short|unsigned|signed)\s+\w+\s*[;(]/m,
                /^\s*printf\s*\(/m,
                /^\s*std::/m,
                /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|FROM|WHERE|JOIN|ORDER BY|GROUP BY)\s+/im,
                /^{\s*"\w+":\s*/m,
                /^\[\s*{\s*"\w+":/m,
                /^\s*[.#\w-]+\s*{\s*[\w-]+\s*:/m,
                /^\s*@(media|import|keyframes|font-face)\s+/m
            ],
            operators: /[{}\[\];]|=>|->|::|\+=|-=|\*=|\/=|==|!=|&&|\|\|/
        };
    }

    _getMetaSelectionType(selectionType) {
        return selectionType === 'PRIMARY'
            ? Meta.SelectionType.SELECTION_PRIMARY
            : Meta.SelectionType.SELECTION_CLIPBOARD;
    }

    _expandFilePath(filePath) {
        if (filePath.startsWith('~/')) {
            return GLib.build_filenamev([GLib.get_home_dir(), filePath.substring(2)]);
        }
        return filePath;
    }

    _updateCachedSetting(key) {
        switch (key) {
            case 'track-images':
                this._cachedSettings.trackImages = this._settingsCache.getBoolean('track-images', false);
                break;
            case 'track-files':
                this._cachedSettings.trackFiles = this._settingsCache.getBoolean('track-files', false);
                break;
            case 'strip-whitespace':
                this._cachedSettings.stripWhitespace = this._settingsCache.getBoolean('strip-whitespace', false);
                break;
            case 'show-notification':
                this._cachedSettings.showNotification = this._settingsCache.getBoolean('show-notification', false);
                break;
            case 'max-item-size-mb':
                this._cachedSettings.maxItemSize = this._settingsCache.getInt('max-item-size-mb', 1) * 1024 * 1024;
                break;
            case 'max-image-size-mb':
                this._cachedSettings.maxImageSize = this._settingsCache.getInt('max-image-size-mb', 5) * 1024 * 1024;
                break;
            case 'history-size':
                this._cachedSettings.historySize = this._settingsCache.getInt('history-size', 100);
                break;
        }
    }

    start() {
        this._signalManager.connect(
            this._selection,
            'owner-changed',
            this._onSelectionOwnerChanged.bind(this),
            'selection-owner-changed'
        );

        if (this._settingsCache.getBoolean('track-primary-selection', false)) {
            this._enablePrimaryTracking();
        }

        this._signalManager.connect(
            this._settings,
            'changed::track-primary-selection',
            () => {
                const enabled = this._settingsCache.getBoolean('track-primary-selection', false);
                if (enabled) {
                    this._enablePrimaryTracking();
                } else {
                    this._disablePrimaryTracking();
                }
            },
            'primary-selection-setting'
        );

        this._checkClipboard();
    }

    _enablePrimaryTracking() {
        this._primaryGracePeriodEnd = Date.now() + this._primaryGracePeriodMs;
        debugLog(`Primary selection tracking enabled. Grace period until: ${new Date(this._primaryGracePeriodEnd).toISOString()}`);

        this._signalManager.connect(
            this._selection,
            'owner-changed',
            this._onPrimarySelectionOwnerChanged.bind(this),
            'primary-selection-owner-changed'
        );

        this._checkPrimaryClipboard(true);
    }

    _disablePrimaryTracking() {
        this._signalManager.disconnect('primary-selection-owner-changed');
    }

    stop() {
        this._isStopped = true;

        this._signalManager.disconnectAll();
        this._timeoutManager.removeAll();

        if (this._settingsCache) {
            this._settingsCache.destroy();
            this._settingsCache = null;
        }
    }

    _onSelectionOwnerChanged(selection, selectionType, selectionSource) {
        if (this._isStopped) return;

        debugLog(`Selection owner changed, type=${selectionType}`);
        if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
            debugLog(`Clipboard selection changed!`);
            this._timeoutManager.add(
                GLib.PRIORITY_DEFAULT,
                100,
                () => {
                    if (!this._isStopped) {
                        this._checkClipboard();
                    }
                    return GLib.SOURCE_REMOVE;
                },
                'clipboard-check'
            );
        }
    }

    _onPrimarySelectionOwnerChanged(selection, selectionType, selectionSource) {
        if (this._isStopped) return;

        debugLog(`Primary selection owner changed, type=${selectionType}`);
        if (selectionType === Meta.SelectionType.SELECTION_PRIMARY) {
            debugLog(`Primary selection changed!`);
            this._timeoutManager.add(
                GLib.PRIORITY_DEFAULT,
                100,
                () => {
                    if (!this._isStopped) {
                        this._checkPrimaryClipboard();
                    }
                    return GLib.SOURCE_REMOVE;
                },
                'primary-clipboard-check'
            );
        }
    }

    _checkClipboard() {
        if (this._isStopped) return;

        debugLog(`Checking clipboard...`);
        if (this._cachedSettings?.trackImages) {
            this._checkForImageWithCallback('CLIPBOARD', (imageFound) => {
                debugLog(`Image check callback: imageFound=${imageFound}, trackImages=${this._cachedSettings.trackImages}`);
                if (!imageFound) {
                    this._checkClipboardText();
                } else {
                    debugLog(`Image found and processed, skipping text check`);
                }
            });
            return;
        }

        // trackImages=false: skip MIME/image checks entirely
        this._checkClipboardText();
    }

    _checkClipboardText() {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (this._isStopped) return;

            // Log redacted for privacy
            debugLog(`Got text from clipboard (length: ${text ? text.length : 0})`);

            const skipDuplicates = this._settingsCache.getBoolean('skip-duplicates', true);

            if (text && text !== this._lastContent) {
                debugLog(`NEW content detected, processing...`);
                this._lastContent = text;
                this._processText(text, 'CLIPBOARD').catch(e => debugLog(`processText error: ${e.message}`));
            } else if (text && text === this._lastContent && !skipDuplicates) {
                debugLog(`Same content but skip-duplicates=OFF, processing anyway...`);
                this._processText(text, 'CLIPBOARD').catch(e => debugLog(`processText error: ${e.message}`));
            } else {
                debugLog(`Same content or null, skipping`);
            }
        });
    }

    _checkPrimaryClipboard(isInitialCheck = false) {
        debugLog(`Checking primary clipboard... (isInitialCheck=${isInitialCheck})`);
        this._clipboard.get_text(St.ClipboardType.PRIMARY, (clipboard, text) => {
            if (this._isStopped) return;

            debugLog(`Got text from primary (length: ${text ? text.length : 0})`);

            if (text) {
                const trimmedText = text.trim();
                if (trimmedText.length < 3) {
                    debugLog(`Ignoring PRIMARY selection: too short`);
                    this._lastPrimaryContent = text;
                    return;
                }
            }

            const now = Date.now();
            const inGracePeriod = now < this._primaryGracePeriodEnd;

            if (inGracePeriod) {
                debugLog(`In grace period. Updating lastPrimaryContent but NOT saving to history.`);
                if (text) {
                    this._lastPrimaryContent = text;
                }
                return;
            }

            const skipDuplicates = this._settingsCache.getBoolean('skip-duplicates', true);

            if (text && text !== this._lastPrimaryContent) {
                debugLog(`NEW primary content detected, processing...`);
                this._lastPrimaryContent = text;
                this._processText(text, 'PRIMARY').catch(e => debugLog(`processText error: ${e.message}`));
            } else if (text && text === this._lastPrimaryContent && !skipDuplicates) {
                debugLog(`Same primary content but skip-duplicates=OFF, processing anyway...`);
                this._processText(text, 'PRIMARY').catch(e => debugLog(`processText error: ${e.message}`));
            } else {
                debugLog(`Same primary content or null, skipping`);
            }
        });
    }

    _checkForImage(selectionType = 'CLIPBOARD') {
        this._checkForImageWithCallback(selectionType, null);
    }

    _checkForImageWithCallback(selectionType = 'CLIPBOARD', callback = null) {
        debugLog(`_checkForImageWithCallback called (selectionType=${selectionType})`);

        if (this._isStopped) {
            if (callback) callback(false);
            return;
        }

        // Use native Meta.Selection API
        const metaSelectionType = this._getMetaSelectionType(selectionType);

        const mimetypes = this._selection.get_mimetypes(metaSelectionType);
        debugLog(`Available MIME types: ${mimetypes ? mimetypes.join(', ') : 'none'}`);

        if (mimetypes && mimetypes.length > 0) {
            const hasImage = mimetypes.some(mime =>
                mime.startsWith('image/')
            );

            if (hasImage) {
                debugLog(`✓ Image MIME type detected via Meta.Selection`);
                this._fetchImageFromClipboard(selectionType, callback);
                return;
            }
        }

        debugLog(`✗ No image MIME type found`);
        if (callback) callback(false);
    }

    _fetchImageFromClipboard(selectionType = 'CLIPBOARD', callback = null) {
        if (this._isStopped) {
            if (callback) callback(false);
            return;
        }

        const maxSize = this._cachedSettings.maxImageSize;
        const timestamp = Date.now();

        try {
            const metaSelectionType = this._getMetaSelectionType(selectionType);

            const tempDir = GLib.get_tmp_dir();
            const tempPath = GLib.build_filenamev([tempDir, `clipmaster_${timestamp}.png`]);
            const tempFile = Gio.File.new_for_path(tempPath);

            const outputStream = tempFile.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            this._selection.transfer_async(
                metaSelectionType,
                'image/png',
                maxSize,
                outputStream,
                null,
                async (selection, result) => {
                    let imageSuccessfullyAdded = false;

                    outputStream.close(null);

                    if (this._isStopped) {
                        tempFile.delete(null);
                        return;
                    }

                    try {
                        const success = this._selection.transfer_finish(result);

                        if (success && tempFile.query_exists(null)) {
                            // query_info_async?
                            const info = await tempFile.query_info_async('standard::size', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
                            const size = info.get_size();

                            if (size > 0 && size <= maxSize) {
                                // Use async load
                                const [contents] = await tempFile.load_contents_async(null);
                                const hash = HashUtils.hashImageData(contents);

                                if (hash !== this._lastImageHash) {
                                    this._lastImageHash = hash;

                                    if (this._cachedSettings?.trackImages) {
                                        // Use ImageStorage for file-based storage with thumbnails
                                        const storageResult = await this._imageStorage.saveImage(contents, 'png', hash);

                                        if (storageResult) {
                                            const item = {
                                                type: ItemType.IMAGE,
                                                content: storageResult.imagePath,  // File path instead of base64
                                                thumbnail: storageResult.thumbnail,  // Base64 thumbnail for popup
                                                plainText: `[Image ${timestamp}]`,
                                                preview: `Image (${Math.round(storageResult.originalSize / 1024)}KB)`,
                                                imageFormat: storageResult.format,
                                                metadata: {
                                                    size: storageResult.originalSize,
                                                    savedSize: storageResult.savedSize,
                                                    thumbnailSize: storageResult.thumbnailSize,
                                                    width: storageResult.width,
                                                    height: storageResult.height,
                                                    hash: hash,
                                                    storedAs: 'file'  // Indicates file-based storage
                                                }
                                            };

                                            if (!this._isStopped && this._database) {
                                                const itemId = this._database.addItem(item);
                                                this._database.enforceLimit(this._cachedSettings.historySize);

                                                if (this._onNewItem && !this._isStopped) {
                                                    this._onNewItem(itemId);
                                                }
                                            }

                                            imageSuccessfullyAdded = true;
                                            debugLog(`Image successfully saved to file: ${storageResult.imagePath}`);
                                        } else {
                                            debugLog(`ImageStorage.saveImage failed, image not saved`);
                                        }
                                    } else {
                                        debugLog(`Image found but trackImages=false`);
                                        imageSuccessfullyAdded = true;
                                    }
                                } else {
                                    debugLog(`Image duplicate detected`);
                                    imageSuccessfullyAdded = true;
                                }
                            }
                        }
                    } catch (e) {
                        debugLog(`Native image fetch error: ${e.message}`);
                    }

                    tempFile.delete(null);

                    if (callback) {
                        callback(imageSuccessfullyAdded);
                    }
                }
            );
        } catch (e) {
            debugLog(`Meta.Selection.transfer_async error: ${e.message}`);
            if (callback) callback(false);
        }
    }

    async _processText(text, selectionType = 'CLIPBOARD') {
        if (this._isStopped || !this._database) return;

        // Removed validation redundancy
        if (!ValidationUtils.isValidText(text, 1)) {
            return;
        }

        // Strip whitespace if enabled
        if (this._cachedSettings.stripWhitespace) {
            text = text.trim();
        }

        if (text.length > this._cachedSettings.maxItemSize) {
            text = text.substring(0, this._cachedSettings.maxItemSize);
        }

        const trimmed = text.trim();

        // DISABLED: File path detection to prevent crashes when copying folders
        // Check for file:// URI early to avoid processing folder paths
        if (trimmed.includes('file://')) {
            debugLog('File URI detected (likely folder/files), skipping to prevent crashes');
            return;
        }
        // if (this._cachedSettings.trackImages) {
        //     const isImagePath = await this._isImageFilePath(trimmed); // Await async check
        //
        //     if (isImagePath) {
        //         debugLog(`✓ Text appears to be an image file path`);
        //         this._processImageFile(trimmed, selectionType);
        //         return;
        //     }
        // }

        let type = ItemType.TEXT;
        if (trimmed.match(/^https?:\/\//i)) {
            type = ItemType.URL;
        } else if (trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)) {
            type = ItemType.COLOR;
        } else if (trimmed.startsWith('<') && trimmed.includes('>')) {
            type = ItemType.HTML;
        } else if (trimmed.startsWith('file://')) {
            // DISABLED: File tracking to prevent crashes when copying folders
            debugLog('File path detected but file tracking is disabled, skipping');
            return;
            // if (!this._cachedSettings.trackFiles) {
            //     debugLog('File path detected but trackFiles is disabled, skipping');
            //     return;
            // }
            // type = ItemType.FILE;
        } else if (this._isCodeSnippet(trimmed)) {
            type = ItemType.CODE;
        }

        const item = {
            type: type,
            content: text,
            plainText: text,
            preview: text.substring(0, 200).replace(/\n/g, ' '),
            sourceApp: selectionType === 'PRIMARY' ? 'PRIMARY' : null
        };

        const itemId = this._database.addItem(item);
        this._database.enforceLimit(this._cachedSettings.historySize);

        if (this._onNewItem && !this._isStopped) {
            this._onNewItem(itemId);
        }

        // Show notification if enabled
        if (this._cachedSettings.showNotification && itemId) {
            this._showNotification(type, trimmed.substring(0, 50));
        }
    }

    _showNotification(type, preview) {
        try {
            const typeLabels = {
                [ItemType.TEXT]: 'Text',
                [ItemType.URL]: 'URL',
                [ItemType.CODE]: 'Code',
                [ItemType.HTML]: 'HTML',
                [ItemType.IMAGE]: 'Image',
                [ItemType.FILE]: 'File',
                [ItemType.COLOR]: 'Color'
            };
            const typeLabel = typeLabels[type] || 'Text';
            const body = preview.length > 50 ? preview + '...' : preview;
            
            Main.notify('ClipMaster', `${typeLabel}: ${body}`);
        } catch (e) {
            debugLog(`Notification error: ${e.message}`);
        }
    }

    async _isImageFilePath(text) {
        // DISABLED: File path detection to prevent crashes when copying folders
        return false;
        
        // if (!text || text.length < 3) return false;
        //
        // const looksLikePath = text.startsWith('/') ||
        //     text.startsWith('~/') ||
        //     text.startsWith('./') ||
        //     (text.includes('/') && !text.includes('://'));
        //
        // if (!looksLikePath) return false;

        const filePath = this._expandFilePath(text);

        try {
            const file = Gio.File.new_for_path(filePath);
            if (!file.query_exists(null)) return false;

            // Use async query_info
            const info = await file.query_info_async('standard::content-type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
            const mimeType = info.get_content_type();

            if (mimeType && mimeType.startsWith('image/')) {
                return true;
            }
        } catch (e) {
            // ignore
        }

        // Fallback to extensions if MIME check fails
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
        const lowerText = text.toLowerCase();
        return imageExtensions.some(ext => lowerText.endsWith(ext));
    }

    /**
     * Detect if text is a code snippet (programming languages, shell commands, scripts)
     */
    _isCodeSnippet(text) {
        if (!text || text.length < 5) return false;

        const lines = text.split('\n');
        const firstLine = lines[0].trim();
        const trimmedText = text.trim();

        // Shebang detection (#!/bin/bash, #!/usr/bin/env python, etc.)
        if (firstLine.startsWith('#!')) return true;

        // Use pre-compiled patterns for better performance
        for (const pattern of this._codePatterns.shell) {
            if (pattern.test(trimmedText)) return true;
        }

        for (const pattern of this._codePatterns.powershell) {
            if (pattern.test(trimmedText)) return true;
        }

        for (const pattern of this._codePatterns.code) {
            if (pattern.test(trimmedText)) return true;
        }

        // Multi-line with common code indicators
        if (lines.length >= 3) {
            // Check for consistent indentation (likely code)
            const indentedLines = lines.filter(l => l.match(/^[\t ]{2,}/));
            if (indentedLines.length >= lines.length * 0.3) {
                // Has brackets, semicolons, or common operators
                if (this._codePatterns.operators.test(trimmedText)) {
                    return true;
                }
            }
        }

        return false;
    }

    async _processImageFile(filePath, selectionType = 'CLIPBOARD') {
        // DISABLED: Image file processing to prevent crashes when copying folders
        debugLog('_processImageFile called but is disabled');
        return;
        
        // if (this._isStopped || !this._database) return;
        //
        // const fullPath = this._expandFilePath(filePath);

        const file = Gio.File.new_for_path(fullPath);
        if (!file.query_exists(null)) return;

        try {
            // Async info query
            const info = await file.query_info_async('standard::size', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
            const size = info.get_size();
            const maxSize = this._cachedSettings.maxImageSize;

            if (size > maxSize || size === 0) return;

            // Async load
            const [contents] = await file.load_contents_async(null);

            const hash = HashUtils.hashImageData(contents);

            if (hash === this._lastImageHash) return;

            this._lastImageHash = hash;
            const timestamp = Date.now();

            const originalExt = fullPath.substring(fullPath.lastIndexOf('.'));
            const ext = originalExt.toLowerCase();
            const formatMap = {
                '.jpg': 'jpeg',
                '.jpeg': 'jpeg',
                '.gif': 'gif',
                '.webp': 'webp',
                '.bmp': 'bmp',
                '.svg': 'svg'
            };
            const imageFormat = formatMap[ext] || 'png';

            // Use ImageStorage for file-based storage with thumbnails
            const storageResult = await this._imageStorage.saveImage(contents, imageFormat, hash);

            if (!storageResult) {
                debugLog(`ImageStorage.saveImage failed for file: ${fullPath}`);
                return;
            }

            const item = {
                type: ItemType.IMAGE,
                content: storageResult.imagePath,  // File path instead of base64
                thumbnail: storageResult.thumbnail,  // Base64 thumbnail for popup
                plainText: `[Image from ${GLib.path_get_basename(fullPath)}]`,
                preview: `Image (${Math.round(storageResult.originalSize / 1024)}KB)`,
                imageFormat: storageResult.format,
                metadata: {
                    size: storageResult.originalSize,
                    savedSize: storageResult.savedSize,
                    thumbnailSize: storageResult.thumbnailSize,
                    width: storageResult.width,
                    height: storageResult.height,
                    originalPath: fullPath,
                    hash: hash,
                    storedAs: 'file'  // Indicates file-based storage
                }
            };

            // Check again in case stopped while awaiting
            if (this._isStopped || !this._database) return;

            const itemId = this._database.addItem(item);
            this._database.enforceLimit(this._cachedSettings.historySize);

            if (this._onNewItem && !this._isStopped) {
                this._onNewItem(itemId);
            }
        } catch (e) {
            console.error(`ClipMaster: Error processing image file: ${e.message}`);
        }
    }

    copyToClipboard(text, asPlainText = false) {
        if (asPlainText) {
            text = text.replace(/<[^>]*>/g, '');
        }
        this._lastContent = text;
        this._clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    }

    async copyImageToClipboard(imageContent) {
        try {
            let imageData;

            if (imageContent.includes('/') && !imageContent.startsWith('data:')) {
                // Handle file path - load image from disk
                try {
                    imageData = await this._imageStorage.loadImage(imageContent);
                    if (!imageData) {
                        console.warn(`ClipMaster: Could not load image from: ${imageContent}`);
                        return;
                    }
                    debugLog(`Loaded image from file: ${imageContent}`);
                } catch (e) {
                    console.error(`ClipMaster: Error loading image file: ${e.message}`);
                    return;
                }
            } else {
                // Base64 (legacy support)
                try {
                    imageData = GLib.base64_decode(imageContent);
                } catch (e) {
                    console.error(`ClipMaster: Error decoding base64 image: ${e.message}`);
                    return;
                }
            }

            if (imageData) {
                const bytes = GLib.Bytes.new(imageData);
                this._clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', bytes);
                debugLog(`Image copied to clipboard successfully`);
            }
        } catch (e) {
            console.error(`ClipMaster: Error copying image to clipboard: ${e.message}`);
        }
    }
}
