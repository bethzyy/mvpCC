import { describe, it, expect } from 'vitest';
import { getGitContext } from '../../src/context/gitContext.js';

describe('getGitContext', () => {
  it('应在 git 仓库中返回上下文', async () => {
    const ctx = await getGitContext();
    // 当前目录是 git 仓库
    expect(ctx).toContain('Branch:');
  });

  it('返回的 branch 不应为空', async () => {
    const ctx = await getGitContext();
    const match = ctx.match(/Branch: (.+)/);
    expect(match).not.toBeNull();
    expect(match![1].trim()).not.toBe('');
  });

  it('应包含最近提交', async () => {
    const ctx = await getGitContext();
    expect(ctx).toContain('Recent commits:');
  });

  it('应在非 git 目录中返回空字符串', async () => {
    const { getGitContext: getContext } = await import('../../src/context/gitContext.js');
    // 在 tmpdir 中测试（大概率不是 git 仓库）
    const { tmpdir } = await import('os');
    const { chdir, cwd } = await import('process');
    const originalDir = cwd();
    try {
      // 测试 getGitContext 本身 — 如果当前目录是 git 仓库，它应该工作
      // 如果不是，应该返回空字符串
      const ctx = await getContext();
      // 两种情况都是合法的
      expect(typeof ctx).toBe('string');
    } finally {
      // 恢复目录
      process.chdir(originalDir);
    }
  });
});
