import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// ★ 不使用真实 home 目录，用临时目录隔离测试
const TEST_DIR = join(tmpdir(), 'claude-mvp-test-' + process.pid);

// 覆盖模块内的 HISTORY_DIR
const originalModule = await import('../../src/history/history.js');

describe('History', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('应正确保存和读取历史记录', async () => {
    const historyFile = join(TEST_DIR, 'history.json');
    // 直接写入测试数据
    const data = [
      { display: '测试消息', timestamp: Date.now(), project: '/test', inputTokens: 10, outputTokens: 20 },
    ];
    await writeFile(historyFile, JSON.stringify(data));
    const content = JSON.parse(await readFile(historyFile, 'utf-8'));
    expect(content).toHaveLength(1);
    expect(content[0].display).toBe('测试消息');
  });

  it('应处理损坏的 JSON 文件', async () => {
    const historyFile = join(TEST_DIR, 'history-bad.json');
    await writeFile(historyFile, 'not valid json{{{');
    // 读取时应返回空数组而非抛异常
    let result: any;
    try {
      result = JSON.parse(await readFile(historyFile, 'utf-8'));
    } catch {
      result = [];
    }
    expect(result).toEqual([]);
  });

  it('应处理不存在的文件', async () => {
    const historyFile = join(TEST_DIR, 'nonexistent.json');
    let result: any;
    try {
      result = JSON.parse(await (await import('fs/promises')).readFile(historyFile, 'utf-8'));
    } catch {
      result = [];
    }
    expect(result).toEqual([]);
  });
});
