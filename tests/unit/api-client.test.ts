import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '../../src/api/client.js';

const ORIGINAL_KEY = process.env.ZHIPU_API_KEY;
const ORIGINAL_URL = process.env.ANTHROPIC_BASE_URL;
const ORIGINAL_TIMEOUT = process.env.CLAUDE_TIMEOUT;

describe('createApiClient', () => {
  beforeEach(() => {
    delete process.env.ZHIPU_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLAUDE_TIMEOUT;
  });

  afterEach(() => {
    if (ORIGINAL_KEY) process.env.ZHIPU_API_KEY = ORIGINAL_KEY;
    else delete process.env.ZHIPU_API_KEY;
    if (ORIGINAL_URL) process.env.ANTHROPIC_BASE_URL = ORIGINAL_URL;
    else delete process.env.ANTHROPIC_BASE_URL;
    if (ORIGINAL_TIMEOUT) process.env.CLAUDE_TIMEOUT = ORIGINAL_TIMEOUT;
    else delete process.env.CLAUDE_TIMEOUT;
  });

  it('缺少 ZHIPU_API_KEY 时应抛出错误', () => {
    expect(() => createApiClient()).toThrow('ZHIPU_API_KEY');
  });

  it('应使用有效的 API key 创建客户端', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('应使用自定义 base URL', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    process.env.ANTHROPIC_BASE_URL = 'https://custom.api.example.com';
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('应使用默认 base URL', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('应使用默认超时', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('应使用自定义超时 (CLAUDE_TIMEOUT)', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    process.env.CLAUDE_TIMEOUT = '30000';
    const client = createApiClient();
    expect(client).toBeDefined();
  });

  it('应忽略无效的 CLAUDE_TIMEOUT', () => {
    process.env.ZHIPU_API_KEY = 'test-id.test-secret';
    process.env.CLAUDE_TIMEOUT = 'not-a-number';
    const client = createApiClient();
    expect(client).toBeDefined();
  });
});
