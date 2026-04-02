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
  onTurnStart?: (turn: number, messageCount: number) => void;
  onTurnEnd?: (turn: number, reason: string, toolCount: number, textLen: number) => void;
  onToolResult?: (turn: number, name: string, output: string, isError?: boolean) => void;
}

export async function* queryLoop(
  initialMessages: ConversationMessage[],
  options: QueryLoopOptions,
): AsyncGenerator<StreamEvent, QueryResult, unknown> {
  const {
    client, tools, systemPrompt, signal,
    model, maxTurns = 100, askPermission,
    onTurnStart, onTurnEnd, onToolResult,
  } = options;

  // ★ 可变消息列表 — 每轮循环都会追加
  let messages: ConversationMessage[] = [...initialMessages];
  let turnCount = 0;

  // ★ 这就是原始 query.ts 的 while(true) 循环 (第 307 行)
  while (true) {
    if (signal?.aborted) return { reason: 'aborted' };
    if (++turnCount > maxTurns) return { reason: 'max_turns' };

    onTurnStart?.(turnCount, messages.length);

    // ★ 原始代码的 needsFollowUp 标志 (第 376 行)
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
          toolUseBlocks.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: {},
          });
          needsFollowUp = true;
          yield event;
          break;

        case 'tool_use_end':
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
    onTurnEnd?.(turnCount, needsFollowUp ? 'continue' : 'done', toolUseBlocks.length, currentText.length);

    if (!needsFollowUp) {
      if (currentText) {
        messages.push({
          role: 'assistant',
          content: [{ type: 'text', text: currentText }],
        });
      }
      return { reason: 'completed' };
    }

    // ③ 构造 assistant message (text + tool_use blocks)
    const assistantContent: ContentBlock[] = [];
    if (currentText) {
      assistantContent.push({ type: 'text', text: currentText });
    }
    assistantContent.push(...toolUseBlocks);
    messages.push({ role: 'assistant', content: assistantContent });

    // ④ 逐个执行工具
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
        onToolResult?.(turnCount, toolUse.name, `Unknown tool`, true);
        continue;
      }

      const result = await executeTool(
        tool, toolUse.id, toolUse.input, askPermission
      );
      toolResults.push(result);
      onToolResult?.(turnCount, toolUse.name, result.content.slice(0, 200), result.is_error);
    }

    // ⑤ 构造 user message (包含所有 tool_result)
    messages.push({ role: 'user', content: toolResults });
  }
}
