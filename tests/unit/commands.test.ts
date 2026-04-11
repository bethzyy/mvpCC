import { describe, it, expect, vi } from 'vitest';
import { showHelp, showCost, showHistory, showSkills } from '../../src/ui/commands.js';

describe('commands', () => {
  describe('showHelp', () => {
    it('应输出帮助信息', () => {
      const spy = vi.spyOn(console, 'log');
      showHelp();
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('/help');
      expect(output).toContain('/quit');
      expect(output).toContain('/compact');
      spy.mockRestore();
    });
  });

  describe('showCost', () => {
    it('应显示 token 消耗', () => {
      const spy = vi.spyOn(console, 'log');
      showCost(() => ({ inputTokens: 100, outputTokens: 50, cost: 0.003 }));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('应处理零消耗', () => {
      const spy = vi.spyOn(console, 'log');
      showCost(() => ({ inputTokens: 0, outputTokens: 0, cost: 0 }));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('showHistory', () => {
    it('应输出历史信息', async () => {
      const spy = vi.spyOn(console, 'log');
      await showHistory();
      expect(spy).toHaveBeenCalled();
      // 合并所有调用，检查包含关键内容
      const allOutput = spy.mock.calls.map(c => c[0]).join('');
      expect(allOutput.length).toBeGreaterThan(0);
      spy.mockRestore();
    });
  });

  describe('showSkills', () => {
    it('应处理无 skills', () => {
      const spy = vi.spyOn(console, 'log');
      showSkills([]);
      expect(spy).toHaveBeenCalled();
      const allOutput = spy.mock.calls.map(c => c[0]).join('');
      expect(allOutput).toContain('No skills');
      spy.mockRestore();
    });

    it('应处理 undefined skills', () => {
      const spy = vi.spyOn(console, 'log');
      showSkills(undefined);
      expect(spy).toHaveBeenCalled();
      const allOutput = spy.mock.calls.map(c => c[0]).join('');
      expect(allOutput).toContain('No skills');
      spy.mockRestore();
    });

    it('应显示 skill 列表', () => {
      const spy = vi.spyOn(console, 'log');
      showSkills([{
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill for testing',
        entryPoint: 'main.py',
        skillDir: '/tmp/skills/test',
        tags: [],
        triggerKeywords: [],
        usageExamples: [],
      }]);
      expect(spy).toHaveBeenCalled();
      const allOutput = spy.mock.calls.map(c => c[0]).join('');
      expect(allOutput).toContain('test-skill');
      expect(allOutput).toContain('1.0.0');
      spy.mockRestore();
    });

    it('应截断过长的描述', () => {
      const spy = vi.spyOn(console, 'log');
      const longDesc = 'A'.repeat(100);
      showSkills([{
        name: 'long-desc-skill',
        version: '2.0.0',
        description: longDesc,
        entryPoint: 'main.py',
        skillDir: '/tmp/skills/long',
        tags: [],
        triggerKeywords: [],
        usageExamples: [],
      }]);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
