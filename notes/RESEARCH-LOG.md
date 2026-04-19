---
article_id: OBA-te9op7ij
tags: [open-source, Monkey, RESEARCH-LOG.md, chrome-extension, ai, git]
type: note
updated_at: 2026-04-01
---

# 研究日志

## 2026-03-31: Monkey 整体架构设计

**研究主题**: 整体架构设计

**研究问题**: Monkey 项目的整体架构设计

**仓库**: [Monkey](https://github.com/zhuweileo/Monkey)

**核心发现**:
- Monkey 是 Chrome Extension (Manifest V3) 架构，由四大模块组成：Service Worker（后台中枢）、Side Panel（用户交互）、Content Script（极简 shim）、Options Page（设置）
- 核心创新：DOM 快照 + AI Prompt，让 AI 基于真实页面结构生成精准选择器
- 使用 `world: 'MAIN'` + 间接 eval 绕过页面 CSP 限制
- AI 调用放在 Side Panel 而非 Service Worker，避免 30 秒超时
- 零依赖纯 JS 架构，约 1600 行代码，极简设计

**进度（持续更新）**:
- questions: 1
- notes: 1
- guides: 0
- skill templates: 0
- runnable skills: 0

---

## 2026-03-31: 脚本注入与流式生成机制

**研究主题**: 脚本注入与流式生成

**研究问题**: Monkey 的脚本注入与流式生成机制

**仓库**: [Monkey](https://github.com/zhuweileo/Monkey)

**核心发现**:
- 使用 `chrome.scripting.executeScript({ world: 'MAIN' })` 绕过页面 CSP，间接 eval `(0, eval)(src)` 在全局作用域执行
- 两个注入时机：用户确认后立即执行 + 页面加载自动注入
- SSE 流式响应：ReadableStream → TextDecoder → 逐行解析 data: 前缀
- AI 输出使用 XML 标签格式（`<DESCRIPTION>` + `<SCRIPT>`），正则解析
- AbortController 实现取消机制
- Content Script 极简设计，仅保持消息通道

**进度（持续更新）**:
- questions: 1
- notes: 1
- guides: 0
- skill templates: 0
- runnable skills: 0
