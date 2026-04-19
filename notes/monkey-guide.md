---
article_id: OBA-monkeyguide01
tags: [open-source, Monkey, chrome-extension, ai, guide]
type: tutorial
updated_at: 2026-04-19
---

# Monkey 使用指南

> Monkey 是一个 Chrome 扩展（Manifest V3），让不会写代码的人也能用一句话改造任意网页——AI 自动生成脚本并注入执行。

## 📌 项目概览

**核心价值**：自然语言描述需求，AI 生成 UserScript 并自动注入网页，实现零代码定制浏览器行为。

**技术特征**：
- 纯 JavaScript，无框架、无构建步骤、无包管理——10 个源文件直出运行
- BYOK（自带 API Key）模式，支持 OpenAI / Claude / 任意兼容接口，数据不出浏览器
- SSE 流式生成 + 实时代码预览，DOM 快照感知让 AI 生成精准选择器

**代码规模**：约 2,600 行（含 HTML/CSS/JS），10 个源文件。

## 🏗️ 系统架构

### 架构图

```
┌──────────────────────────────────────────────────────────┐
│  Sidepanel (主界面)                                       │
│  输入需求 → DOM 快照 → AI 流式生成 → 确认保存              │
└──────┬───────────────────────────────────────────┬───────┘
       │ chrome.runtime.sendMessage                │ chrome.scripting.executeScript
       │ (SAVE/GET/DELETE/UPDATE/EXECUTE)          │ (world:'MAIN')
       v                                           v
┌──────────────────┐                     ┌─────────────────────┐
│ Background SW     │◄── chrome.storage ──│ 目标网页 (MAIN world) │
│ 消息路由/存储/注入  │     .local          │ 注入的用户脚本        │
└──────────────────┘                     └─────────────────────┘

┌──────────────────┐
│ Options Page      │  API Key / 服务商 / 连接测试
└──────────────────┘

         │ fetch SSE
         v
  ┌────────────────────────┐
  │  外部 AI 服务             │
  │  OpenAI / Claude / 自定义 │
  └────────────────────────┘
```

### 核心数据流（生成脚本）

```
用户输入需求 → 提取目标页面 DOM 快照（ID/表单/按钮）
            → 构建 System Prompt（URL + DOM 结构 + 规则）
            → 调用 AI API（SSE 流式）→ 实时预览代码
            → 解析 AI 响应（<DESCRIPTION> + <SCRIPT> XML 标签）
            → 用户确认 → 保存到 chrome.storage + executeScript(world:'MAIN') 执行
            → 下次访问同域名页面，tabs.onUpdated 自动注入
```

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 扩展规范 | Chrome Manifest V3 | 权限、生命周期管理 |
| UI | 原生 HTML/CSS/JS | Sidepanel + Options 页面 |
| 后台 | Service Worker | 消息路由、存储 CRUD、自动注入 |
| 注入 | `chrome.scripting.executeScript` | MAIN world 执行用户脚本，绕过 CSP |
| 存储 | `chrome.storage.local` | 脚本和配置持久化 |
| AI 接口 | OpenAI SSE / Anthropic SSE | 流式生成脚本 |
| 设计系统 | CSS 自定义属性（`tokens.css`） | 全局设计令牌 |

## 🗺️ 关键文件地图

| 优先级 | 文件路径 | 行数 | 职责 | 何时阅读 |
|--------|---------|------|------|---------|
| 1 | `manifest.json` | 46 | 扩展配置：权限、入口、脚本注册 | 第一天 |
| 2 | `sidepanel/sidepanel.js` | 860 | **核心文件**：AI 调用、DOM 快照、状态机、流式解析、脚本管理 | 第一天 |
| 3 | `background/service-worker.js` | 229 | 消息路由、存储 CRUD、自动注入、URL glob 匹配 | 第一天 |
| 4 | `sidepanel/index.html` | 146 | 主 UI：5 种生成阶段状态 + 脚本列表 | 第一天 |
| 5 | `options/options.js` | 295 | BYOK 配置、多服务商切换、连接测试 | 第一周 |
| 6 | `sidepanel/sidepanel.css` | 572 | 完整 UI 样式，状态驱动设计 | 按需 |
| 7 | `options/index.html` | 115 | 设置页 UI 结构 | 按需 |
| 8 | `design/tokens.css` | 45 | 全局 CSS 令牌（颜色、间距、字体） | 按需 |
| 9 | `options/options.css` | 266 | 设置页样式 | 按需 |
| 10 | `content/content.js` | 16 | 极简 shim，仅保持消息通道存活 | 按需 |

### ⚠️ 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `manifest.json` | 权限变更 | `host_permissions` 变更可能导致 Chrome Web Store 拒绝上架 |
| `background/service-worker.js` | 并发写入 | 作为 `chrome.storage.local` 唯一写入者，修改需保证数据一致性 |
| `sidepanel.js:442-536` | 流式解析 | SSE 解析逻辑，Claude/OpenAI 格式不同，修改需同时测试两种服务商 |

## 💡 核心设计决策

| 问题 | 方案 | 原因 |
|------|------|------|
| 脚本注入方式 | `chrome.scripting.executeScript(world:'MAIN')` | `<script>` 标签受 CSP 限制，此 API 明确豁免 |
| AI 调用位置 | Sidepanel（持久页面） | 避开 MV3 Service Worker 30 秒空闲超时 |
| 存储单写者 | Background SW 统一处理所有写操作 | 防止并发写入竞态条件 |
| Tab 定位 | `lastFocusedWindow:true` | Sidepanel 不是 tab，`currentWindow` 不可靠 |
| DOM 快照 | 生成前注入提取脚本获取真实结构 | 避免 AI 幻觉出错误的 CSS 选择器 |
| eval 执行 | `(0, eval)(src)` 间接 eval | 在 MAIN world 的全局作用域执行代码 |
| AI 输出格式 | XML 标签（`<DESCRIPTION>` + `<SCRIPT>`） | 比 JSON 更适合生成代码，避免转义问题 |
| 无构建步骤 | 纯 JS 直出 | 项目规模小，构建增加复杂度 |

## 🚀 本地搭建（5 步内）

### 前置条件

| 工具 | 要求 | 说明 |
|------|------|------|
| Chrome 浏览器 | 116+ | 需支持 Manifest V3 + Side Panel API |
| Git | 任意 | 克隆源码 |

> 没有构建步骤，没有 Node.js 依赖，不需要 `npm install`。

### 安装步骤

**Step 1：获取源码**

```bash
git clone https://github.com/zhuweileo/Monkey.git
```

**Step 2：加载扩展到 Chrome**

1. 地址栏输入 `chrome://extensions`，开启「开发者模式」
2. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的根目录

**Step 3：配置 API Key**

首次安装自动弹出设置页：选择 AI 服务商 → 填入 API Key → 测试连接 → 保存。

**Step 4：验证**

打开任意网页 → 点击工具栏猴子图标 → 输入「隐藏页面所有图片」→ 生成脚本 → 保存并执行 → 图片消失即成功。

> 修改代码后，在 `chrome://extensions` 点击扩展卡片的刷新按钮即可热更新。

## 🐛 调试指南

### 各组件调试入口

| 组件 | 打开方式 |
|------|---------|
| **Sidepanel** | 右键侧边栏空白处 → 检查 |
| **Background SW** | `chrome://extensions` → 扩展卡片 → "Service Worker" 链接 |
| **Content Script** | 目标页面 F12 → Console，过滤 `[monkey` |
| **注入的脚本** | 目标页面 F12 → Console（MAIN world） |

### 常见问题排查

**点击图标没反应**：确认扩展已启用 → 检查 `manifest.json` 中 `side_panel` 配置 → 查看 Service Worker Console 是否报错。

**脚本生成后没有执行**：检查 `targetTabId` 是否有效 → 确认目标页面 URL 以 `http` 开头（`chrome://` 页面不支持）。

**API 调用返回 401**：重新测试连接 → 确认 provider 选择正确（OpenAI 用 `Authorization: Bearer`，Claude 用 `x-api-key`）。

**SPA 页面路由切换后脚本不生效**：已知限制（TODO-2），当前只监听整页刷新，计划用 `webNavigation.onHistoryStateUpdated` 解决。

## 🎯 适合谁用

| 人群 | 用途 |
|------|------|
| **前端开发者** | 学习 Chrome Extension MV3 架构、脚本注入、SSE 流式处理 |
| **效率工具爱好者** | 用自然语言快速定制网页行为（去广告、改布局、自动化操作） |
| **AI 应用开发者** | 参考如何设计 Prompt 约束 AI 输出格式（XML 标签 + DOM 快照） |
| **Chrome 扩展初学者** | 项目仅 2600 行，是学习 MV3 的优秀范例 |

## 📖 进阶阅读

- [项目 Onboarding 指南](./onboarding.md) — 10 分钟完整上手，含常见开发任务和术语表
- [整体架构设计](./architecture-overview.md) — 模块职责、数据模型、消息协议、状态机详解
- [脚本注入与流式生成](./script-injection-and-streaming.md) — CSP 绕过原理、SSE 解析、实时代码预览的实现细节
- [源码仓库](https://github.com/zhuweileo/Monkey) — GitHub 原始仓库
