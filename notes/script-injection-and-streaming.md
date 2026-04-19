---
article_id: OBA-7327s3jp
tags: [open-source, Monkey, script-injection-and-streaming.md, chrome-extension, ai]
type: learning
updated_at: 2026-04-01
---

# 脚本注入与流式生成机制

> 深入分析 Monkey 的两个核心技术实现：如何安全地将 AI 代码注入任意网页（绕过 CSP），以及如何实现流式预览的代码生成体验。

## 一、脚本注入机制

### 1.1 核心注入 API

Monkey 的所有脚本注入都使用同一个核心 API：

```javascript
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',                    // 注入到页面主世界
  func: (src) => (0, eval)(src),    // 间接 eval，全局作用域
  args: [script.code],              // 脚本代码作为参数
});
```

#### world: 'MAIN' — 绕过 CSP

Chrome Extension 的 `chrome.scripting.executeScript` 支持两种 world：
- `'ISOLATED'`（默认）：扩展的隔离世界，无法访问页面 JS 变量
- `'MAIN'`：页面的主世界，等同于在页面中直接执行 JS

当使用 `world: 'MAIN'` 时，注入的代码**不受页面 CSP 限制**。即使页面设置了严格的 `Content-Security-Policy`，`executeScript` 仍然可以执行。

源码注释解释了为什么不用 `<script>` 标签：
```javascript
// Use scripting.executeScript(world:'MAIN') — bypasses page CSP entirely.
// The <script> tag approach fails on pages with strict inline-src CSP (e.g. baidu.com).
```

#### (0, eval)(src) — 间接 eval

| 写法 | 类型 | 作用域 |
|------|------|--------|
| `eval(src)` | 直接 eval | 当前函数作用域 |
| `(0, eval)(src)` | 间接 eval | 全局作用域 |

`(0, eval)` 等价于 `window.eval`（间接调用），让生成的脚本代码在全局作用域执行，可以访问页面中的全局变量和函数。

### 1.2 两个注入时机

#### 时机一：用户确认后立即执行

用户在确认页面点击"好，保存并执行"后，Side Panel 直接调用 `executeScriptInTab`。

注意 `targetTabId` 是在点击"生成"按钮时就捕获的（不是在确认时），因为异步操作后 `lastFocusedWindow` 查询结果可能变化。

```javascript
// sidepanel.js:248 — 在 startGenerate 中捕获
const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
state.targetTabId = tabs[0]?.id ?? null;
```

#### 时机二：页面加载自动注入

Service Worker 监听 `chrome.tabs.onUpdated`，当页面加载完成时：

```javascript
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('http')) return;

  // 获取所有匹配的已启用脚本
  const matching = all
    .filter(s => s.enabled && matchesPattern(s.pattern, tab.url))
    .sort((a, b) => a.createdAt - b.createdAt);  // 按创建时间排序

  // 逐个注入
  for (const script of matching) {
    chrome.scripting.executeScript({ ... });
  }
});
```

### 1.3 Content Script 的极简设计

Content Script 在此架构中是一个**极简 shim**：

```javascript
(function () {
  'use strict';
  chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
    sendResponse({ ok: true });
  });
})();
```

唯一作用：保持消息监听通道。实际注入完全由 `chrome.scripting.executeScript(world: 'MAIN')` 完成。

## 二、流式生成机制

### 2.1 SSE 流式响应

使用标准 OpenAI SSE 协议，`stream: true`：

```javascript
const response = await fetch(settings.endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`,
  },
  body: JSON.stringify({
    model: settings.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ],
    stream: true,
    temperature: 0.2,   // 低温度，保证代码稳定性
  }),
  signal,   // AbortController.signal
});
```

### 2.2 流式解析

```
ReadableStream → TextDecoder → 按 \n 分行 → data: 前缀 → JSON.parse → delta.content
```

核心循环：

```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let accumulated = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;

    const parsed = JSON.parse(data);
    const delta = parsed.choices?.[0]?.delta?.content || '';
    accumulated += delta;

    // 实时预览...
  }
}
```

### 2.3 实时代码预览

当 `accumulated` 包含 `<SCRIPT>` 标签时开始预览：

```javascript
if (accumulated.includes('<SCRIPT>')) {
  const scriptStart = accumulated.indexOf('<SCRIPT>') + 8;
  const previewText = accumulated.slice(scriptStart)
    .replace(/```[a-z]*\n?/gi, '')  // 去掉 markdown 代码块
    .trim();
  els.streamingCodePreview.textContent = previewText.slice(-600);  // 最后 600 字符
}
```

设计选择：
- `textContent` 而非 `innerHTML`（防 XSS）
- 只展示最后 600 字符（避免预览区太长）
- 跳过 `<DESCRIPTION>` 阶段

### 2.4 AI 响应格式：XML 标签

System Prompt 约束 AI 使用 XML 标签格式输出：

```
<DESCRIPTION>
用中文简洁描述脚本做什么
</DESCRIPTION>
<SCRIPT>
// ==UserScript==
// @name        脚本名称
// @match       https://example.com/*
// ==/UserScript==
(function() { 'use strict'; })();
</SCRIPT>
```

解析使用正则：

```javascript
const descMatch = raw.match(/<DESCRIPTION>([\s\S]*?)<\/DESCRIPTION>/);
const scriptMatch = raw.match(/<SCRIPT>([\s\S]*?)<\/SCRIPT>/);
```

XML 标签格式的优点：
- 比 JSON 更适合 AI 生成代码（避免转义问题）
- 比 markdown 代码块更明确（不易混淆边界）
- 正则解析简单高效

### 2.5 取消机制

使用 `AbortController` 实现流式请求取消：

```javascript
// 创建
state.abortController = new AbortController();

// 传入 fetch
await fetch(url, { ..., signal: state.abortController.signal });

// 取消
function cancelGenerate() {
  state.abortController?.abort();
  switchGeneratePhase('input');
}
```

### 2.6 错误处理

| 错误类型 | 用户提示 |
|---------|---------|
| 解析无任何内容 | "生成结果不完整，请重试" |
| 解析无脚本部分 | "脚本生成不完整，请重试" |
| HTTP 401 | "你的 API Key 好像失效了" |
| HTTP 429 | "请求太频繁，稍等一下再试" |
| AbortError | 静默回到输入状态 |
| 其他 | "网络错误，请检查连接" |

## 三、可复用模式

### 模式 1：Chrome Extension 绕过 CSP 注入

```javascript
chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: (src) => (0, eval)(src),
  args: [yourCode],
});
```

### 模式 2：SSE 流式 + 实时预览

```javascript
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 解析 data: 行，更新 UI...
}
```

### 模式 3：XML 标签约束 AI 输出

Prompt 中要求 XML 格式，正则解析提取结构化数据。

## 四、关键代码位置

| 文件 | 行号 | 说明 |
|------|------|------|
| `sidepanel.js` | 442-507 | SSE 流式响应处理 |
| `sidepanel.js` | 488-499 | 实时代码预览 |
| `sidepanel.js` | 509-536 | AI 响应解析 |
| `sidepanel.js` | 563-579 | 脚本注入执行 |
| `service-worker.js` | 119-131 | Service Worker 中转执行 |
| `service-worker.js` | 145-168 | 页面加载自动注入 |
