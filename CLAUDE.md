# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

基于 Claude Code 源码逆向分析构建的教学版 AI 编码助手 CLI。TypeScript 实现，覆盖原始系统核心架构设计思想。使用智谱 AI Anthropic 兼容接口（非 Anthropic 官方 API）。

## Commands

```bash
npx tsx src/index.ts                          # 启动 CLI
npx tsx src/index.ts --verbose                # 教学模式（显示 Agentic Loop 细节）
npx tsx src/index.ts --dashboard              # 启动 Web 仪表盘 (http://localhost:3334)
npx tsx src/index.ts --continue               # 恢复最近会话
npx tsx src/index.ts --resume [id]            # 恢复指定会话
npm test                                      # 运行全部测试 (vitest, 85 tests)
npx vitest run tests/unit/dashboard.test.ts   # 运行单个测试文件
npx tsc --noEmit                              # 类型检查（不输出文件）
```

## Architecture

```
index.ts (CLI入口, Commander.js)
  → repl.ts (readline REPL, terminal:false 避免 Windows PTY 双回显)
    → queryLoop.ts (核心: while(true) async generator + needsFollowUp 标志)
      → stream.ts (流式 API 调用, input_json_delta 增量拼接)
        → toolRunner.ts (权限检查 allow/deny/ask → 工具执行)
```

### 关键设计决策

- **needsFollowUp 标志**：不用 `stop_reason` 判断循环是否继续（原始代码注释说 stop_reason 不可靠），收到 tool_use 时设为 true
- **terminal: false**：readline 强制关闭终端处理，避免 Windows PTY 双回显
- **tool_result 在 user message 中**：Anthropic API 要求
- **粘贴检测**：50ms 输入缓冲区分粘贴多行 vs 逐行输入
- **parseFailedIds**：追踪 JSON 解析失败的工具调用，返回可操作的错误信息给模型，避免无限重试

### 上下文压缩 (compactor.ts)

估算 token 数（Buffer.byteLength/3.5，支持 UTF-8 中文），阈值 115K（128K - 13K 安全余量，均可通过环境变量配置）。触发时用 LLM 摘要历史消息，保留最近 10 条。`/compact` 手动触发，自动压缩在每次发送前检查。

### 会话持久化 (session.ts)

JSON 文件存储在 `~/.claude-mvp/sessions/`，文件名格式 `session-{timestamp}.json`。退出时自动保存（含优雅关停），`--continue` 恢复最新，`--resume` 按指定 ID 或列出所有。加载时校验 ID 格式和数据结构，支持过期会话自动清理（`cleanupSessions()`）。

### Skill 系统 (discovery.ts)

扫描 `{cwd}/.claude/skills/*/SKILL.md` 和 `~/.claude/skills/*/SKILL.md`。解析 YAML frontmatter（name, description, version, entry_point, tags），提取触发关键词和用法示例。Skill 不注册为 ToolDefinition，通过系统提示词注入，模型通过 BashTool 间接调用。

### Web 仪表盘 (dashboard.ts)

HTTP + WebSocket 服务器（端口 3334），内嵌 Catppuccin Mocha 风格 HTML。debugLogger 的 `setLogBroadcast()` 将日志条目实时推送给浏览器。`stopDashboard()` 返回 Promise，需 await 确保端口释放。包含 WebSocket 断连自动清理（30s 间隔）和端口冲突错误处理。

## Tools

7 个工具在 `src/tools/` 下，通过 `registry.ts` 的 `getAllTools()` 注册：

- **BashTool** — Shell 执行，`resolveShell()` 检测 Git Bash（避免 WSL），只读白名单自动放行，危险命令拦截，空字节注入防护
- **FileReadTool** — 文件读取，cat -n 风格行号，offset/limit 分页，空字节注入防护
- **FileWriteTool** — 新文件创建，自动 `mkdir -p`，敏感文件检查，空字节注入防护
- **FileEditTool** — 精确字符串替换，old_string 必须唯一，空字节注入防护
- **GlobTool** — fast-glob 匹配，100 结果上限
- **GrepTool** — ripgrep 优先，Node.js 回退

权限系统：只读命令自动放行 → 危险命令拦截 → 其他需用户确认

## Testing

测试框架：**vitest**。`tests/helpers/mockClient.ts` 提供 Mock API 客户端和事件构造器。

```
tests/
├── unit/          # 组件测试 (tools, systemPrompt, compactor, session, dashboard, discovery 等)
├── integration/   # Mock LLM 集成测试 (queryLoop 9 个场景)
└── helpers/       # mockClient.ts
```

Dashboard 测试注意：`stopDashboard()` 是 async，测试中必须 `beforeEach` 里 `await stopDashboard()` + 延迟，否则 EADDRINUSE。

## REPL 斜杠命令

`/help` `/quit` `/exit` `/clear` `/cost` `/history` `/compact` `/skills`

## Environment

- `ZHIPU_API_KEY` — 智谱 API 密钥（格式: `id.secret`）
- `ANTHROPIC_BASE_URL` — 自定义 API 端点（默认 `https://open.bigmodel.cn/api/anthropic`）
- `CLAUDE_TIMEOUT` — API 超时毫秒数（默认 600000）
- `CLAUDE_CONTEXT_WINDOW` — 上下文窗口大小（默认 128000）
- `CLAUDE_COMPACT_BUFFER` — 压缩安全余量（默认 13000）
- `CLAUDE_LOG_LEVEL` — 日志级别：ERROR / WARN / INFO / DEBUG（默认 INFO）
