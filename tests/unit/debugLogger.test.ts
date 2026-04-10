import { describe, it, expect, afterAll } from 'vitest';
import { debugLog, debugError } from '../../src/utils/debugLogger.js';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const LOG_FILE = join(homedir(), '.claude-mvp', 'debug.log');

describe('debugLogger', () => {
  afterAll(async () => {
    // 清理测试产生的日志
    await unlink(LOG_FILE).catch(() => {});
  });

  it('debugLog 应写入日志文件', async () => {
    await debugLog('test-message-unique-12345');
    const content = await readFile(LOG_FILE, 'utf-8');
    expect(content).toContain('test-message-unique-12345');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/); // 包含 ISO 时间戳
  });

  it('debugError 应记录错误信息', async () => {
    await debugError('test-error-789', new Error('test error body'));
    const content = await readFile(LOG_FILE, 'utf-8');
    expect(content).toContain('test-error-789');
    expect(content).toContain('test error body');
  });

  it('debugError 应处理非 Error 对象', async () => {
    await debugError('test-non-error', 'string error');
    const content = await readFile(LOG_FILE, 'utf-8');
    expect(content).toContain('test-non-error');
    expect(content).toContain('string error');
  });
});
