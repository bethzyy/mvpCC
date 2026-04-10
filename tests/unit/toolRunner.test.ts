import { describe, it, expect } from 'vitest';
import { executeTool } from '../../src/query/toolRunner.js';
import type { ToolDefinition } from '../../src/types.js';

function makeTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'TestTool',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: {} },
    call: async () => ({ output: 'ok' }),
    ...overrides,
  };
}

describe('executeTool', () => {
  it('无权限检查时应自动允许', async () => {
    const tool = makeTool();
    const result = await executeTool(tool, 'id-1', {}, async () => false);
    expect(result.type).toBe('tool_result');
    expect(result.tool_use_id).toBe('id-1');
    expect(result.content).toBe('ok');
    expect(result.is_error).toBeFalsy();
  });

  it('权限 allow 时应正常执行', async () => {
    const tool = makeTool({
      checkPermissions: () => ({ behavior: 'allow' }),
    });
    const result = await executeTool(tool, 'id-2', {}, async () => false);
    expect(result.content).toBe('ok');
    expect(result.is_error).toBeFalsy();
  });

  it('权限 deny 时应返回错误', async () => {
    const tool = makeTool({
      checkPermissions: () => ({ behavior: 'deny', message: 'Blocked!' }),
    });
    const result = await executeTool(tool, 'id-3', {}, async () => false);
    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Blocked!');
  });

  it('权限 ask + 用户同意时应正常执行', async () => {
    const tool = makeTool({
      checkPermissions: () => ({ behavior: 'ask', message: 'Sure?' }),
    });
    const result = await executeTool(tool, 'id-4', {}, async () => true);
    expect(result.content).toBe('ok');
    expect(result.is_error).toBeFalsy();
  });

  it('权限 ask + 用户拒绝时应返回错误', async () => {
    const tool = makeTool({
      checkPermissions: () => ({ behavior: 'ask', message: 'Sure?' }),
    });
    const result = await executeTool(tool, 'id-5', {}, async () => false);
    expect(result.is_error).toBe(true);
    expect(result.content).toBe('User denied permission');
  });

  it('工具执行抛异常时应捕获并返回错误', async () => {
    const tool = makeTool({
      call: async () => { throw new Error('Tool exploded!'); },
    });
    const result = await executeTool(tool, 'id-6', {}, async () => true);
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Tool exploded!');
  });
});
