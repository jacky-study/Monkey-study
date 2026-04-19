---
article_id: OBA-56n0ddy6
tags: [open-source, Monkey, architecture-overview.md, chrome-extension, ai]
type: learning
updated_at: 2026-04-01
---

# Monkey 整体架构设计

> Monkey 是一个 Chrome 扩展（Manifest V3），通过自然语言描述需求，AI 生成用户脚本并自动注入网页。整个项目零依赖、约 1600 行 JS，架构清晰简洁。

## 一、项目背景

Monkey 解决的问题是：**让不懂代码的人也能定制网页行为**。用户只需描述"我想让这个页面做什么"，AI 就会生成对应的 JavaScript 脚本，并自动注入到匹配的网页中。

核心设计理念：
- **隐私优先**：BYOK（自带 API Key），数据不经过第三方
- **零门槛**：不需要写代码，自然语言描述即可
- **持久化**：脚本保存到本地，匹配域名自动执行

## 二、模块架构

### 2.1 四大模块

| 模块 | 文件 | 职责 |
|------|------|------|
| Service Worker | `background/service-worker.js` | 后台中枢：消息路由、脚本存储、页面加载监听、自动注入 |
| Side Panel | `sidepanel/sidepanel.js` + `index.html` | 用户交互：AI 调用、流式预览、脚本管理 |
| Content Script | `content/content.js` | 极简 shim，仅保持消息监听通道 |
| Options Page | `options/options.js` + `index.html` | 设置页面：API Key 配置、服务商选择、连接测试 |
| Design Tokens | `design/tokens.css` | 集中管理 UI 设计变量 |

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     Monkey Chrome Extension                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    消息传递     ┌────────────────────┐    │
│  │   Side Panel      │ ◄──────────► │  Service Worker     │    │
│  │   (用户交互)       │              │  (后台中枢)          │    │
│  │                   │              │                      │    │
│  │  · 输入描述       │  SAVE_SCRIPT  │  · 脚本存储管理      │    │
│  │  · DOM 快照提取   │  GET_SCRIPTS  │  · URL 模式匹配      │    │
│  │  · AI 调用(流式)  │  UPDATE_SCRIPT│  · 页面加载监听      │    │
│  │  · 脚本确认/管理  │  DELETE_SCRIPT│  · 脚本自动注入      │    │
│  │                   │  EXECUTE_IMM  │                      │    │
│  └──────────────────┘              └────────────────────┘    │
│         │                                   │                  │
│         │  chrome.scripting.executeScript   │  tabs.onUpdated  │
│         │  (world: 'MAIN')                  │  (自动注入)       │
│         ▼                                   ▼                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              目标网页 (MAIN World)                        │  │
│  │                                                           │  │
│  │  Content Script (极简 shim，仅保持消息监听)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │   Options Page    │  配置 API Key / 服务商 / 模型             │
│  └──────────────────┘                                           │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  chrome.storage   │  本地存储 (scripts, apiKey, settings)    │
│  │     .local        │  隐私优先，数据不出浏览器                  │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

## 三、核心流程

### 3.1 脚本生成流程（状态机）

Side Panel 使用状态机管理生成流程：

```
input (输入描述)
  ↓ 点击"生成脚本"
streaming (AI 流式生成中)
  ↓ 生成完成
confirm (确认：查看描述/代码/URL范围)
  ↓ 点击"保存并执行"
success (成功，2秒后自动回到 input)
```

任何阶段出错进入 `error` 状态，提供重试或重新生成选项。

### 3.2 完整数据流

```
用户在 Side Panel 输入描述
        ↓
① 提取目标页面 DOM 快照 (sidepanel → scripting.executeScript → 目标页面)
        ↓
② 构建 System Prompt (DOM 快照 + 当前 URL + 生成规则)
        ↓
③ 调用 AI API 流式生成 (sidepanel → fetch SSE → AI 服务商)
        ↓
④ 实时预览代码 (检测到 <SCRIPT> 标签后开始展示)
        ↓
⑤ 解析 AI 响应 (XML 标签: <DESCRIPTION> + <SCRIPT>)
        ↓
⑥ 用户确认 (查看描述/代码/URL范围)
        ↓
⑦ 保存脚本 (sidepanel → sendMessage → service-worker → chrome.storage)
        ↓
⑧ 立即执行 (sidepanel → scripting.executeScript world:MAIN → 目标页面)
        ↓
⑨ 下次访问自动执行 (tabs.onUpdated → URL 匹配 → 自动注入)
```

## 四、关键设计决策

### 4.1 AI 调用放在 Side Panel 而非 Service Worker

Service Worker 有 30 秒超时限制，AI 生成脚本可能需要更长时间。Side Panel 是持久页面，没有这个限制。

```javascript
// sidepanel.js 头部注释
// All AI calls happen here (persistent page, no SW 30s timeout)
```

### 4.2 DOM 快照策略

在调用 AI 前，Monkey 通过 `chrome.scripting.executeScript` 注入 `_domExtractor` 函数到目标页面，提取页面结构信息：

- 交互元素（input、button、select 等）— 最多 60 个
- 地标元素（h1-h3、nav、main、form 等）— 最多 20 个
- 链接 — 最多 20 个
- 所有带 ID 的元素 — 最多 60 个

这些信息被注入 System Prompt，让 AI 基于真实 DOM 生成精准选择器。

### 4.3 world:'MAIN' 绕过 CSP

使用 `chrome.scripting.executeScript({ world: 'MAIN' })` 注入代码到页面的主世界，完全绕过 CSP 限制。间接 eval `(0, eval)(src)` 让代码在全局作用域执行。

```javascript
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: (src) => (0, eval)(src), // 间接 eval，全局作用域
  args: [script.code],
});
```

### 4.4 无框架纯 JS

整个项目没有使用 React/Vue 等框架，全部使用原生 JavaScript + CSS。好处：
- 零依赖，构建简单
- 加载快，体积小
- 代码量极少（~1600 行 JS）

### 4.5 SSE 流式预览

在流式接收 AI 响应时，一旦检测到 `<SCRIPT>` 标签就开始展示代码预览（最后 600 字符），给用户即时反馈。

### 4.6 多服务商支持

Options Page 支持三种 AI 服务商，每种有独立的默认配置和连接测试逻辑：

| 服务商 | 默认 Endpoint | 默认模型 |
|--------|--------------|---------|
| OpenAI | `api.openai.com/v1/chat/completions` | gpt-4o |
| Claude | `api.anthropic.com/v1/messages` | claude-sonnet-4-6 |
| 自定义 | 用户填写 | 用户填写 |

设计细节：
- 内存缓存 `savedFields` 保证切换服务商不丢失输入
- 429（频率限制）也视为连接成功

## 五、数据模型

### 5.1 Script 对象

```javascript
{
  id: crypto.randomUUID(),    // 唯一标识
  name: '脚本名称',            // 从 @name 提取
  code: '// ==UserScript==...', // 完整脚本代码
  pattern: 'https://*.example.com/*', // URL 匹配模式
  runAt: 'document-end',       // 执行时机
  enabled: true,               // 是否启用
  createdAt: Date.now(),       // 创建时间戳
}
```

### 5.2 存储结构

```javascript
chrome.storage.local: {
  scripts: Script[],           // 所有脚本
  apiKey: string,              // API 密钥
  apiEndpoint: string,         // API 端点
  modelId: string,             // 模型 ID
  provider: 'openai' | 'claude' | 'custom', // 服务商
}
```

## 六、消息通信协议

### 6.1 Service Worker 消息路由

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `GET_SCRIPTS` | Side Panel → SW | 按 URL 获取匹配的已启用脚本 |
| `SAVE_SCRIPT` | Side Panel → SW | 保存新脚本 |
| `UPDATE_SCRIPT` | Side Panel → SW | 更新脚本（编辑/启用/禁用） |
| `DELETE_SCRIPT` | Side Panel → SW | 删除脚本 |
| `EXECUTE_IMMEDIATE` | Side Panel → SW | 立即在指定 Tab 执行脚本 |
| `SCRIPT_UPDATED` | SW → Content Scripts | 广播脚本变更通知 |

### 6.2 URL 模式匹配

实现了 Tampermonkey 兼容的 `@match` glob 语法，支持：
- `https://example.com/*`
- `https://*.example.com/*`
- `*://*/*`（所有 URL）
- `<all_urls>`

匹配逻辑在 `globToRegex()` 函数中实现，将 glob 模式转换为正则表达式。

## 七、设计亮点总结

1. **极简架构**：零依赖，4 个 JS 文件，约 1600 行代码
2. **DOM 感知 AI**：提取真实页面结构，避免 AI 幻觉选择器
3. **CSP 绕过**：`world: 'MAIN'` + 间接 eval，兼容所有网页
4. **流式体验**：SSE 实时预览，用户无需等待完整响应
5. **隐私优先**：BYOK 模式，数据不出浏览器
6. **设计令牌**：集中管理 UI 变量，保持一致性
7. **内存缓存**：服务商切换不丢失输入，用户体验细节到位

## 八、未来规划（来自 TODOS.md）

- **v2 AI 修复功能**：脚本报错时提供"让 AI 修复"按钮
- **SPA 路由监听**：使用 `webNavigation.onHistoryStateUpdated` 监听 SPA 内路由变化
- **.user.js 导出**：导出标准 Tampermonkey 格式文件
