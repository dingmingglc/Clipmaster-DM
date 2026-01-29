# ClipMaster DM

一个 GNOME Shell 剪贴板管理器扩展，支持面板指示器、快速搜索、内联编辑、二维码预览与导出、主题定制与加密存储。

A GNOME Shell clipboard manager extension with panel indicator, fast search, inline editing, QR code preview/export, theming, and encrypted storage.

## 功能特性 | Features

- 剪贴板历史记录（文本/图片/文件）
- 面板指示器与弹窗列表
- 内联编辑与纯文本粘贴
- 过滤与分页展示
- 二维码展示与导出
- 自定义主题与外观
- 数据导入/导出与一键清理
- 可选加密存储（AES-256 级别实现）
- 应用排除列表
- Clipboard history (text/images/files)
- Panel indicator and popup list
- Inline editing and paste-as-plain-text
- Filtering and pagination
- QR code preview and export
- Custom themes and appearance
- Data import/export and one-click cleanup
- Optional encrypted storage (AES-256 level)
- Excluded apps list

## 兼容性 | Compatibility

- GNOME Shell: 45 / 46 / 47 / 48 / 49
- Extension UUID: `clipmaster-dm@dingmingglc`

## 安装（本地开发目录）| Install (local extension dir)

该仓库已位于 GNOME 扩展目录下时，直接启用即可：

If this repo is already under the GNOME extensions directory, just enable it:

1. 打开“扩展”应用或使用 `gnome-extensions` 命令行  
   Open the Extensions app or use `gnome-extensions`
2. 启用 **ClipMaster DM**  
   Enable **ClipMaster DM**

如需重新加载扩展（调试时常用）：

To reload the extension (useful for debugging):

```bash
gnome-extensions disable clipmaster-dm@dingmingglc
gnome-extensions enable clipmaster-dm@dingmingglc
```

## 使用与快捷键 | Usage & Shortcuts

默认快捷键（可在设置中修改）：

Default shortcuts (customizable in settings):

- 显示/隐藏弹窗：`Shift` + `Super` + `V`  
  Show/Hide popup: `Shift` + `Super` + `V`
- 纯文本粘贴：`Ctrl` + `Shift` + `V`  
  Paste as plain text: `Ctrl` + `Shift` + `V`

面板指示器打开后，可在弹窗中浏览/搜索/操作剪贴板历史。

With the panel indicator enabled, use the popup to browse/search/manage history.

## 主要设置项 | Main Settings

设置界面分为 General / Behavior / Shortcuts / Storage / Excluded Apps / About：

Settings pages: General / Behavior / Shortcuts / Storage / Excluded Apps / About:

- **History**：历史数量、预览长度、每页数量、重复项过滤  
  History size, preview length, items per page, duplicate filtering
- **Content Types**：是否记录图片/文件/主选择区、去除首尾空白  
  Track images/files/primary selection, trim whitespace
- **Popup**：点击粘贴、粘贴后关闭、尺寸  
  Paste on select, close after paste, size
- **Theme**：跟随系统、内置主题、自定义 CSS  
  Follow system, built-in themes, custom CSS
- **Storage**：自定义存储路径、数据库大小、导入导出  
  Custom storage path, DB size, import/export
- **Security**：数据库加密、加密状态  
  Database encryption, status
- **Excluded Apps**：排除指定应用  
  Excluded applications

## 目录结构 | Structure

```
.
├── extension.js              # 扩展入口 | Extension entry
├── prefs.js                  # 设置面板 | Preferences UI
├── schemas/                  # GSettings schema
├── src/
│   ├── Manager/              # 监控与数据库 | Monitor & database
│   ├── UI/                   # 面板与弹窗 UI | Panel & popup UI
│   └── Util/                 # 工具与常量 | Utilities & constants
└── stylesheet.css            # UI 样式 | Styles
```

## 许可证 | License

本项目采用 GPL-2.0-or-later 许可证，详见 `LICENSE`。

Licensed under GPL-2.0-or-later. See `LICENSE`.
