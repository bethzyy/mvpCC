import { describe, it, expect } from 'vitest';
import { queryLoop } from '../../src/query/queryLoop.js';
import type { ConversationMessage, ToolDefinition, StreamEvent } from '../../src/types.js';
import { createMockClient, textResponse, toolUseResponse } from '../helpers/mockClient.js';

const EchoTool: ToolDefinition = {
  name: 'EchoTool',
  description: 'Echoes input back',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  call: async (input) => ({ output: `Echo: ${input.text}` }),
};

const FailTool: ToolDefinition = {
  name: 'FailTool',
  description: 'Always fails',
  inputSchema: { type: 'object', properties: {} },
  call: async () => { throw new Error('Intentional failure'); },
};

const DenyTool: ToolDefinition = {
  name: 'DenyTool',
  description: 'Always denied',
  inputSchema: { type: 'object', properties: {} },
  checkPermissions: () => ({ behavior: 'deny' as const, message: 'Nope' }),
  call: async () => ({ output: 'should not reach' }),
};

// ★ 消费 generator 并返回 { events, returnValue }
async function runQueryLoop(messages: ConversationMessage[], options: any) {
  const events: StreamEvent[] = [];
  let returnValue: any = undefined;
  const gen = queryLoop(messages, options);
  // 手动迭代以捕获 return value
  let result = await gen.next();
  while (!result.done) {
    events.push(result.value);
    result = await gen.next();
  }
  // result.done === true 时，result.value 就是 generator 的 return 值
  if (result.value !== undefined) {
    returnValue = result.value;
  }
  return { events, returnValue };
}

describe('queryLoop - 集成测试', () => {
  it('纯文本对话：不触发工具', async () => {
    const client = createMockClient([textResponse('Hello!', 10, 5)]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'hi' }];
    const { events, returnValue } = await runQueryLoop(messages, {
      client, tools: [], systemPrompt: '',
      askPermission: async () => true,
    });
    const textParts = events.filter(e => e.type === 'text_delta');
    expect(textParts.map(e => (e as any).text).join('')).toBe('Hello!');
    expect(returnValue.reason).toBe('completed');
  });

  it('单轮工具调用：调用工具后生成最终回复', async () => {
    const client = createMockClient([
      toolUseResponse('EchoTool', 'tool_001', '{"text":"hello"}'),
      textResponse('Got echo result', 20, 10),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'echo something' }];
    const { events, returnValue } = await runQueryLoop(messages, {
      client, tools: [EchoTool], systemPrompt: '',
      askPermission: async () => true,
    });
    const toolStarts = events.filter(e => e.type === 'tool_use_start');
    expect(toolStarts.length).toBe(1);
    expect((toolStarts[0] as any).name).toBe('EchoTool');
    const textParts = events.filter(e => e.type === 'text_delta');
    expect(textParts.map(e => (e as any).text).join('')).toBe('Got echo result');
    expect(returnValue.reason).toBe('completed');
  });

  it('多轮工具调用：连续调用两个工具', async () => {
    const client = createMockClient([
      toolUseResponse('EchoTool', 'tool_001', '{"text":"first"}'),
      toolUseResponse('EchoTool', 'tool_002', '{"text":"second"}'),
      textResponse('Done with two calls', 30, 10),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'echo twice' }];
    const { events } = await runQueryLoop(messages, {
      client, tools: [EchoTool], systemPrompt: '',
      askPermission: async () => true,
    });
    const toolStarts = events.filter(e => e.type === 'tool_use_start');
    expect(toolStarts.length).toBe(2);
  });

  it('工具执行失败：应返回错误但不中断循环', async () => {
    const client = createMockClient([
      toolUseResponse('FailTool', 'tool_fail', '{}'),
      textResponse('Tool failed but I recovered', 20, 10),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'trigger failure' }];
    const { events } = await runQueryLoop(messages, {
      client, tools: [FailTool], systemPrompt: '',
      askPermission: async () => true,
    });
    const textParts = events.filter(e => e.type === 'text_delta');
    expect(textParts.map(e => (e as any).text).join('')).toBe('Tool failed but I recovered');
  });

  it('权限拒绝：deny 工具应返回错误消息', async () => {
    const client = createMockClient([
      toolUseResponse('DenyTool', 'tool_deny', '{}'),
      textResponse('Permission denied, try something else', 20, 10),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'try denied tool' }];
    const { events } = await runQueryLoop(messages, {
      client, tools: [DenyTool], systemPrompt: '',
      askPermission: async () => true,
    });
    const textParts = events.filter(e => e.type === 'text_delta');
    expect(textParts.length).toBeGreaterThan(0);
  });

  it('未知工具：应返回错误而非崩溃', async () => {
    const client = createMockClient([
      toolUseResponse('UnknownTool', 'tool_unk', '{}'),
      textResponse('That tool does not exist', 20, 10),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'use unknown tool' }];
    const { events } = await runQueryLoop(messages, {
      client, tools: [EchoTool], systemPrompt: '',
      askPermission: async () => true,
    });
    const textParts = events.filter(e => e.type === 'text_delta');
    expect(textParts.length).toBeGreaterThan(0);
  });

  it('max_turns 限制：达到上限时应停止', async () => {
    const client = createMockClient([
      toolUseResponse('EchoTool', 'tool_1', '{"text":"a"}'),
      toolUseResponse('EchoTool', 'tool_2', '{"text":"b"}'),
      toolUseResponse('EchoTool', 'tool_3', '{"text":"c"}'),
      textResponse('Done', 10, 5),
    ]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'loop' }];
    const { returnValue } = await runQueryLoop(messages, {
      client, tools: [EchoTool], systemPrompt: '',
      maxTurns: 2,
      askPermission: async () => true,
    });
    expect(returnValue.reason).toBe('max_turns');
  });

  it('abort 中断：signal 取消时应停止', async () => {
    const abortController = new AbortController();
    abortController.abort();
    const client = createMockClient([textResponse('Should not see this', 10, 5)]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'abort' }];
    const { returnValue } = await runQueryLoop(messages, {
      client, tools: [], systemPrompt: '',
      signal: abortController.signal,
      askPermission: async () => true,
    });
    expect(returnValue.reason).toBe('aborted');
  });

  it('onTurnStart/onTurnEnd 回调应被调用', async () => {
    const client = createMockClient([textResponse('OK', 10, 5)]);
    const messages: ConversationMessage[] = [{ role: 'user', content: 'hi' }];
    const turns: string[] = [];
    await runQueryLoop(messages, {
      client, tools: [], systemPrompt: '',
      askPermission: async () => true,
      onTurnStart: (turn) => turns.push(`start:${turn}`),
      onTurnEnd: (turn, reason) => turns.push(`end:${turn}:${reason}`),
    });
    expect(turns).toContain('start:1');
    expect(turns).toContain('end:1:done');
  });
});
