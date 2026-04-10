import { describe, it, expect } from 'vitest';
import { estimateTokens, shouldCompact } from '../../src/context/compactor.js';
import type { ConversationMessage } from '../../src/types.js';

function makeMessages(count: number, charsPerMessage = 100): ConversationMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `Message ${i}: ${'x'.repeat(charsPerMessage)}`,
  }));
}

describe('estimateTokens', () => {
  it('应返回非零估算值', () => {
    const messages = makeMessages(5);
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it('更多消息应产生更多 tokens', () => {
    const few = estimateTokens(makeMessages(5));
    const many = estimateTokens(makeMessages(50));
    expect(many).toBeGreaterThan(few);
  });

  it('空消息数组应返回 0', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('应处理包含 content block 的消息', () => {
    const messages: ConversationMessage[] = [{
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'BashTool', input: { command: 'ls' } },
        { type: 'tool_result', tool_use_id: 't1', content: 'file1.txt' },
      ],
    }];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('shouldCompact', () => {
  it('少量消息不应触发压缩', () => {
    expect(shouldCompact(makeMessages(5))).toBe(false);
  });

  it('大量消息应触发压缩', () => {
    // 128K tokens ≈ 512K chars，每条 100 chars → 需要约 5120 条消息
    // 但阈值是 115K ≈ 460K chars → 约 4600 条
    // 用更大的消息来减少测试数据量
    const messages = makeMessages(5000, 100);
    expect(shouldCompact(messages)).toBe(true);
  });

  it('自定义 context window 应生效', () => {
    // 极小的 context window
    const messages = makeMessages(5, 100);
    expect(shouldCompact(messages, 200)).toBe(true); // 200 - 13K buffer 会是负数，所以总是 true
  });

  it('空消息不应触发压缩', () => {
    expect(shouldCompact([])).toBe(false);
  });
});
