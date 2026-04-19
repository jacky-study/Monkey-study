---
article_id: OBA-296vrdvo
tags: [open-source, Monkey, onboarding.md, chrome-extension, ai, claude]
type: learning
updated_at: 2026-04-04
---

# Monkey — 项目 Onboarding 指南

> 一份面向开发者的完整上手文档，帮助你在 10 分钟内理解项目并跑通本地环境。

---

## 一、项目概览

Monkey 是一个 **Chrome 扩展（Manifest V3）**，让用户通过自然语言描述需求，AI 自动生成用户脚本（UserScript）并注入到任意网页。

**核心价值主张**：不会写代码的人，也能用一句话改造网页。

**技术特征**：
- 纯 JavaScript，**无构建步骤、无框架、无包管理**
- 所有数据存储在浏览器本地（`chrome.storage.local`）
- 支持多 AI 服务商（OpenAI / Claude / 任意兼容接口）
- BYOK（Bring Your Own Key）模式，项目本身不收集任何数据

**代码规模**：约 2,600 行（含 HTML/CSS/JS），10 个源文件。

---

## 二、架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome 浏览器                            │
│                                                             │
│  ┌──────────────┐     ┌──────────────────────────────────┐ │
│  │   Sidepanel   │────>│         目标网页 (任意)           │ │
│  │  (主界面 UI)   │     │                                  │ │
│  │              │     │  ┌──────────────────────────────┐ │ │
│  │ • 输入需求    │     │  │   注入的用户脚本 (MAIN world) │ │ │
│  │ • 流式预览    │     │  └──────────────────────────────┘ │ │
│  │ • 确认/保存   │     │                                  │ │
│  │ • 脚本管理    │     │  ┌──────────────────────────────┐ │ │
│  └──────┬───────┘     │  │  Content Script (消息 shim)   │ │ │
│         │             │  └──────────────────────────────┘ │ │
│         │             └──────────────────────────────────┘ │
│         │                                                    │
│         v                                                    │
│  ┌──────────────────┐     ┌────────────────┐                │
│  │  Background SW    │────>│ chrome.storage │                │
│  │ (消息路由/存储)    │     │    .local      │                │
│  │                  │<────│                │                │
│  │ • CRUD 脚本      │     │ • scripts[]    │                │
│  │ • 页面加载注入    │     │ • apiKey       │                │
│  │ • URL 模式匹配    │     │ • apiEndpoint  │                │
│  └──────────────────┘     │ • modelId      │                │
│                           │ • provider     │                │
│                           └────────────────┘                │
│                                                             │
│  ┌──────────────────┐                                      │
│  │  Options Page     │                                      │
│  │  (设置页/引导)     │                                      │
│  │ • API Key 配置    │                                      │
│  │ • 服务商选择      │                                      │
│  │ • 连接测试        │                                      │
│  └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
         │
         v (fetch API, SSE 流式)
  ┌──────────────────────────────┐
  │     外部 AI 服务               │
  │  • OpenAI (gpt-4o)           │
  │  • Anthropic (claude-sonnet) │
  │  • 任意 OpenAI 兼容接口       │
  └──────────────────────────────┘
```

### 数据流（核心路径：生成脚本）

```
用户输入需求
    │
    v
Sidepanel 捕获当前 Tab ID (lastFocusedWindow)
    │
    v
注入 DOM 快照提取脚本 → 获取页面真实结构 (ID/表单/按钮)
    │
    v
构建 System Prompt (URL + DOM 结构 + 规则)
    │
    v
调用 AI API (SSE 流式) ──→ 实时预览代码
    │
    v
解析 AI 响应 (<DESCRIPTION> + <SCRIPT> 标签)
    │
    v
用户确认 → 发送 SAVE_SCRIPT 到 Background SW
    │
    ├──→ 保存到 chrome.storage.local
    └──→ executeScript(world:'MAIN') 在目标 Tab 执行脚本
```

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 扩展规范 | Chrome Manifest V3 | 权限、生命周期管理 |
| UI | 原生 HTML/CSS/JS | Sidepanel + Options 页面 |
| 后台 | Service Worker | 消息路由、存储管理、自动注入 |
| 注入 | `chrome.scripting.executeScript` | 在 MAIN world 执行用户脚本 |
| 存储 | `chrome.storage.local` | 脚本和配置的持久化 |
| AI 接口 | OpenAI SSE / Anthropic SSE | 流式生成脚本 |
| 设计系统 | CSS 自定义属性 (`tokens.css`) | 全局设计令牌 |

---

## 三、关键文件地图

### 按重要性排序（建议阅读顺序）

| 优先级 | 文件路径 | 行数 | 职责 | 何时阅读 |
|--------|---------|------|------|---------|
| 1 | `manifest.json` | 46 | 扩展配置：权限、入口、脚本注册 | 第一天 |
| 2 | `sidepanel/sidepanel.js` | 860 | **核心文件**：AI 调用、DOM 快照、状态机、脚本管理 | 第一天 |
| 3 | `background/service-worker.js` | 229 | 消息路由、存储 CRUD、自动注入、URL 匹配 | 第一天 |
| 4 | `sidepanel/index.html` | 146 | 主 UI：5 种生成阶段状态 + 脚本列表 | 第一天 |
| 5 | `options/options.js` | 295 | BYOK 配置、多服务商切换、连接测试 | 第一周 |
| 6 | `sidepanel/sidepanel.css` | 572 | 完整 UI 样式，状态驱动设计 | 按需 |
| 7 | `options/index.html` | 115 | 设置页 UI 结构 | 按需 |
| 8 | `design/tokens.css` | 45 | 全局 CSS 令牌（颜色、间距、字体） | 按需 |
| 9 | `options/options.css` | 266 | 设置页样式 | 按需 |
| 10 | `content/content.js` | 16 | 轻量 shim，保持消息通道存活 | 按需 |

### 高风险文件（修改需谨慎）

| 文件 | 风险 | 说明 |
|------|------|------|
| `manifest.json` | 权限变更可能导致扩展被 Chrome Web Store 拒绝 | `host_permissions` 和 `permissions` 需最小化 |
| `background/service-worker.js` | 存储并发写入可能导致数据丢失 | 该文件是 `chrome.storage.local` 的唯一写入者 |
| `sidepanel/sidepanel.js:449-547` | AI 流式解析逻辑，Claude/OpenAI 格式不同 | 修改需同时测试两种服务商 |

---

## 四、核心设计决策

| 问题 | 方案 | 原因 |
|------|------|------|
| 脚本注入方式 | `chrome.scripting.executeScript(world:'MAIN')` | `<script>` 标签受页面 CSP 限制，此 API 明确豁免 |
| AI 调用位置 | Sidepanel（持久页面） | 避开 MV3 Service Worker 30 秒空闲超时 |
| 存储单写者 | Background SW 统一处理所有写操作 | 防止并发写入竞态条件 |
| Tab 定位 | `lastFocusedWindow:true` | Sidepanel 不是 tab，`currentWindow` 不可靠 |
| DOM 快照 | 生成前注入提取脚本获取真实结构 | 避免 AI 幻觉出错误的 CSS 选择器 |
| eval 执行 | `(0, eval)(src)` 间接 eval | 在 MAIN world 的全局作用域执行代码 |
| 无构建步骤 | 纯 JS 直出 | 项目规模小，构建会增加开发复杂度 |

### 消息协议

Background SW 和 Sidepanel 之间通过 `chrome.runtime.sendMessage` 通信：

| 消息类型 | 方向 | 说明 |
|----------|------|------|
| `GET_SCRIPTS` | Sidepanel → BG | 获取匹配 URL 的已启用脚本 |
| `SAVE_SCRIPT` | Sidepanel → BG | 保存新脚本 |
| `UPDATE_SCRIPT` | Sidepanel → BG | 更新脚本（启用/禁用/编辑） |
| `DELETE_SCRIPT` | Sidepanel → BG | 删除脚本 |
| `EXECUTE_IMMEDIATE` | Sidepanel → BG | 立即在指定 Tab 执行脚本 |
| `SCRIPT_UPDATED` | BG → Content | 广播脚本变更通知 |

### StoredScript 数据结构

```typescript
interface StoredScript {
  id: string;          // crypto.randomUUID()
  name: string;        // 来自 @name，默认"未命名脚本"
  code: string;        // 完整脚本含 ==UserScript== 头
  pattern: string;     // @match 值（Tampermonkey glob 语法）
  runAt: 'document-end' | 'document-start' | 'document-idle';
  enabled: boolean;
  createdAt: number;   // Date.now()
}
```

### URL 模式匹配（`globToRegex`）

支持 Tampermonkey `@match` glob 语法：
- `https://example.com/*` — 匹配该域名所有路径
- `https://*.example.com/*` — 匹配所有子域名
- `*://*/*` — 匹配所有 HTTP/HTTPS 页面
- `<all_urls>` — 匹配所有页面

---

## 五、本地搭建（目标：< 5 分钟）

### 前置条件

| 工具 | 要求 | 说明 |
|------|------|------|
| Chrome 浏览器 | 116+ | 需要支持 Manifest V3 + Side Panel API |
| 文本编辑器 | 任意 | VS Code / WebStorm / Sublime 均可 |
| Git | 任意 | 克隆源码 |

> 没有构建步骤，没有 Node.js 依赖，不需要 `npm install`。

### 安装步骤

**Step 1：获取源码**

```bash
git clone https://github.com/zhuweileo/Monkey.git
```

**Step 2：加载扩展到 Chrome**

1. 打开 Chrome，地址栏输入 `chrome://extensions`
2. 右上角开启 **「开发者模式」** 开关
3. 点击 **「加载已解压的扩展程序」**
4. 选择包含 `manifest.json` 的根目录
5. 扩展图标 🐵 出现在工具栏

**Step 3：配置 API Key**

首次安装会自动弹出设置页：
1. 选择 AI 服务商（OpenAI / Claude / 其他）
2. 填入 API Key
3. 点击「测试连接」验证
4. 点击「保存设置」

**Step 4：验证**

1. 打开任意网页
2. 点击工具栏 🐵 图标 → 侧边栏打开
3. 输入「隐藏页面所有图片」→ 点击「生成脚本」
4. 看到 AI 流式生成代码 → 点击「保存并执行」
5. 页面图片消失 = 成功

### 修改代码后的热更新

在 `chrome://extensions` 页面点击扩展卡片上的 **刷新按钮 🔄** 即可生效，无需重启浏览器。

---

## 六、调试指南

### 各组件的调试入口

| 组件 | 打开方式 | 说明 |
|------|---------|------|
| **Sidepanel** | 右键侧边栏空白处 → 检查 | 主 UI 的 Console/Network/Elements |
| **Background SW** | `chrome://extensions` → 扩展卡片 → "Service Worker" 链接 | 后台日志、消息路由 |
| **Content Script** | 目标页面 F12 → Console，过滤 `[monkey` | 消息 shim 日志 |
| **注入的脚本** | 目标页面 F12 → Console | 用户脚本运行在 MAIN world |

### 常见问题排查

**问题：点击 🐵 图标没反应**

```
原因：Side Panel 未注册或权限不足
排查：
  1. 打开 chrome://extensions 确认扩展已启用
  2. 检查 manifest.json 中 side_panel 配置
  3. 打开 Service Worker Console 查看是否有报错
```

**问题：脚本生成后没有执行**

```
原因：executeScript 失败（通常是 Tab ID 过期）
排查：
  1. 打开 Sidepanel Console，搜索 [monkey] 日志
  2. 检查 targetTabId 是否有效
  3. 确认目标页面 URL 以 http 开头（不支持 chrome:// 页面）
```

**问题：API 调用返回 401**

```
原因：API Key 无效或过期
排查：
  1. 打开设置页，重新测试连接
  2. 确认 provider 选择正确（OpenAI vs Claude 的认证头不同）
  3. 检查 Network 面板中请求的 Authorization / x-api-key 头
```

**问题：生成的脚本选择器不对**

```
原因：DOM 快照提取失败，AI 只能猜选择器
排查：
  1. 在 Sidepanel Console 查看是否有 "DOM snapshot failed" 警告
  2. 某些页面（如 chrome:// 页面）不支持 scripting.executeScript
  3. 检查 _domExtractor 返回的数据是否为空
```

**问题：脚本在 SPA 页面路由切换后不再生效**

```
原因：当前只监听 tabs.onUpdated（整页刷新），未监听 SPA 路由变化
状态：这是已知 TODO（TODO-2），计划用 chrome.webNavigation.onHistoryStateUpdated
```

### 关键日志标记

代码中使用 `[monkey]` 前缀标记日志，在 Console 中过滤即可定位：

```javascript
console.log('[monkey] startGenerate: targetTabId=', tabId, 'url=', currentUrl);
console.log('[monkey] executeScriptInTab: tabId=', tabId, 'code length=', code.length);
console.warn('[monkey] DOM snapshot failed:', err.message);
console.warn('[monkey] auto-inject failed for tab', tabId, ':', err.message);
```

---

## 七、常见开发任务

### 任务 1：添加新的 AI 服务商

1. 在 `options/options.js` 的 `PROVIDER_DEFAULTS` 中添加新服务商配置
2. 在 `options/index.html` 的 `#provider-pills` 中添加新 pill 按钮
3. 在 `sidepanel/sidepanel.js` 的 `callAIStreaming()` 中添加新的 SSE 解析逻辑
4. 在 `options/options.js` 的 `testConnection()` 中添加新的认证头逻辑
5. 测试流式生成 + 连接测试

### 任务 2：修改脚本存储结构

1. 修改 `background/service-worker.js` 中 `StoredScript` 相关的 CRUD 函数
2. 注意向后兼容——旧结构的脚本需要能正常加载
3. `saveScripts()` 是唯一写入入口，确保所有写操作经过这里

### 任务 3：添加新的 UI 状态

1. 在 `sidepanel/index.html` 中添加新的状态 `<div>`
2. 在 `sidepanel/sidepanel.js` 的 `els` 对象中注册 DOM 引用
3. 在 `switchGeneratePhase()` 中添加新阶段名称
4. 在 `bindEvents()` 中绑定事件

### 任务 4：修改 URL 匹配规则

1. 定位 `background/service-worker.js` 中的 `matchesPattern()` 和 `globToRegex()`
2. 这些函数同时在 `tabs.onUpdated`（自动注入）和 `handleGetScripts`（手动查询）中使用
3. 修改后需在多种 URL 格式上测试：带端口、带查询参数、带 hash

---

## 八、已知技术债务与 TODO

| 编号 | 内容 | 影响 |
|------|------|------|
| TODO-1 | 脚本执行报错后自动反馈 AI 修复 | 目前报错静默丢失 |
| TODO-2 | SPA 路由变化监听 | 单页应用切换路由后脚本不重新执行 |
| TODO-3 | 脚本导出为 `.user.js` 文件 | 无法兼容 Tampermonkey |
| — | 无单元测试 | 修改 URL 匹配等核心逻辑无回归保障 |
| — | 无 CI/CD | 完全手动发布 |

---

## 九、项目文件完整清单

```
Monkey/
├── manifest.json                    # Chrome 扩展配置（MV3）
├── README.md                        # 项目说明文档
├── TODOS.md                         # 待办事项
├── background/
│   └── service-worker.js            # 后台服务：消息路由 + 存储 + 自动注入
├── content/
│   └── content.js                   # 内容脚本：消息 shim（16 行）
├── sidepanel/
│   ├── index.html                   # 主界面：5 种生成状态 + 脚本列表
│   ├── sidepanel.css                # 主界面样式（572 行）
│   └── sidepanel.js                 # 主逻辑：AI 调用 + DOM 快照 + 状态机
├── options/
│   ├── index.html                   # 设置页 UI
│   ├── options.css                  # 设置页样式
│   └── options.js                   # BYOK 配置 + 连接测试
├── design/
│   └── tokens.css                   # 全局 CSS 设计令牌
├── icons/
│   ├── icon16.png                   # 扩展图标 16x16
│   ├── icon48.png                   # 扩展图标 48x48
│   └── icon128.png                  # 扩展图标 128x128
└── shotcuts/
    ├── image.png                    # Demo 截图 1
    └── image2.png                   # Demo 截图 2
```

---

## 十、术语表

| 术语 | 含义 |
|------|------|
| **MV3** | Manifest Version 3，Chrome 扩展最新规范 |
| **Service Worker** | MV3 后台脚本，替代旧的 Background Page，有 30 秒空闲超时限制 |
| **Sidepanel** | Chrome 侧边栏 UI，作为持久页面不受 SW 超时限制 |
| **MAIN world** | `executeScript` 的执行环境，与页面 JS 共享全局作用域 |
| **CSP** | Content Security Policy，页面安全策略，限制内联脚本执行 |
| **BYOK** | Bring Your Own Key，用户自带 API Key 的模式 |
| **SSE** | Server-Sent Events，AI 流式响应的传输协议 |
| **UserScript** | 用户脚本，Tampermonkey/Greasemonkey 格式的浏览器脚本 |
| **glob 模式** | URL 匹配模式，如 `https://*.example.com/*` |
| **DOM 快照** | 在 AI 生成前提取的页面真实 DOM 结构摘要 |
