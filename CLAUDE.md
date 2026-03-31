# Monkey-study — zhuweileo/Monkey 仓库研究项目

> 本项目用于研究 [zhuweileo/Monkey](https://github.com/zhuweileo/Monkey) 仓库的技术实现

## 项目简介

Monkey 是一个 Chrome 扩展（Manifest V3），让用户通过自然语言描述需求，AI 帮你生成用户脚本并自动注入到任意网页中。

- **技术栈**: Chrome Extension (Manifest V3), JavaScript, OpenAI/Claude API
- **核心特性**: DOM 感知、流式响应、BYOK（自带 API Key）、域名匹配自动注入

## 目录结构

```
Monkey-study/
├── CLAUDE.md              # 本文件 - 项目说明
├── .study-meta.json       # 研究元数据（v2）
├── Monkey/                # 源码（来自 GitHub）
│   ├── background/        # Service Worker
│   ├── content/           # Content Script（注入网页）
│   ├── sidepanel/         # 侧边栏 UI
│   ├── options/           # 设置页面
│   ├── design/            # 设计令牌
│   └── manifest.json      # Chrome 扩展配置
├── scripts/               # 工具脚本
│   └── repo-study-status.sh
└── notes/                 # 研究笔记
```

## 研究课题

- 整体架构设计

## 常用命令

```bash
# 查看研究状态
scripts/repo-study-status.sh --check-remote

# JSON 格式
scripts/repo-study-status.sh --json --check-remote
```
