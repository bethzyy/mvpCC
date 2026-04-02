# Claude Code MVP

基于 [Claude Code 源码](https://github.com/anthropics/claude-code) 逆向分析构建的教学版 AI 编码助手 CLI。

**900 行代码，覆盖核心架构 90% 的设计思想。**

## 核心特性

- **Agentic Loop** — `while(true)` 循环：API 调用 → 工具执行 → 消息累积 → 继续
- **5 个核心工具** — BashTool、FileReadTool、FileEditTool、GlobTool、GrepTool
- **流式输出** — 逐字显示模型回复
- **Verbose 教学模式** — 实时显示 Agentic Loop 每一步的运行细节
- **权限系统** — 只读命令自动放行，危险命令拦截，其他需确认

## 快速开始

```bash
# 安装依赖
npm install

# 设置 API Key（智谱 Anthropic 兼容接口）
export ZHIPU_API_KEY=your-api-key

# 启动（教学模式）
npm run dev -- --verbose

# 启动（普通模式）
npm run dev
```

## 使用示例

```
> 你好                           # 基本对话
> 读取 src/index.ts              # FileReadTool 读取文件
> 找到所有 .ts 文件              # GlobTool 搜索文件
> 搜索 ToolDefinition            # GrepTool 搜索内容
> 运行 ls -la                    # BashTool 执行命令
> /cost                          # 查看 token 消耗
> /help                          # 帮助
> /quit                          # 退出
```

## Verbose 教学模式

加 `--verbose` 参数启动，实时观察 Agentic Loop 内部运作：

```
> 读取 src/index.ts
  [MSG] 用户输入: "读取 src/index.ts"
  [T1] --- Turn 1 开始 | messages: 1 ---
  [TOOL] 开始调用: FileReadTool (id: call_33d9c32...)
  ⏺ FileReadTool
  [API] stop_reason: tool_use
  [T1] --- Turn 1 结束 | continue | 工具: 1 ---
  [TOOL] Turn1 结果: FileReadTool → OK ...
  [T2] --- Turn 2 开始 | messages: 3 ---    ← 工具结果追加后继续
  这是 src/index.ts 的内容...
  [API] stop_reason: end_turn
  [T2] --- Turn 2 结束 | done | 工具: 0 ---
```

## 与原始 Claude Code 的差异

| | 原始 Claude Code | 本 MVP |
|--|-----------------|--------|
| 代码量 | ~1900 文件, 51 万行 | 17 文件, ~900 行 |
| UI | React + Ink (140 组件) | readline |
| 工具 | ~30 个 | 5 个 |
| 上下文管理 | 自动压缩 | 无 |
| MCP / Agent | 完整支持 | 无 |
| 教学模式 | 无（debug 输出 JSONL） | verbose 模式（人类可读） |

## 项目结构

```
src/
├── index.ts              # CLI 入口
├── types.ts              # 核心类型定义
├── api/
│   ├── client.ts         # API 客户端
│   └── stream.ts         # 流式调用 + 事件处理
├── query/
│   ├── queryLoop.ts      # 核心 Agentic Loop ★
│   └── toolRunner.ts     # 工具执行器
├── tools/
│   ├── registry.ts       # 工具注册表
│   ├── BashTool.ts       # Shell 命令执行
│   ├── FileReadTool.ts   # 文件读取
│   ├── FileEditTool.ts   # 字符串替换编辑
│   ├── GlobTool.ts       # 文件名模式匹配
│   └── GrepTool.ts       # 内容搜索
├── context/
│   ├── systemPrompt.ts   # 系统提示组装
│   └── gitContext.ts     # Git 状态收集
├── ui/
│   ├── repl.ts           # REPL 交互循环
│   └── renderer.ts       # 消息渲染
└── cost/
    └── tracker.ts        # Token/成本追踪
```

## 构建指南

详细的分阶段实现指南见 [MVP_BUILD_GUIDE.md](./MVP_BUILD_GUIDE.md)。

## License

MIT
