# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

基于 Claude Code 源码逆向分析构建的教学版 AI 编码助手 CLI。900 行 TypeScript，覆盖原始系统核心架构 90% 的设计思想。

## Commands

```bash
npm run dev              # 启动 CLI
npm run dev -- --verbose # 启动 CLI（教学模式，显示 Agentic Loop 细节）
npm run build            # TypeScript 编译
npm test               # 运行全部测试（vitest, 48 个测试）
npm run test:watch      # 监听模式运行测试
npx tsx demo-chat.ts   # 单次对话验证（阶段 1.5）
npx tsx demo-loop.ts   # Agentic Loop 验证（阶段 2.5）
```

## Architecture

```
index.ts (CLI入口, Commander.js)
  → repl.ts (readline REPL, terminal:false 避免 PTY 双回显)
    → queryLoop.ts (核心: while(true) + needsFollowUp 标志)
      → stream.ts (流式 API 调用, input_json_delta 增量拼接)
      → toolRunner.ts (权限检查 allow/deny/ask → 工具执行)
```

**关键设计决策：**

- **needsFollowUp 标志**：不用 `stop_reason` 判断循环是否继续（原始代码注释说 stop_reason 不可靠），用 `needsFollowUp = true` 在收到 tool_use 时设置
- **terminal: false**：readline 强制关闭终端处理，避免 Windows PTY 双回显
- **ZHIPU_API_KEY**：使用智谱 Anthropic 兼容接口（`https://open.bigmodel.cn/api/anthropic`），非 Anthropic 官方 API
- **tool_result 在 user message 中**：Anthropic API 要求

## Design Principles

### 教学透明性（Teaching Transparency）
`--verbose` 模式实时显示 Agentic Loop 每一步（Turn 开始/结束、工具调用、token 消耗）。任何功能改进必须同步更新 verbose 日志。

### 上下文压缩
当前未实现。长对话超出模型上下文窗口时，API 报错，对话上下文丢失。阶段 9 将实现 auto-compact。

## Tools

5 个核心工具在 `src/tools/` 下，通过 `src/tools/registry.ts` 的 `getAllTools()` 注册：
- **BashTool** — Shell 命令执行，只读白名单自动放行，危险命令拦截
- **FileReadTool** — 文件读取，带行号（cat -n 风格），支持 offset/limit
- **FileEditTool** — 精确字符串替换，old_string 必须唯一
- **GlobTool** — fast-glob 文件匹配，100 结果上限
- **GrepTool** — ripgrep 优先，Node.js 回退

## Testing

测试框架：**vitest**。测试文件在 `tests/` 下：
- `tests/unit/` — 确定性组件测试（cost, history, toolRunner, tools, systemPrompt）
- `tests/integration/` — Mock LLM 集成测试（queryLoop 的 9 个场景）
- `tests/helpers/mockClient.ts` — Mock API 客户端和事件构造器

```bash
npm test                # 运行全部 48 个测试
npx vitest run tests/unit/tools.test.ts  # 运行单个测试文件
```

## REPL 斜杠命令

`/help` `/quit` `/exit` `/clear` `/cost` `/history`

## Environment

- `ZHIPU_API_KEY` — 智谱 API 密钥（格式: `id.secret`）
- `ANTHROPIC_BASE_URL` — 自定义 API 端点（默认智谱）
- `ANTHROPIC_MODEL` — 模型名称（默认 glm-5-turbo）

## 文档

- `MVP_BUILD_GUIDE.md` — 分阶段构建指南（阶段 0-11），每阶段有完整代码
- `docs/ai-agent-testing.html` — AI Agent 测试策略论述（浏览器可打开）
