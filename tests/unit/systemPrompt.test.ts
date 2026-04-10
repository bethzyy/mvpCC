import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/context/systemPrompt.js';
import type { ToolDefinition } from '../../src/types.js';

const mockTool: ToolDefinition = {
  name: 'MockTool',
  description: 'A mock tool for testing',
  inputSchema: {
    type: 'object',
    properties: { input: { type: 'string' } },
    required: ['input'],
  },
  call: async () => ({ output: 'mock' }),
};

describe('buildSystemPrompt', () => {
  it('应包含工具名称和描述', () => {
    const prompt = buildSystemPrompt([mockTool], '');
    expect(prompt).toContain('MockTool');
    expect(prompt).toContain('A mock tool for testing');
  });

  it('应包含工具输入 schema', () => {
    const prompt = buildSystemPrompt([mockTool], '');
    expect(prompt).toContain('input');
  });

  it('应包含 git 上下文', () => {
    const gitCtx = 'Branch: main\nStatus: clean';
    const prompt = buildSystemPrompt([], gitCtx);
    expect(prompt).toContain('Git Context');
    expect(prompt).toContain('main');
  });

  it('无 git 上下文时不应包含 Git Context 段', () => {
    const prompt = buildSystemPrompt([], '');
    expect(prompt).not.toContain('Git Context');
  });

  it('应包含当前日期', () => {
    const today = new Date().toISOString().split('T')[0];
    const prompt = buildSystemPrompt([], '');
    expect(prompt).toContain(today);
  });

  it('空工具列表不应崩溃', () => {
    const prompt = buildSystemPrompt([], '');
    expect(prompt).toContain('Claude Code');
  });

  it('应包含 "CRITICAL: Response Focus" 段落，强调只回复最新消息', () => {
    const prompt = buildSystemPrompt([], '');
    expect(prompt).toContain('CRITICAL: Response Focus');
    expect(prompt).toContain('MOST RECENT message');
    expect(prompt).toContain('Do NOT');
  });
});
