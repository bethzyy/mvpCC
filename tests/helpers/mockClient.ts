import type { StreamEvent } from '../../src/types.js';

// ★ 模拟 Anthropic SDK 的流式响应
// 用于测试 queryLoop 和 streamMessages，无需真实 API 调用

export interface MockStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string };
  message?: { usage?: { input_tokens: number; output_tokens: number } };
  usage?: { output_tokens: number };
}

// ★ 创建一个异步可迭代对象
function createAsyncIterable(events: MockStreamEvent[]): AsyncIterable<any> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < events.length) {
            return { value: events[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

export function createMockClient(events: MockStreamEvent[][]): any {
  let callIndex = 0;
  return {
    messages: {
      stream: (_params: any, _opts: any) => {
        const evts = events[Math.min(callIndex, events.length - 1)];
        callIndex++;
        return createAsyncIterable(evts);
      },
    },
  };
}

// ★ 快捷构造器

export function textResponse(text: string, inputTokens = 10, outputTokens = text.length): MockStreamEvent[] {
  return [
    { type: 'message_start', message: { usage: { input_tokens: inputTokens, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: outputTokens } },
  ];
}

export function toolUseResponse(toolName: string, toolId: string, inputJson: string, textBefore = ''): MockStreamEvent[] {
  const events: MockStreamEvent[] = [
    { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
  ];
  if (textBefore) {
    events.push(
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: textBefore } },
      { type: 'content_block_stop', index: 0 },
    );
  }
  const toolIndex = events.length - 1;
  events.push(
    { type: 'content_block_start', index: toolIndex, content_block: { type: 'tool_use', id: toolId, name: toolName } },
    { type: 'content_block_delta', index: toolIndex, delta: { type: 'input_json_delta', partial_json: inputJson } },
    { type: 'content_block_stop', index: toolIndex },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
  );
  return events;
}

// ★ 收集 queryLoop 的所有 yield 事件
export async function collectEvents(generator: AsyncGenerator<StreamEvent, any, unknown>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}
