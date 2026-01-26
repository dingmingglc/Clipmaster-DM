/*
 * ClipMaster - Translation Helper
 * Supports runtime language switching
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Chinese translations (simplified)
const ZH_CN = {
    // Indicator.js - Header tooltips
    "Dark mode (click for Light)": "深色模式 (点击切换到浅色)",
    "Light mode (click for Auto)": "浅色模式 (点击切换到自动)",
    "Follow system (click for Dark)": "跟随系统 (点击切换到深色)",
    "Paste as plain text": "粘贴为纯文本",
    "Pin popup (keep open)": "固定弹窗 (保持打开)",
    "Clear all (keeps favorites)": "清除全部 (保留收藏)",
    "Settings": "设置",
    "Close": "关闭",
    "Search...": "搜索...",
    
    // Filter bar
    "Text": "文本",
    "Favorites": "收藏",
    "URL": "网址",
    "Code": "代码",
    "Images": "图片",
    "All": "全部",
    
    // Lists management
    "Manage Lists": "管理列表",
    "+ Add": "+ 添加",
    "No lists yet. Click \"+ Add\" to create one.": "暂无列表，点击\"+ 添加\"创建一个",
    "Edit": "编辑",
    "Delete": "删除",
    "Name:": "名称:",
    "List name...": "列表名称...",
    "Color:": "颜色:",
    "Cancel": "取消",
    "Create": "创建",
    "Save": "保存",
    "No clipboard items": "无剪贴板内容",
    "QR Code": "二维码",
    "Unfavorite": "取消收藏",
    "Favorite": "收藏",
    "Title:": "标题:",
    "Enter title...": "输入标题...",
    "Content:": "内容:",
    "Add to List:": "添加到列表:",
    "Text too long for QR code": "文本太长，无法生成二维码",
    "Failed to generate QR code": "生成二维码失败",
    
    // Time
    "Just now": "刚刚",
    "%d min ago": "%d 分钟前",
    "%d hr ago": "%d 小时前",
    "%d days ago": "%d 天前",
    
    // prefs.js - General
    "General": "常规",
    "Language": "语言",
    "Interface Language": "界面语言",
    "Choose interface language": "选择界面语言",
    "Auto (System)": "自动 (跟随系统)",
    "English": "英语",
    "Chinese (Simplified)": "简体中文",
    
    "Clipboard History": "剪贴板历史",
    "Configure clipboard history behavior": "配置剪贴板历史行为",
    "History Size": "历史记录数量",
    "Maximum number of items to keep": "最大保留条目数",
    "Preview Length": "预览长度",
    "Maximum characters to show in preview": "预览显示的最大字符数",
    "Items Per Page": "每页条目数",
    "Number of items to show in popup": "弹窗中显示的条目数",
    "Skip Duplicate Items": "跳过重复内容",
    
    "Content Types": "内容类型",
    "What to track in clipboard": "要跟踪的剪贴板内容",
    "Track Images": "跟踪图片",
    "Store images in clipboard history": "在历史记录中保存图片",
    "Track Files": "跟踪文件",
    "Store file copies in clipboard history": "在历史记录中保存文件复制",
    "Track Primary Selection": "跟踪主选择",
    "Track PRIMARY selection (middle mouse button). When enabled, tracks both CLIPBOARD and PRIMARY. When disabled, only tracks CLIPBOARD (Ctrl+C/V).": "跟踪主选择 (鼠标中键)。启用时跟踪剪贴板和主选择，禁用时只跟踪剪贴板 (Ctrl+C/V)。",
    "Strip Whitespace": "去除空白",
    "Remove leading/trailing whitespace from text": "去除文本首尾空白字符",
    
    "Behavior": "行为",
    "Popup Window": "弹出窗口",
    "Configure popup behavior": "配置弹窗行为",
    "Paste on Selection": "选中时粘贴",
    "Automatically paste when selecting an item": "选择条目时自动粘贴",
    "Close After Paste": "粘贴后关闭",
    "Close popup after pasting an item": "粘贴后关闭弹窗",
    "Text Filter Includes URL/Code": "文本筛选包含网址/代码",
    "Show URL and Code items when Text filter is selected": "选择文本筛选时显示网址和代码",
    "Show Notifications": "显示通知",
    "Notify when new items are copied": "复制新内容时显示通知",
    
    "Popup Size": "弹窗大小",
    "Customize popup window dimensions": "自定义弹窗窗口尺寸",
    "Popup Width": "弹窗宽度",
    "Width in pixels": "宽度 (像素)",
    "Popup Height": "弹窗高度",
    "Height in pixels": "高度 (像素)",
    
    "Appearance": "外观",
    "Visual settings": "视觉设置",
    "Follow System Theme": "跟随系统主题",
    "Automatically use Adwaita light/dark based on system preference": "根据系统偏好自动使用浅色/深色主题",
    "Theme": "主题",
    "Choose a visual theme (disabled when following system theme)": "选择视觉主题 (跟随系统主题时禁用)",
    "Custom Theme": "自定义主题",
    "Load a custom CSS theme file": "加载自定义 CSS 主题文件",
    "Select CSS File": "选择 CSS 文件",
    "Select Custom Theme CSS File": "选择自定义主题 CSS 文件",
    "CSS Files": "CSS 文件",
    "Clear Custom Theme": "清除自定义主题",
    "Remove custom theme and use built-in theme": "移除自定义主题并使用内置主题",
    
    "Panel Indicator": "面板指示器",
    "Configure the panel indicator": "配置面板指示器",
    "Show Panel Indicator": "显示面板指示器",
    "Display ClipMaster icon in the panel": "在面板中显示 ClipMaster 图标",
    
    "Shortcuts": "快捷键",
    "Keyboard Shortcuts": "键盘快捷键",
    "Configure global keyboard shortcuts": "配置全局键盘快捷键",
    "Show/Hide Popup": "显示/隐藏弹窗",
    "Keyboard shortcut to toggle clipboard popup": "切换剪贴板弹窗的快捷键",
    "Paste as Plain Text": "粘贴为纯文本",
    "Paste clipboard content without formatting": "粘贴剪贴板内容但不保留格式",
    
    "Storage": "存储",
    "Database Location": "数据库位置",
    "Where to store clipboard data": "剪贴板数据存储位置",
    "Use Custom Storage Location": "使用自定义存储位置",
    "Store clipboard data in a custom directory": "将剪贴板数据存储在自定义目录",
    "Custom Storage Directory": "自定义存储目录",
    "Click Browse to select a directory": "点击浏览选择目录",
    "Browse": "浏览",
    "Clear custom path": "清除自定义路径",
    "Default Location": "默认位置",
    "Database File Size": "数据库文件大小",
    "Calculating...": "计算中...",
    "Database not found": "未找到数据库",
    "Unable to calculate": "无法计算",
    "Refresh size": "刷新大小",
    
    "Security": "安全",
    "Protect your clipboard data": "保护你的剪贴板数据",
    "Encrypt Database": "加密数据库",
    "Encrypt clipboard history for security (AES-256)": "加密剪贴板历史以提高安全性 (AES-256)",
    "Encryption Status": "加密状态",
    "🔒 Encrypted with unique key": "🔒 已使用唯一密钥加密",
    "🔓 Not encrypted": "🔓 未加密",
    "🔒 Encryption will be enabled on next restart": "🔒 加密将在下次重启时启用",
    
    "Size Limits": "大小限制",
    "Maximum sizes for clipboard items": "剪贴板条目的最大大小",
    "Maximum Item Size (MB)": "最大条目大小 (MB)",
    "Maximum size of a single text item": "单个文本条目的最大大小",
    "Maximum Image Size (MB)": "最大图片大小 (MB)",
    "Maximum size of images to store": "存储图片的最大大小",
    "Maximum Database Size (MB)": "最大数据库大小 (MB)",
    "Maximum total size of clipboard.json file": "clipboard.json 文件的最大总大小",
    
    "Data Management": "数据管理",
    "Export, import, or clear clipboard data": "导出、导入或清除剪贴板数据",
    "Export Data": "导出数据",
    "Save clipboard history to a file": "将剪贴板历史保存到文件",
    "Export": "导出",
    "Import Data": "导入数据",
    "Load clipboard history from a file": "从文件加载剪贴板历史",
    "Import": "导入",
    "Clear History": "清除历史",
    "Delete all non-favorite items": "删除所有非收藏条目",
    "Clear": "清除",
    
    "Excluded Apps": "排除的应用",
    "Excluded Applications": "排除的应用程序",
    "Applications to ignore when copying": "复制时忽略的应用程序",
    "Add Application": "添加应用",
    "Add an app to the exclusion list": "将应用添加到排除列表",
    
    "About": "关于",
    "ClipMaster - Clipboard manager for GNOME": "ClipMaster - GNOME 剪贴板管理器",
    "Version": "版本",
    "Features": "功能",
    "✓ Encryption ✓ Image Support ✓ Custom Themes ✓ Adjustable Size": "✓ 加密 ✓ 图片支持 ✓ 自定义主题 ✓ 可调大小",
    
    "Troubleshooting": "故障排除",
    "Debug options for troubleshooting issues": "用于排查问题的调试选项",
    "Debug Mode": "调试模式",
    "Enable debug logging. View logs with:\\njournalctl -f /usr/bin/gnome-shell | grep ClipMaster": "启用调试日志。查看日志:\\njournalctl -f /usr/bin/gnome-shell | grep ClipMaster",
    "Log Location": "日志位置",
    
    "Select Storage Directory": "选择存储目录",
    "Disabled": "已禁用",
    "Enter new shortcut": "输入新快捷键",
    "Example: <Super>v, <Ctrl><Shift>v": "示例: <Super>v, <Ctrl><Shift>v",
    "Export Clipboard Data": "导出剪贴板数据",
    "Import Clipboard Data": "导入剪贴板数据",
    "JSON files": "JSON 文件",
    "Clear Clipboard History?": "清除剪贴板历史？",
    "This will delete all non-favorite items. This action cannot be undone.": "这将删除所有非收藏条目。此操作无法撤销。",
    
    "Database file not found": "未找到数据库文件",
    "Failed to read database file": "读取数据库文件失败",
    "Database file is empty": "数据库文件为空",
    "Database is encrypted but encryption is disabled in settings": "数据库已加密但设置中未启用加密",
    "Encryption key not found. Cannot decrypt database.": "未找到加密密钥。无法解密数据库。",
    "Failed to decrypt database. Encryption key may be incorrect.": "解密数据库失败。加密密钥可能不正确。",
    "Invalid JSON in database file. File may be corrupted.": "数据库文件中的 JSON 无效。文件可能已损坏。",
    
    "History Cleared": "历史已清除",
    "Error": "错误",
    "Error clearing history: ": "清除历史时出错: ",
    "OK": "确定",
    "Add Excluded Application": "添加排除的应用",
    "Enter the application name to exclude": "输入要排除的应用名称",
    "e.g., 1Password, KeePassXC": "例如: 1Password, KeePassXC",
    "Add": "添加",
    
    // ClipboardMonitor notifications
    "Copied to clipboard": "已复制到剪贴板",
    "ClipMaster": "ClipMaster"
};

let _currentLanguage = 'auto';
let _settings = null;

/**
 * Initialize translations with settings
 * @param {Gio.Settings} settings - Extension settings
 */
export function initTranslations(settings) {
    _settings = settings;
    _currentLanguage = settings.get_string('language') || 'auto';
    
    settings.connect('changed::language', () => {
        _currentLanguage = settings.get_string('language') || 'auto';
    });
}

/**
 * Get current effective language
 * @returns {string} Language code (en, zh_CN)
 */
function getEffectiveLanguage() {
    if (_currentLanguage === 'auto') {
        // Get system language
        const locale = GLib.get_language_names()[0] || 'en';
        if (locale.startsWith('zh')) {
            return 'zh_CN';
        }
        return 'en';
    }
    return _currentLanguage;
}

/**
 * Translate a string
 * @param {string} text - Text to translate
 * @returns {string} Translated text
 */
export function tr(text) {
    const lang = getEffectiveLanguage();
    
    if (lang === 'zh_CN' && ZH_CN[text]) {
        return ZH_CN[text];
    }
    
    return text;
}

/**
 * Translate with format (like printf)
 * @param {string} text - Text to translate with %d, %s placeholders
 * @returns {string} Translated text (still needs .format() call)
 */
export function ntr(text) {
    return tr(text);
}
