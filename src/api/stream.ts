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
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required,
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
    model: options.model || process.env.ANTHROPIC_MODEL || 'glm-5-turbo',
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
          const acc = toolBlocks.get(event.index);
          if (acc) {
            acc.inputJson += event.delta.partial_json;
          }
        }
        break;
      }

      case 'content_block_stop': {
        // ★ JSON 拼接完成，解析完整输入
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
            id: acc.id,
            name: acc.name,
            input: parsedInput,
          };
        }
        break;
      }

      case 'message_delta': {
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
