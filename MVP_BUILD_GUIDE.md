# Claude Code MVP 从零构建指南

> 基于对 `claude-code-snapshot/` (~1900 文件, 51万行 TypeScript) 的深度逆向分析，提炼出的最小可运行版本。
> 按照本指南从阶段 0 开始，每阶段独立可验证。

---

## 设计原则

### 原则 1：教学透明性（Teaching Transparency）— 本项目的核心灵魂

**这是本项目区别于原始 Claude Code 的最关键定位差异。**

原始 Claude Code 的 `--debug` 输出 JSONL 格式的原始日志，面向开发者调试，普通用户无法理解。Agentic Loop 的运行过程完全隐藏在 React 组件和日志文件中。

**本项目必须始终做到：让 Agentic Loop 的每一步心跳都肉眼可见。**

具体要求：
- `--verbose` 模式必须在对话界面直接标注每一轮 Turn 的状态（开始/结束/继续/完成）
- 工具调用的名称、参数、执行结果必须实时展示
- API 的 stop_reason、token 消耗必须可见
- messages 数组的变化必须可追踪（让学习者看到消息如何累积）
- 所有 verbose 输出使用人类可读的中文标注，而非机器日志格式
- 任何后续功能改进（如添加新工具、新特性）都必须同步更新 verbose 日志，确保学习者能观察到新功能的运行细节

**禁止**：将调试信息隐藏到文件中或使用非人类可读格式。verbose 是教学功能，不是调试功能。

### 原则 2：每阶段独立可验证

每个实现阶段结束后必须有可运行的 demo 脚本，能独立验证该阶段的功能正确性。

### 原则 3：代码即文档

每个关键代码段都标注对应的原始源码位置（文件名 + 行号），方便对照学习。

---

## 一、你将学到什么

通过实现这个 MVP，你会深入理解 Claude Code 的核心设计：

| 原始系统 | MVP 对应 | 你学到的核心概念 |
|---------|---------|----------------|
| `query.ts` (1500行) | `queryLoop.ts` (~90行) | **Agentic Loop** — while(true) 循环 + tool_use → tool_result → 继续 |
| `services/api/claude.ts` | `stream.ts` | **流式 API 调用** — tool_use 的 JSON 增量拼接 |
| `Tool.ts` (800行) | `types.ts` (~50行) | **工具系统** — name/schema/call/permissions 接口 |
| React + Ink (140组件) | readline (~100行) | **终端 UI** — 流式输出、权限确认、信号中断 |
| `toolOrchestration.ts` | `toolRunner.ts` | **工具编排** — 权限检查 → 执行 → 返回结果 |

---

## 实施路线图（含可运行里程碑）

```
阶段 0  项目骨架 + types.ts
  ↓
阶段 1  API 客户端 + 流式调用
  ↓
★ 阶段 1.5  [可运行] demo-chat.ts — 验证 API 连通
  ↓
阶段 2  核心查询循环 (queryLoop + toolRunner)
  ↓
★ 阶段 2.5  [可运行] demo-loop.ts — 验证 Agentic Loop 跑通
  ↓
阶段 3  5 个核心工具 (Bash/Read/Edit/Glob/Grep)
  ↓
阶段 4  系统提示 + Git 上下文
  ↓
阶段 5  终端 UI (REPL + renderer)
  ↓
阶段 6  成本追踪 + 会话历史
  ↓
阶段 7  CLI 入口 (Commander.js)  ← 完整 MVP
  ↓
阶段 8  (可选) Debug Logger + Web 仪表盘
```

**带 ★ 的阶段是可运行里程碑**，完成后有 demo 脚本可以直接运行验证。

---

## 二、核心架构（必须理解）

这是整个系统的心脏，原始代码 `src/query.ts` 第 219 行开始：

```
queryLoop() 是一个 async generator (异步生成器):

  while (true) {
    ① 把当前所有 messages 发给 Anthropic API (streaming)

    ② 处理流事件:
       - text_delta      → yield 给 UI 显示 (用户看到文字逐字出现)
       - tool_use block  → 收集 (模型要调用工具了)，设 needsFollowUp = true
       - stop_reason     → 记录

    ③ 判断是否需要继续:
       ★ 原始代码注释: "stop_reason === 'tool_use' is unreliable"
       所以不能用 stop_reason 判断，而是用 needsFollowUp 标志
       - needsFollowUp == false → 没有工具调用，对话结束 → break
       - needsFollowUp == true  → 有工具调用，继续执行 ↓

    ④ 执行工具:
       - 把 assistant message (含 text + tool_use blocks) 追加到 messages
       - 逐个执行工具，收集 tool_result
       - 把 user message (含 tool_result blocks) 追加到 messages

    ⑤ → continue (回到 ①，API 看到工具结果后会继续生成)
  }
```

**关键理解**:
- messages 数组在整个循环中不断增长，每轮 API 调用都带着完整历史
- `stop_reason === 'tool_use'` 不可靠（原始代码明确注释了这点），必须用 `needsFollowUp` 标志
- tool_result 必须放在 user message 中（Anthropic API 要求）

---

## 三、项目结构

```
claude-code-mvp/
├── package.json              ← npm 配置
├── tsconfig.json             ← TypeScript 配置
├── .gitignore
├── MVP_BUILD_GUIDE.md        ← 本文件
│
└── src/
    ├── index.ts              ← [阶段8] CLI 入口，最后写
    ├── types.ts              ← [阶段0] 所有类型定义（唯一的类型文件）
    │
    ├── api/
    │   ├── client.ts         ← [阶段1] Anthropic 客户端
    │   └── stream.ts         ← [阶段1] 流式调用 (★ 难点)
    │
    ├── query/
    │   ├── queryLoop.ts      ← [阶段2] 核心循环 (★ 核心)
    │   └── toolRunner.ts     ← [阶段2] 工具执行器
    │
    ├── tools/
    │   ├── registry.ts       ← [阶段3] 工具注册表
    │   ├── BashTool.ts       ← [阶段3] Shell 执行
    │   ├── FileReadTool.ts   ← [阶段3] 文件读取
    │   ├── FileEditTool.ts   ← [阶段3] 字符串替换
    │   ├── GlobTool.ts       ← [阶段3] 文件匹配
    │   └── GrepTool.ts       ← [阶段3] 内容搜索
    │
    ├── context/
    │   ├── gitContext.ts     ← [阶段4] Git 状态
    │   └── systemPrompt.ts   ← [阶段4] 系统提示
    │
    ├── ui/
    │   ├── renderer.ts       ← [阶段5] 消息渲染
    │   └── repl.ts           ← [阶段5] REPL 循环
    │
    ├── cost/
    │   └── tracker.ts        ← [阶段6] 成本追踪
    │
    └── history/
        └── history.ts        ← [阶段6] 会话历史
```

**注意**: 所有类型定义集中在 `src/types.ts` 一个文件中，没有单独的 `tools/types.ts`。

---

## 阶段 0：项目骨架

### 目标
TypeScript 项目可编译通过。

### 步骤

```bash
cd codedb/claude-code-mvp
npm install
npx tsc --noEmit   # 此时应该报错（src/ 为空是正常的）
```

### 要写的文件

**`src/types.ts`** — 这是整个项目的基石，所有其他文件都依赖它。
所有类型集中在此，避免循环引用。

```typescript
// ========== 消息类型 ==========
// 对应原始: types/message.ts

export type Role = 'user' | 'assistant';

// 三种内容块: 文本 / 工具调用 / 工具结果
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;                        // API 生成的唯一 ID
  name: string;                      // 工具名，如 "BashTool"
  input: Record<string, unknown>;    // 工具输入参数
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;   // 对应 ToolUseBlock 的 id
  content: string;       // 工具执行结果
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// 一条消息 = 角色 + 内容
export interface ConversationMessage {
  role: Role;
  content: string | ContentBlock[];
}

// ========== 流事件类型 ==========
// 对应原始: types/message.ts 的 StreamEvent

export interface StreamTextDelta {
  type: 'text_delta';
  text: string;
}

export interface StreamToolUseStart {
  type: 'tool_use_start';
  id: string;
  name: string;
}

export interface StreamToolUseEnd {
  type: 'tool_use_end';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

export interface StreamMessageStop {
  type: 'message_stop';
  stop_reason: StopReason;
}

export interface StreamUsage {
  type: 'usage';
  input_tokens: number;
  output_tokens: number;
}

export interface StreamError {
  type: 'error';
  error: Error;
}

export type StreamEvent =
  | StreamTextDelta
  | StreamToolUseStart
  | StreamToolUseEnd
  | StreamMessageStop
  | StreamUsage
  | StreamError;

// ========== 权限类型 ==========
// 对应原始: types/permissions.ts

export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask';
  message?: string;
}

// ========== 工具类型 ==========
// 对应原始: Tool.ts (原始有 ~30 个方法，MVP 只保留 5 个)

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  call(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }>;
  checkPermissions?(input: Record<string, unknown>): PermissionResult;
  isReadOnly?(input: Record<string, unknown>): boolean;
}

// ========== 查询结果 ==========

export interface QueryResult {
  reason: 'completed' | 'aborted' | 'max_turns';
}
```

### 验证
```bash
npx tsc --noEmit   # 应该通过 (只有 types.ts，没有其他文件引用它)
```

---

## 阶段 1：API 客户端 + 流式调用

### 目标
能成功调用 Anthropic Messages API 并接收流式响应。

### 源码参考
- `claude-code-snapshot/src/services/api/client.ts` — 客户端创建
- `claude-code-snapshot/src/services/api/claude.ts` — 流式调用核心（tool_use JSON 累积、stop_reason 提取）

### 要写的文件

**`src/api/client.ts`** (~15行):

```typescript
import Anthropic from '@anthropic-ai/sdk';

export function createApiClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Set it with: export ANTHROPIC_API_KEY=your-key-here'
    );
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    timeout: 600_000,
  });
}
```

**`src/api/stream.ts`** (~100行) — 第一个难点：

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import type {
  ConversationMessage, StreamEvent, StopReason, ToolDefinition,
} from '../types.js';

export interface StreamOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
}

// ★ 关键函数: 把内部 ToolDefinition 转换为 Anthropic API 的 Tool 格式
// 原始代码在 utils/api.ts 的 toolToAPISchema() 中
function toolsToApiFormat(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      ...tool.inputSchema,
    },
  }));
}

export async function* streamMessages(
  client: Anthropic,
  messages: ConversationMessage[],
  tools: ToolDefinition[],
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const apiTools = toolsToApiFormat(tools);

  const stream = client.messages.stream({
    model: options.model || 'claude-sonnet-4-20250514',
    max_tokens: options.maxTokens || 8192,
    system: options.systemPrompt || undefined,
    messages: messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    ...(apiTools.length > 0 ? { tools: apiTools } : {}),
  }, {
    signal: options.signal,
  });

  // ★ 关键数据结构: 用 index 做 key 追踪每个 content block
  // 原始代码用 contentBlocks: Record<number, BetaContentBlock> 做同样的事
  interface ToolAccumulator {
    id: string;
    name: string;
    inputJson: string;     // 累积的 JSON 字符串片段
  }
  const toolBlocks = new Map<number, ToolAccumulator>();

  for await (const event of stream) {
    switch (event.type) {

      case 'content_block_start': {
        if (event.content_block.type === 'tool_use') {
          // ★ 原始代码: contentBlocks[part.index] = { ...part.content_block, input: '' }
          // 初始化一个空字符串来累积 JSON 片段
          toolBlocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          });
          yield {
            type: 'tool_use_start' as const,
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
        break;
      }

      case 'content_block_delta': {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          // ★ 这是最关键的逻辑: 累积 JSON 片段
          // 原始代码: contentBlock.input += delta.partial_json
          const acc = toolBlocks.get(event.index);
          if (acc) {
            acc.inputJson += event.delta.partial_json;
          }
        }
        break;
      }

      case 'content_block_stop': {
        // ★ JSON 拼接完成，解析完整输入
        // 原始代码在 content_block_stop 时构造完整的 assistant message
        const acc = toolBlocks.get(event.index);
        if (acc) {
          let parsedInput: Record<string, unknown> = {};
          if (acc.inputJson) {
            try {
              parsedInput = JSON.parse(acc.inputJson);
            } catch {
              // JSON 解析失败时保持空对象
            }
          }
          yield {
            type: 'tool_use_end' as const,
            id: acc.id,       // ★ 用 id 精确匹配，不是 name
            name: acc.name,
            input: parsedInput,
          };
        }
        break;
      }

      case 'message_delta': {
        // ★ 提取 stop_reason
        // 原始代码: stopReason = part.delta.stop_reason
        if (event.delta.stop_reason) {
          yield {
            type: 'message_stop' as const,
            stop_reason: event.delta.stop_reason as StopReason,
          };
        }
        if (event.usage) {
          yield {
            type: 'usage' as const,
            input_tokens: 0,
            output_tokens: event.usage.output_tokens,
          };
        }
        break;
      }

      case 'message_start': {
        if (event.message.usage) {
          yield {
            type: 'usage' as const,
            input_tokens: event.message.usage.input_tokens,
            output_tokens: 0,
          };
        }
        break;
      }
    }
  }
}
```

### 验证
写一个快速测试脚本 `test-api.ts` (放在项目根目录):
```typescript
import { createApiClient } from './src/api/client.js';
import { streamMessages } from './src/api/stream.js';

const client = createApiClient();
for await (const event of streamMessages(client, [
  { role: 'user', content: 'Say hello in one sentence.' }
], [], { model: 'claude-sonnet-4-20250514' })) {
  if (event.type === 'text_delta') process.stdout.write(event.text);
}
console.log('\nDone!');
```
运行: `npx tsx test-api.ts`

---

## 阶段 1.5：最小可运行验证 — API 层通了 ★

### 目标
不写 queryLoop，直接用 `streamMessages()` 做一个最小 demo，验证 API 连接和流式输出。

### 要写的文件

**`demo-chat.ts`** (放在项目根目录，~20行):

```typescript
import { createApiClient } from './src/api/client.js';
import { streamMessages } from './src/api/stream.js';

async function main() {
  const client = createApiClient();
  const prompt = process.argv[2] || '用一句话介绍你自己';

  console.log(`\n你说: ${prompt}\n`);
  process.stdout.write('Claude: ');

  for await (const event of streamMessages(client, [
    { role: 'user', content: prompt }
  ], [], { model: 'claude-sonnet-4-20250514' })) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text);
        break;
      case 'usage':
        console.log(`\n\n[Tokens: ${event.input_tokens} in / ${event.output_tokens} out]`);
        break;
    }
  }
}

main().catch(console.error);
```

### 验证
```bash
export ANTHROPIC_API_KEY=your-key-here

# 基本对话
npx tsx demo-chat.ts

# 自定义 prompt
npx tsx demo-chat.ts "什么是 TypeScript"

# 预期效果:
#   你说: 什么是 TypeScript
#
#   Claude: TypeScript 是一种由微软开发的...
#
#   [Tokens: 23 in / 67 out]
```

**通过标志**: 你能看到文字逐字流式出现，最后显示 token 统计。API 层完全通了。

---

## 阶段 2：核心查询循环 ★★★

### 目标
实现 `queryLoop()` — 整个系统的"心脏"。

### 源码参考
- `claude-code-snapshot/src/query.ts` 第 219-600 行

### 要写的文件

**`src/query/toolRunner.ts`** (~45行):

```typescript
import type { ToolDefinition, ToolResultBlock, PermissionResult } from '../types.js';

export async function executeTool(
  tool: ToolDefinition,
  toolUseId: string,
  input: Record<string, unknown>,
  askPermission: (message: string) => Promise<boolean>,
): Promise<ToolResultBlock> {
  // 1. 权限检查
  // 原始代码在 toolOrchestration.ts 的 runToolUse() 中做同样的事
  let permission: PermissionResult = { behavior: 'allow' };
  if (tool.checkPermissions) {
    permission = tool.checkPermissions(input);
  }

  if (permission.behavior === 'deny') {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: permission.message || 'Permission denied',
      is_error: true,
    };
  }

  if (permission.behavior === 'ask') {
    const allowed = await askPermission(
      permission.message || `Allow ${tool.name}?`
    );
    if (!allowed) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: 'User denied permission',
        is_error: true,
      };
    }
  }

  // 2. 执行工具
  try {
    const result = await tool.call(input);
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result.output,
      is_error: result.isError,
    };
  } catch (error) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      is_error: true,
    };
  }
}
```

**`src/query/queryLoop.ts`** (~110行) — 这是最重要的文件:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import type {
  ConversationMessage, ContentBlock, ToolUseBlock, ToolResultBlock,
  StreamEvent, ToolDefinition, QueryResult,
} from '../types.js';
import { streamMessages } from '../api/stream.js';
import { executeTool } from './toolRunner.js';

export interface QueryLoopOptions {
  client: Anthropic;
  tools: ToolDefinition[];
  systemPrompt: string;
  signal?: AbortSignal;
  model?: string;
  maxTurns?: number;
  askPermission: (message: string) => Promise<boolean>;
}

export async function* queryLoop(
  initialMessages: ConversationMessage[],
  options: QueryLoopOptions,
): AsyncGenerator<StreamEvent, QueryResult, unknown> {
  const {
    client, tools, systemPrompt, signal,
    model, maxTurns = 100, askPermission,
  } = options;

  // ★ 可变消息列表 — 每轮循环都会追加
  // 原始代码用 state = { messages, ... } 管理，MVP 简化为直接 let
  let messages: ConversationMessage[] = [...initialMessages];
  let turnCount = 0;

  // ★ 这就是原始 query.ts 的 while(true) 循环 (第 307 行)
  while (true) {
    if (signal?.aborted) return { reason: 'aborted' };
    if (++turnCount > maxTurns) return { reason: 'max_turns' };

    // ★ 原始代码的 needsFollowUp 标志 (第 376 行)
    // 注释原文: "stop_reason === 'tool_use' is unreliable -- it's not always set correctly.
    // Set during streaming whenever a tool_use block arrives — the sole loop-exit signal."
    let needsFollowUp = false;
    const toolUseBlocks: ToolUseBlock[] = [];
    let currentText = '';

    // ① 调用 API 并处理流事件
    for await (const event of streamMessages(client, messages, tools, {
      model, systemPrompt, signal,
    })) {
      switch (event.type) {
        case 'text_delta':
          currentText += event.text;
          yield event;  // → 传递给 UI 显示
          break;

        case 'tool_use_start':
          // ★ 收集 tool_use block，设 needsFollowUp = true
          // 原始代码: msgToolUseBlocks = message.message.content.filter(c => c.type === 'tool_use')
          //           if (msgToolUseBlocks.length > 0) { needsFollowUp = true }
          toolUseBlocks.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: {},  // 初始为空，等 tool_use_end 时填充
          });
          needsFollowUp = true;
          yield event;
          break;

        case 'tool_use_end':
          // ★ 用 id 精确匹配，而不是 name（原始代码也用 id）
          const block = toolUseBlocks.find(b => b.id === event.id);
          if (block) {
            block.input = event.input;
          }
          break;

        case 'message_stop':
          yield event;
          break;

        case 'usage':
          yield event;
          break;

        case 'error':
          yield event;
          return { reason: 'completed' };
      }
    }

    // ② ★ 关键判断: 用 needsFollowUp 而不是 stop_reason
    // 原始代码: if (!needsFollowUp) { return { reason: 'completed' } }
    if (!needsFollowUp) {
      // 没有工具调用，对话结束
      if (currentText) {
        messages.push({
          role: 'assistant',
          content: [{ type: 'text', text: currentText }],
        });
      }
      return { reason: 'completed' };
    }

    // ③ 构造 assistant message (text + tool_use blocks)
    // 原始代码: messages = [...messagesForQuery, ...assistantMessages, ...toolResults]
    const assistantContent: ContentBlock[] = [];
    if (currentText) {
      assistantContent.push({ type: 'text', text: currentText });
    }
    assistantContent.push(...toolUseBlocks);
    messages.push({ role: 'assistant', content: assistantContent });

    // ④ 逐个执行工具
    // 原始代码: runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)
    const toolResults: ToolResultBlock[] = [];
    for (const toolUse of toolUseBlocks) {
      const tool = tools.find(t => t.name === toolUse.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      const result = await executeTool(
        tool, toolUse.id, toolUse.input, askPermission
      );
      toolResults.push(result);
    }

    // ⑤ 构造 user message (包含所有 tool_result)
    // ★ Anthropic API 要求 tool_result 必须在 user message 中
    messages.push({ role: 'user', content: toolResults });

    // → continue (回到循环顶部，API 会看到工具结果并继续生成)
  }
}
```

### 验证
在脑海中走一遍这个循环:
1. 用户说 "列出当前目录的文件" → API 返回 tool_use(BashTool, {command: "ls"}) → needsFollowUp=true → 执行 → 返回结果 → API 看到结果后生成 "当前目录有以下文件..." → needsFollowUp=false → break
2. 用户说 "你好" → API 直接返回 text → needsFollowUp=false → break

---

## 阶段 2.5：最小可运行验证 — Agentic Loop 跑通了 ★

### 目标
不写完整的 5 个工具，用一个 mock 工具验证 queryLoop 的多轮循环能力。

### 要写的文件

**`demo-loop.ts`** (放在项目根目录，~60行):

```typescript
import { createApiClient } from './src/api/client.js';
import { queryLoop } from './src/query/queryLoop.js';
import type { ToolDefinition, ConversationMessage } from './src/types.js';

// ★ 一个最简单的 mock 工具：计算器
const CalculatorTool: ToolDefinition = {
  name: 'Calculator',
  description: 'A simple calculator. Input: { expression: "2+3" }',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression to evaluate' },
    },
    required: ['expression'],
  },
  isReadOnly() { return true; },
  async call(input) {
    const expr = input.expression as string;
    try {
      // 只允许基本数学运算，安全 eval
      const result = Function('"use strict"; return (' + expr.replace(/[^0-9+\-*/().%\s]/g, '') + ')')();
      return { output: `${expr} = ${result}` };
    } catch {
      return { output: `Error: cannot evaluate "${expr}"`, isError: true };
    }
  },
};

async function main() {
  const client = createApiClient();
  const prompt = process.argv[2] || '帮我算一下 (12+8)*3 等于多少，然后再加上 100';
  const messages: ConversationMessage[] = [
    { role: 'user', content: prompt },
  ];

  const tools = [CalculatorTool];
  const systemPrompt = 'You are a helpful assistant. You have a Calculator tool for math.';

  console.log(`\n你说: ${prompt}\n`);

  for await (const event of queryLoop(messages, {
    client, tools, systemPrompt,
    model: 'claude-sonnet-4-20250514',
    askPermission: async () => true, // 自动允许所有权限
  })) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text);
        break;
      case 'tool_use_start':
        console.log(chalk.yellow(`\n🔧 调用工具: ${event.name}`));
        break;
      case 'tool_use_end':
        console.log(chalk.gray(`   输入: ${JSON.stringify(event.input)}`));
        break;
      case 'usage':
        // 静默处理
        break;
    }
  }
  console.log('\n');
}

import chalk from 'chalk';
main().catch(console.error);
```

### 验证
```bash
# 基本对话（不触发工具）
npx tsx demo-loop.ts "你好"

# 触发工具调用
npx tsx demo-loop.ts "帮我算一下 (12+8)*3 等于多少，然后再加上 100"

# 预期效果:
#   你说: 帮我算一下 (12+8)*3 等于多少，然后再加上 100
#
#   🔧 调用工具: Calculator
#      输入: {"expression":"(12+8)*3"}
#
#   🔧 调用工具: Calculator
#      输入: {"expression":"60+100"}
#
#   (12+8)*3 等于 60，再加上 100 等于 160。
```

**通过标志**: 你能看到 agentic loop 完整跑了两轮:
- Turn 1: API 调用 Calculator 算 (12+8)*3 → 得到 60 → 继续循环
- Turn 2: API 调用 Calculator 算 60+100 → 得到 160 → 不需要工具了 → 结束

这证明整个核心架构（while 循环 + 工具执行 + 消息累积）完全正确。

---

## 阶段 3：5 个核心工具

### 源码参考
- `claude-code-snapshot/src/tools/BashTool/BashTool.tsx`
- `claude-code-snapshot/src/tools/FileReadTool/FileReadTool.ts`
- `claude-code-snapshot/src/tools/FileEditTool/FileEditTool.ts`
- `claude-code-snapshot/src/tools/GlobTool/GlobTool.ts`
- `claude-code-snapshot/src/tools/GrepTool/GrepTool.ts`

### 3.1 BashTool (~80行)

```typescript
// src/tools/BashTool.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, PermissionResult } from '../types.js';

const execAsync = promisify(exec);

// 只读命令白名单 (从原始 BashTool/readOnlyValidation.ts 提取)
const READONLY_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'wc', 'stat', 'file',
  'strings', 'jq', 'awk', 'cut', 'sort', 'uniq', 'tr',
  'find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis',
  'ls', 'tree', 'du', 'echo', 'printf',
  'git', 'node', 'python', 'python3', 'pip', 'npm', 'npx',
  'pwd', 'whoami', 'date', 'uname', 'env', 'cal', 'uptime',
]);

function getBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0]?.split('/').pop()?.toLowerCase() || '';
}

export const BashTool: ToolDefinition = {
  name: 'BashTool',
  description: `Execute a bash command. Returns stdout and stderr.
Use for shell operations that cannot be done with dedicated tools.
Prefer dedicated tools: FileRead (not cat), FileEdit (not sed), Glob (not find), Grep (not grep).`,

  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 120000, max 600000)' },
    },
    required: ['command'],
  },

  isReadOnly(input) {
    const cmd = getBaseCommand(input.command as string);
    return READONLY_COMMANDS.has(cmd);
  },

  checkPermissions(input): PermissionResult {
    const cmd = getBaseCommand(input.command as string);
    const command = input.command as string;

    // 危险命令直接拒绝
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', 'chmod -R 777 /', '> /dev/sd'];
    if (dangerous.some(d => command.includes(d))) {
      return { behavior: 'deny', message: `Dangerous command blocked: ${command}` };
    }

    // 只读命令自动允许
    if (READONLY_COMMANDS.has(cmd)) {
      return { behavior: 'allow' };
    }

    // 其他命令需要确认
    return { behavior: 'ask', message: `Run command: ${command}` };
  },

  async call(input) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) || 120_000, 600_000);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      const output = [stdout, stderr].filter(Boolean).join('\n');
      return { output: output || '(no output)' };
    } catch (error: any) {
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n');
      return { output: output || error.message, isError: true };
    }
  },
};
```

### 3.2 FileReadTool (~50行)

```typescript
// src/tools/FileReadTool.ts
import { readFile } from 'fs/promises';
import type { ToolDefinition } from '../types.js';

export const FileReadTool: ToolDefinition = {
  name: 'FileReadTool',
  description: `Read a file from the filesystem. Returns content with line numbers.
Supports offset and limit for large files. Default max 2000 lines.`,

  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      offset: { type: 'number', description: 'Line number to start from (0-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },

  isReadOnly() { return true; },

  async call(input) {
    const filePath = input.file_path as string;
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // 行号格式化 (cat -n 风格)
      const offset = (input.offset as number) || 0;
      const limit = Math.min((input.limit as number) || 2000, lines.length - offset);
      const selected = lines.slice(offset, offset + limit);

      const numbered = selected
        .map((line, i) => `${String(offset + i + 1).padStart(6)}\t${line}`)
        .join('\n');

      return { output: numbered };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
```

### 3.3 FileEditTool (~60行)

```typescript
// src/tools/FileEditTool.ts
import { readFile, writeFile } from 'fs/promises';
import type { ToolDefinition, PermissionResult } from '../types.js';

export const FileEditTool: ToolDefinition = {
  name: 'FileEditTool',
  description: `Edit a file by replacing an exact string match.
The old_string must be unique in the file. Use replace_all to replace all occurrences.
Prefer this over creating new files.`,

  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      old_string: { type: 'string', description: 'The exact string to replace' },
      new_string: { type: 'string', description: 'The replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },

  checkPermissions(input): PermissionResult {
    const filePath = input.file_path as string;
    const sensitive = [/\.env/, /credentials/, /secret/, /\.ssh\//, /\.aws\//];
    if (sensitive.some(p => p.test(filePath))) {
      return { behavior: 'ask', message: `Editing sensitive file: ${filePath}` };
    }
    return { behavior: 'allow' };
  },

  async call(input) {
    const filePath = input.file_path as string;
    const oldStr = input.old_string as string;
    const newStr = input.new_string as string;
    const replaceAll = input.replace_all as boolean;

    try {
      let content = await readFile(filePath, 'utf-8');

      if (!content.includes(oldStr)) {
        return { output: 'Error: old_string not found in file', isError: true };
      }

      if (!replaceAll) {
        const count = content.split(oldStr).length - 1;
        if (count > 1) {
          return {
            output: `Error: old_string is not unique (${count} occurrences). Use replace_all or provide more context.`,
            isError: true,
          };
        }
        content = content.replace(oldStr, newStr);
      } else {
        content = content.split(oldStr).join(newStr);
      }

      await writeFile(filePath, content, 'utf-8');
      return { output: `File updated: ${filePath}` };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
```

### 3.4 GlobTool (~30行)

```typescript
// src/tools/GlobTool.ts
import fg from 'fast-glob';
import type { ToolDefinition } from '../types.js';

export const GlobTool: ToolDefinition = {
  name: 'GlobTool',
  description: `Fast file pattern matching. Supports glob patterns like "**/*.ts".
Returns matching file paths. Limit 100 results.`,

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },

  isReadOnly() { return true; },

  async call(input) {
    try {
      const files = await fg(input.pattern as string, {
        cwd: (input.path as string) || process.cwd(),
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      const limited = files.slice(0, 100);
      return {
        output: limited.join('\n') + (files.length > 100 ? `\n... (${files.length - 100} more)` : ''),
      };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
```

### 3.5 GrepTool (~80行)

```typescript
// src/tools/GrepTool.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { ToolDefinition } from '../types.js';

const execFileAsync = promisify(execFile);

export const GrepTool: ToolDefinition = {
  name: 'GrepTool',
  description: `Search file contents using regex. Prefers ripgrep (rg) if available, falls back to Node.js.
Supports output modes: content (default), files_with_matches, count.`,

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'File or directory to search' },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output format',
      },
      '-i': { type: 'boolean', description: 'Case insensitive search' },
      '-C': { type: 'number', description: 'Context lines before and after match' },
    },
    required: ['pattern'],
  },

  isReadOnly() { return true; },

  async call(input) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || process.cwd();
    const outputMode = (input.output_mode as string) || 'content';
    const ignoreCase = !!(input['-i'] as boolean);
    const context = (input['-C'] as number) || 0;

    try {
      // ★ 构建 ripgrep 参数 — 注意 rg 的参数顺序: options 必须在 pattern 之前
      const args: string[] = [];
      if (ignoreCase) args.push('-i');
      if (context) { args.push('-C', String(context)); }
      if (outputMode === 'files_with_matches') args.push('-l');
      if (outputMode === 'count') args.push('-c');
      args.push(pattern, searchPath);

      const { stdout } = await execFileAsync('rg', args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return { output: stdout };
    } catch (rgError: any) {
      if (rgError.code === 'ENOENT') {
        // rg 不可用，回退到 Node.js 实现
        return { output: await grepNodeJS(pattern, searchPath, outputMode, ignoreCase) };
      }
      // ★ rg 没有匹配结果返回 code 1，不是真正的错误
      if (rgError.code === 1) {
        return { output: '(no matches found)' };
      }
      return { output: `Error: ${rgError.message}`, isError: true };
    }
  },
};

// 简单的 Node.js 回退实现
async function grepNodeJS(
  pattern: string,
  searchPath: string,
  outputMode: string,
  ignoreCase: boolean,
): Promise<string> {
  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
  const results: string[] = [];

  async function searchDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await searchDir(fullPath);
      } else {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              if (outputMode === 'content') {
                results.push(`${fullPath}:${i + 1}:${lines[i]}`);
              } else if (outputMode === 'files_with_matches') {
                results.push(fullPath);
                break; // 找到一个就够了
              }
            }
            regex.lastIndex = 0; // ★ 重置 lastIndex（全局正则必须）
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await searchDir(searchPath);
  return results.join('\n') || '(no matches found)';
}
```

### 3.6 工具注册表

```typescript
// src/tools/registry.ts
import type { ToolDefinition } from '../types.js';
import { BashTool } from './BashTool.js';
import { FileReadTool } from './FileReadTool.js';
import { FileEditTool } from './FileEditTool.js';
import { GlobTool } from './GlobTool.js';
import { GrepTool } from './GrepTool.js';

export function getAllTools(): ToolDefinition[] {
  return [BashTool, FileReadTool, FileEditTool, GlobTool, GrepTool];
}
```

### 验证
```bash
npx tsc --noEmit   # 应该通过
```

---

## 阶段 4：系统提示 + 上下文

### 源码参考
- `claude-code-snapshot/src/context.ts` — getSystemContext() / getUserContext() / getGitStatus()

### `src/context/gitContext.ts` (~30行):

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getGitContext(): Promise<string> {
  try {
    // ★ 原始代码用 Promise.all 并行收集 git 信息 (context.ts getGitStatus)
    const [branch, status, log] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { maxBuffer: 1024 })
        .then(r => r.stdout.trim()).catch(() => '(unknown)'),
      execFileAsync('git', ['status', '--short'], { maxBuffer: 10240 })
        .then(r => r.stdout.trim() || '(clean)').catch(() => ''),
      execFileAsync('git', ['log', '--oneline', '-n', '5'], { maxBuffer: 1024 })
        .then(r => r.stdout.trim()).catch(() => ''),
    ]);

    return `Branch: ${branch}\nStatus: ${status}\nRecent commits:\n${log}`;
  } catch {
    return '';
  }
}
```

### `src/context/systemPrompt.ts` (~40行):

```typescript
// ★ 注意: 从 '../types.js' 导入，不是 '../tools/types.js'
import type { ToolDefinition } from '../types.js';

export function buildSystemPrompt(tools: ToolDefinition[], gitContext: string): string {
  const toolDescriptions = tools.map(t =>
    `### ${t.name}\n${t.description}\nInput: ${JSON.stringify(t.inputSchema.properties, null, 2)}`
  ).join('\n\n');

  return `You are Claude Code, an interactive CLI tool that helps users with software engineering tasks.

## Available Tools

${toolDescriptions}

## Guidelines

- When executing shell commands, prefer using specific tools over Bash when possible:
  - To read files use FileRead (not cat/head/tail)
  - To edit files use FileEdit (not sed/awk)
  - To find files use Glob (not find/ls)
  - To search content use Grep (not grep/rg)
- Use absolute paths for file operations
- Run independent commands in parallel, dependent commands with &&
- Be concise in your responses

${gitContext ? `## Git Context\n${gitContext}` : ''}

Today's date: ${new Date().toISOString().split('T')[0]}`;
}
```

---

## 阶段 5：终端 UI

### 源码参考
- `claude-code-snapshot/src/main.tsx` — REPL 启动
- `claude-code-snapshot/src/screens/REPL.tsx` — REPL 循环 (React 版)

### `src/ui/renderer.ts` (~25行):

```typescript
import chalk from 'chalk';

export function renderToolUse(name: string): string {
  return chalk.dim(`\n  ⏺ ${name}\n`);
}

export function renderCostInfo(inputTokens: number, outputTokens: number, cost: number): string {
  return chalk.dim(
    `\n─── Tokens: ${inputTokens} in / ${outputTokens} out | Cost: $${cost.toFixed(4)} ───`
  );
}
```

### `src/ui/repl.ts` (~90行):

```typescript
import * as readline from 'readline';
import chalk from 'chalk';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationMessage, ToolDefinition, StreamEvent } from '../types.js';
import { queryLoop } from '../query/queryLoop.js';
import { buildSystemPrompt } from '../context/systemPrompt.js';
import { getGitContext } from '../context/gitContext.js';
import { renderToolUse, renderCostInfo } from './renderer.js';
import { CostTracker } from '../cost/tracker.js';

export async function startRepl(
  client: Anthropic,
  tools: ToolDefinition[],
  options: { model?: string },
): Promise<void> {
  const messages: ConversationMessage[] = [];
  const gitContext = await getGitContext();
  const systemPrompt = buildSystemPrompt(tools, gitContext);
  const costTracker = new CostTracker();

  // ★ 主 readline 实例用于用户输入
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('> '),
  });

  // ★ 权限确认用单独的 readline 实例，避免和主输入冲突
  const permRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function askPermission(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
      permRl.question(chalk.yellow(`  [Permission] ${msg} (y/n): `), (answer) => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  console.log(chalk.cyan.bold('\n  Claude Code MVP'));
  console.log(chalk.gray('  /help for commands, /quit to exit\n'));

  let isProcessing = false;

  rl.prompt();

  rl.on('line', async (line) => {
    if (isProcessing) return;
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // 斜杠命令
    if (input === '/quit' || input === '/exit') { rl.close(); permRl.close(); return; }
    if (input === '/help') {
      console.log(chalk.gray('  /help  /quit  /clear  /cost'));
      rl.prompt(); return;
    }
    if (input === '/clear') {
      messages.length = 0;
      console.log(chalk.gray('  History cleared.'));
      rl.prompt(); return;
    }
    if (input === '/cost') {
      const t = costTracker.getTotals();
      console.log(renderCostInfo(t.inputTokens, t.outputTokens, t.cost));
      rl.prompt(); return;
    }

    // 发送消息
    messages.push({ role: 'user', content: input });
    isProcessing = true;
    rl.pause();

    const abortController = new AbortController();
    const onInterrupt = () => { abortController.abort(); };
    process.on('SIGINT', onInterrupt);

    try {
      let currentText = '';

      for await (const event of queryLoop(messages, {
        client, tools, systemPrompt,
        signal: abortController.signal,
        model: options.model,
        askPermission,
      })) {
        switch (event.type) {
          case 'text_delta':
            process.stdout.write(event.text);
            currentText += event.text;
            break;
          case 'tool_use_start':
            process.stdout.write(renderToolUse(event.name));
            break;
          case 'usage':
            costTracker.add(event);
            break;
        }
      }

      if (currentText && !currentText.endsWith('\n')) process.stdout.write('\n');

      const t = costTracker.getTotals();
      console.log(renderCostInfo(t.inputTokens, t.outputTokens, t.cost));
    } catch (error) {
      console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : String(error)}`));
    }

    process.off('SIGINT', onInterrupt);
    isProcessing = false;
    rl.resume();
    rl.prompt();
  });
}
```

---

## 阶段 6：成本追踪 + 历史

### `src/cost/tracker.ts` (~25行):

```typescript
import type { StreamUsage } from '../types.js';

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;

  add(usage: StreamUsage): void {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
  }

  getTotals(): { inputTokens: number; outputTokens: number; cost: number } {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cost: this.calculateCost(),
    };
  }

  private calculateCost(): number {
    // Claude Sonnet 4: $3/MTok input, $15/MTok output
    return (this.inputTokens / 1_000_000) * 3 + (this.outputTokens / 1_000_000) * 15;
  }
}
```

### `src/history/history.ts` (~30行):

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const HISTORY_DIR = join(homedir(), '.claude-mvp');
const HISTORY_FILE = join(HISTORY_DIR, 'history.json');

export async function addToHistory(entry: string, project: string): Promise<void> {
  try {
    const history = await loadHistory();
    history.unshift({ display: entry.slice(0, 200), timestamp: Date.now(), project });
    if (history.length > 100) history.length = 100;
    await mkdir(HISTORY_DIR, { recursive: true });
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch { /* ignore */ }
}

async function loadHistory(): Promise<any[]> {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf-8'));
  } catch { return []; }
}
```

---

## 阶段 7：CLI 入口

### `src/index.ts` (~30行):

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { createApiClient } from './api/client.js';
import { getAllTools } from './tools/registry.js';
import { startRepl } from './ui/repl.js';

const program = new Command();

program
  .name('claude-mvp')
  .description('Claude Code MVP - AI-powered CLI coding assistant')
  .version('0.1.0')
  .option('-m, --model <model>', 'Model to use', 'claude-sonnet-4-20250514')
  .option('--api-key <key>', 'Anthropic API key')
  .option('--base-url <url>', 'Custom API base URL')
  .argument('[prompt]', 'Initial prompt (non-interactive)');

program.action(async (prompt, options) => {
  if (options.apiKey) process.env.ANTHROPIC_API_KEY = options.apiKey;
  if (options.baseUrl) process.env.ANTHROPIC_BASE_URL = options.baseUrl;

  try {
    const client = createApiClient();
    const tools = getAllTools();
    await startRepl(client, tools, { model: options.model });
  } catch (error) {
    console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
});

program.parse();
```

---

## 最终验证

```bash
# 1. 编译检查
npx tsc --noEmit

# 2. 设置 API Key
export ANTHROPIC_API_KEY=your-key-here

# 3. 启动
npm run dev

# 4. 测试场景
> 你好                           # 基本文本回复
> 读取 src/index.ts              # FileReadTool
> 找到所有 .ts 文件              # GlobTool
> 搜索包含 ToolDefinition 的代码  # GrepTool
> 运行 ls -la                    # BashTool (只读，自动允许)
> 运行 echo "test" > test.txt    # BashTool (写入，需要确认)
/cost                            # 查看成本
/quit                            # 退出
```

---

## 阶段 8（教学增强）：Debug Logger + Web 仪表盘

### 目标
添加一个独立的调试信息窗口，实时展示 Agentic Loop 的每一步操作细节。
用户在主终端对话，同时可以在浏览器中看到完整的内部运作过程。

### 方案选择

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 写日志文件 | 最简单，`tail -f` 查看 | 不够直观 |
| B. 终端 stderr 彩色输出 | 零依赖 | 和主输出混在一起 |
| **C. Web 仪表盘（选用）** | 独立窗口，实时刷新，直观 | 多一个依赖 (`ws`) |

**推荐方案**: A + C 组合。核心是日志系统（方案 A），Web 仪表盘是可选的查看器（方案 C）。

### 要新增的文件

```
src/debug/
├── logger.ts        ← 核心日志系统（方案 A，必须）
└── dashboard.ts     ← Web 仪表盘服务（方案 C，可选）
```

### 8.1 核心日志系统 (`src/debug/logger.ts`)

**设计思路**: 一个全局的 Logger 单例，所有模块调用它记录事件。日志写入文件 + 可选推送到 WebSocket。

```typescript
// src/debug/logger.ts
import { writeFile, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { Server as WebSocketServer } from 'ws';

// ========== 日志条目类型 ==========

export interface LogEntry {
  timestamp: number;           // 毫秒时间戳
  turn: number;                // 当前是第几轮 agentic loop
  phase: string;               // 阶段标识
  type: string;                // 事件类型
  detail: Record<string, unknown>;
}

// phase 枚举:
// 'api_request'   — 发送给 API 的请求
// 'api_event'     — 从 API 收到的流事件
// 'api_response'  — API 响应结束时的汇总
// 'tool_call'     — 准备调用工具
// 'tool_result'   — 工具执行结果
// 'tool_perm'     — 权限检查结果
// 'message_add'   — 向 messages 数组追加消息
// 'loop_start'    — agentic loop 新一轮开始
// 'loop_end'      — agentic loop 本轮结束
// 'user_input'    — 用户输入

// ========== Logger 单例 ==========

export class DebugLogger {
  private entries: LogEntry[] = [];
  private wsClients: Set<any> = new Set();
  private wss: WebSocketServer | null = null;
  private logFile: string;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.logFile = join(homedir(), '.claude-mvp', 'debug.log');
  }

  // 记录一条日志
  log(turn: number, phase: string, type: string, detail: Record<string, unknown> = {}) {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      turn,
      phase,
      type,
      detail,
    };
    this.entries.push(entry);

    // 写入文件（异步，不阻塞主流程）
    this.appendToFile(entry);

    // 推送给 WebSocket 客户端
    this.broadcast(entry);
  }

  // 获取所有日志
  getAll(): LogEntry[] {
    return this.entries;
  }

  // 获取某一轮的日志
  getByTurn(turn: number): LogEntry[] {
    return this.entries.filter(e => e.turn === turn);
  }

  // 清空日志
  clear() {
    this.entries = [];
  }

  // 启动 WebSocket 服务器（Web 仪表盘用）
  startWebSocket(port: number = 3333): void {
    if (!this.enabled) return;
    const { Server } = require('ws') as any;
    this.wss = new Server({ port });
    this.wss.on('connection', (ws: any) => {
      this.wsClients.add(ws);
      // 新连接时发送历史日志
      ws.send(JSON.stringify({ type: 'history', entries: this.entries }));
      ws.on('close', () => this.wsClients.delete(ws));
    });
  }

  // 关闭 WebSocket
  stopWebSocket() {
    this.wss?.close();
    this.wsClients.clear();
  }

  private async appendToFile(entry: LogEntry) {
    try {
      const line = JSON.stringify(entry) + '\n';
      await appendFile(this.logFile, line);
    } catch { /* ignore */ }
  }

  private broadcast(entry: LogEntry) {
    const data = JSON.stringify({ type: 'entry', entry });
    for (const client of this.wsClients) {
      try { client.send(data); } catch { this.wsClients.delete(client); }
    }
  }
}

// 全局单例
export const logger = new DebugLogger(false); // 默认关闭，--debug 时启用
```

### 8.2 在各模块中埋点

**原则**: 只在关键节点记录，不记录每一字节的数据流。

**`stream.ts` 埋点** — 在流事件处理中添加:
```typescript
import { logger } from '../debug/logger.js';

// 在 streamMessages 函数中:

// 1. 发送请求时
logger.log(turn, 'api_request', 'send', {
  messageCount: messages.length,
  toolCount: tools.length,
  model: options.model,
});

// 2. 收到 tool_use_start 时
logger.log(turn, 'api_event', 'tool_use_start', {
  id: event.content_block.id,
  name: event.content_block.name,
});

// 3. 收到 tool_use_end 时
logger.log(turn, 'api_event', 'tool_use_end', {
  id: acc.id,
  name: acc.name,
  inputLength: acc.inputJson.length,
  inputParsed: parsedInput,   // ★ 完整的工具输入
});

// 4. 收到 message_stop 时
logger.log(turn, 'api_response', 'stop', {
  stopReason: event.delta.stop_reason,
  textLength: currentText.length,  // 需要从外部传入或跟踪
});
```

**`queryLoop.ts` 埋点** — 在循环的关键位置添加:
```typescript
import { logger } from '../debug/logger.js';

// 1. 每轮循环开始
logger.log(turnCount, 'loop_start', 'begin', {
  messageCount: messages.length,
});

// 2. 判断 needsFollowUp 后
logger.log(turnCount, 'loop_end', needsFollowUp ? 'continue' : 'done', {
  toolUseCount: toolUseBlocks.length,
  textLength: currentText.length,
});

// 3. 追加 assistant message 时
logger.log(turnCount, 'message_add', 'assistant', {
  contentTypes: assistantContent.map(c => c.type),
  toolUseIds: toolUseBlocks.map(b => `${b.name}(${b.id.slice(0,8)})`),
});

// 4. 追加 tool_result 时
logger.log(turnCount, 'message_add', 'user_tool_results', {
  toolCount: toolResults.length,
  errors: toolResults.filter(r => r.is_error).map(r => r.tool_use_id),
});

// 5. 最终返回时
logger.log(turnCount, 'loop_end', 'final', {
  reason: result.reason,
  totalTurns: turnCount,
});
```

**`toolRunner.ts` 埋点** — 在工具执行前后添加:
```typescript
import { logger } from '../debug/logger.js';

// 1. 权限检查
logger.log(turn, 'tool_perm', permission.behavior, {
  tool: tool.name,
  message: permission.message,
});

// 2. 执行前
logger.log(turn, 'tool_call', 'start', {
  tool: tool.name,
  toolUseId: toolUseId,
  input,  // ★ 完整的工具输入参数
});

// 3. 执行后
logger.log(turn, 'tool_result', result.isError ? 'error' : 'success', {
  tool: tool.name,
  outputLength: result.content.length,
  outputPreview: result.content.slice(0, 200),
});
```

### 8.3 Web 仪表盘 (`src/debug/dashboard.ts`)

一个极简的 HTTP 服务器，提供一个实时更新的调试页面。

```typescript
// src/debug/dashboard.ts
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const HTML_PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>Claude Code MVP - Debug Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cascadia Code', 'Fira Code', monospace; background: #1a1a2e; color: #e0e0e0; display: flex; height: 100vh; }
    #sidebar { width: 200px; background: #16213e; padding: 12px; overflow-y: auto; border-right: 1px solid #0f3460; }
    #sidebar h3 { color: #e94560; margin-bottom: 8px; font-size: 12px; }
    .turn-btn { display: block; width: 100%; padding: 6px 8px; margin: 2px 0; background: #0f3460; color: #e0e0e0; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; text-align: left; }
    .turn-btn:hover, .turn-btn.active { background: #e94560; color: white; }
    #main { flex: 1; padding: 16px; overflow-y: auto; }
    .log-entry { padding: 8px 12px; margin: 4px 0; border-radius: 6px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    .phase-api_request  { background: #1a1a40; border-left: 3px solid #533483; }
    .phase-api_event    { background: #1a1a40; border-left: 3px solid #0f3460; }
    .phase-api_response { background: #1a2a1a; border-left: 3px solid #2d6a4f; }
    .phase-tool_call    { background: #2a2a1a; border-left: 3px solid #e9c46a; }
    .phase-tool_result  { background: #2a1a1a; border-left: 3px solid #e76f51; }
    .phase-tool_perm    { background: #2a1a2a; border-left: 3px solid #a8dadc; }
    .phase-loop_start   { background: #1a2a2a; border-left: 3px solid #48cae4; }
    .phase-loop_end     { background: #1a2a1a; border-left: 3px solid #52b788; }
    .phase-message_add  { background: #1a1a2a; border-left: 3px solid #457b9d; }
    .phase-user_input   { background: #2a1a2a; border-left: 3px solid #f4a261; }
    .entry-header { color: #888; font-size: 10px; margin-bottom: 4px; }
    .entry-type { font-weight: bold; }
    .json-key { color: #e94560; }
    .json-string { color: #2d6a4f; }
    .json-number { color: #e9c46a; }
    #auto-scroll { position: fixed; bottom: 16px; right: 16px; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
    .badge-continue { background: #0f3460; color: #48cae4; }
    .badge-done { background: #2d6a4f; color: white; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h3>TURNS</h3>
    <div id="turn-list"></div>
  </div>
  <div id="main">
    <h2 style="color:#e94560;margin-bottom:12px;">Debug Log</h2>
    <div id="log-entries"></div>
  </div>
  <script>
    let ws;
    let currentTurn = 'all';
    let allEntries = [];

    function connect() {
      ws = new WebSocket('ws://localhost:3333');
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'history') {
          allEntries = data.entries;
        } else if (data.type === 'entry') {
          allEntries.push(data.entry);
        }
        render();
      };
      ws.onclose = () => setTimeout(connect, 2000);
    }

    function render() {
      // 更新侧边栏
      const turns = new Set(allEntries.map(e => e.turn));
      const turnList = document.getElementById('turn-list');
      turnList.innerHTML = '<button class="turn-btn ' + (currentTurn === 'all' ? 'active' : '') + '" onclick="selectTurn(\\'all\\')">All</button>';
      for (const t of [...turns].sort((a,b) => a-b)) {
        const entry = allEntries.find(e => e.turn === t);
        const label = entry?.phase || 'turn';
        turnList.innerHTML += '<button class="turn-btn ' + (currentTurn == t ? 'active' : '') + '" onclick="selectTurn(' + t + ')">Turn ' + t + '</button>';
      }

      // 更新主区域
      const entries = currentTurn === 'all' ? allEntries : allEntries.filter(e => e.turn === currentTurn);
      const container = document.getElementById('log-entries');
      container.innerHTML = entries.map(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const detail = formatDetail(entry.detail);
        return '<div class="log-entry phase-' + entry.phase + '">'
          + '<div class="entry-header">' + time + ' | T' + entry.turn + ' | <span class="entry-type">' + entry.phase + ':' + entry.type + '</span></div>'
          + detail
          + '</div>';
      }).join('');

      // 自动滚动到底部
      const main = document.getElementById('main');
      main.scrollTop = main.scrollHeight;
    }

    function formatDetail(obj) {
      if (!obj || Object.keys(obj).length === 0) return '';
      return Object.entries(obj).map(([k, v]) =>
        '<span class="json-key">' + k + '</span>: ' + syntaxHighlight(JSON.stringify(v, null, 2))
      ).join('\n');
    }

    function syntaxHighlight(json) {
      return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
        .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
        .replace(/: (\\d+)/g, ': <span class="json-number">$1</span>');
    }

    function selectTurn(t) { currentTurn = t; render(); }

    connect();
  </script>
</body>
</html>`;

export function startDashboard(port: number = 3334): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_PAGE);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`  Debug dashboard: http://localhost:${port}`);
  });
}
```

### 8.4 修改 CLI 入口

在 `index.ts` 中添加 `--debug` 选项:

```typescript
program
  // ... 已有选项 ...
  .option('--debug', 'Enable debug logging')
  .option('--dashboard', 'Start web debug dashboard (implies --debug)');

program.action(async (prompt, options) => {
  // ... 已有逻辑 ...

  // 教学模式
  if (options.debug || options.dashboard) {
    const { logger } = await import('./debug/logger.js');
    // 启用日志（logger 是单例，设置 enabled）
    (logger as any).enabled = true;

    if (options.dashboard) {
      const { startDashboard } = await import('./debug/dashboard.js');
      startDashboard();
      // WebSocket 在另一个端口
      (logger as any).startWebSocket(3333);
    }

    console.log(chalk.gray(`  Debug log: ~/.claude-mvp/debug.log`));
    if (options.dashboard) {
      console.log(chalk.gray(`  Dashboard: http://localhost:3334`));
    }
  }

  // ... 后续正常启动 REPL ...
});
```

### 8.5 修改依赖

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "fast-glob": "^3.3.0",
    "ws": "^8.16.0"
  }
}
```

### 效果演示

启动教学模式:
```bash
npm run dev -- --dashboard
```

然后在浏览器打开 `http://localhost:3334`，你会看到:

**侧边栏**: 每一轮 Turn 的按钮，点击可过滤
**主区域**: 实时滚动的日志流，每条日志有颜色编码

一个典型的工具调用流程在仪表盘中看起来是:

```
[14:32:01] T1 | api_request:send
  messageCount: 1
  toolCount: 5
  model: "claude-sonnet-4-20250514"

[14:32:01] T1 | api_event:tool_use_start
  id: "toolu_01abc..."
  name: "FileReadTool"

[14:32:01] T1 | api_event:tool_use_end
  id: "toolu_01abc..."
  name: "FileReadTool"
  inputLength: 47
  inputParsed: {
    "file_path": "/home/user/project/src/index.ts"
  }

[14:32:01] T1 | api_response:stop
  stopReason: "tool_use"
  textLength: 23

[14:32:01] T1 | loop_end:continue
  toolUseCount: 1
  textLength: 23

[14:32:01] T1 | message_add:assistant
  contentTypes: ["text", "tool_use"]
  toolUseIds: ["FileReadTool(toolu_01ab)"]

[14:32:01] T1 | tool_perm:allow
  tool: "FileReadTool"

[14:32:01] T1 | tool_call:start
  tool: "FileReadTool"
  toolUseId: "toolu_01abc..."
  input: {"file_path": "/home/user/project/src/index.ts"}

[14:32:02] T1 | tool_result:success
  tool: "FileReadTool"
  outputLength: 523
  outputPreview: "     1  #!/usr/bin/env node\n     2  import { Command } from 'commander';\n     3  ..."

[14:32:02] T1 | message_add:user_tool_results
  toolCount: 1

[14:32:02] T2 | loop_start:begin        ← 新一轮！API 看到工具结果后继续
  messageCount: 3

[14:32:02] T2 | api_request:send
  messageCount: 3
  toolCount: 5

[14:32:03] T2 | api_response:stop
  stopReason: "end_turn"
  textLength: 156

[14:32:03] T2 | loop_end:done
  toolUseCount: 0
  textLength: 156

[14:32:03] T2 | loop_end:final
  reason: "completed"
  totalTurns: 2
```

**通过这个视图，你可以清楚地看到**:
1. Turn 1: API 想读文件 → 执行 FileReadTool → 得到内容
2. Turn 2: API 拿到文件内容后生成最终回复 → 结束
3. messages 从 1 条增长到 3 条（user → assistant+tool_use → user+tool_result）

### 不用仪表盘时

只用 `--debug`（不加 `--dashboard`），日志写入 `~/.claude-mvp/debug.log`，可以在另一个终端用:
```bash
tail -f ~/.claude-mvp/debug.log | jq .
```

### 项目结构更新

```
src/
├── debug/                    ← [阶段8] 教学增强
│   ├── logger.ts             ← 日志系统核心
│   └── dashboard.ts          ← Web 仪表盘
```

---

## 本次修复的问题清单

相比上一版，以下问题已修复：

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | `systemPrompt.ts` 从 `../tools/types.js` 导入 (文件不存在) | 改为 `../types.js`，删除了不存在的 `tools/types.ts` |
| 2 | `stream.ts` 的 tool_use_end 用 `name` 匹配 (同名工具冲突) | 改为用 `id` 精确匹配，在 `content_block_start` 时存储 id |
| 3 | `stop_reason` 的类型断言无法编译 | 提取 `StopReason` 类型，用 `as StopReason` 简洁断言 |
| 4 | `queryLoop` 用 `stopReason` 判断循环 (原始代码说不可靠) | 改用 `needsFollowUp` 标志，与原始代码一致 |
| 5 | REPL 的 `rl.question()` 和 `rl.on('line')` 冲突 | 权限确认用单独的 `permRl` readline 实例 |
| 6 | `stream.ts` 用 for-of 遍历 Map 查找 accumulator | 改为 `Map.get(event.index)` 直接查找 |
| 7 | GrepTool 的 rg 参数顺序 (options 应在 pattern 前) | 修正为 options 在前、pattern 在后 |
| 8 | 项目结构列出了不存在的 `src/tools/types.ts` | 从结构中删除，所有类型统一在 `src/types.ts` |
| 9 | 核心架构说明用 `stop_reason` 判断 | 更正为 `needsFollowUp` 标志，并引用原始代码注释 |

---

## 原始代码 ↔ MVP 对照表

| MVP 文件 | 原始快照文件 | 简化程度 |
|---------|------------|---------|
| `types.ts` | `Tool.ts` + `types/message.ts` + `types/permissions.ts` | 90% |
| `api/client.ts` | `services/api/client.ts` | 80% |
| `api/stream.ts` | `services/api/claude.ts` (流处理部分) | 85% |
| `query/queryLoop.ts` | `query.ts` (核心循环) | 95% |
| `query/toolRunner.ts` | `services/tools/toolOrchestration.ts` | 80% |
| `tools/BashTool.ts` | `tools/BashTool/BashTool.tsx` | 70% |
| `tools/FileReadTool.ts` | `tools/FileReadTool/FileReadTool.ts` | 75% |
| `tools/FileEditTool.ts` | `tools/FileEditTool/FileEditTool.ts` | 70% |
| `tools/GlobTool.ts` | `tools/GlobTool/GlobTool.ts` | 60% |
| `tools/GrepTool.ts` | `tools/GrepTool/GrepTool.ts` | 60% |
| `context/systemPrompt.ts` | `context.ts` + `utils/api.ts` | 80% |
| `ui/repl.ts` | `main.tsx` + REPL 组件树 | 95% |
| `cost/tracker.ts` | `cost-tracker.ts` | 90% |
| `history/history.ts` | `history.ts` | 85% |
