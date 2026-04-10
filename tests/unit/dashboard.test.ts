import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startDashboard, stopDashboard, getClientCount } from '../../src/debug/dashboard.js';
import WebSocket from 'ws';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const TEST_PORT = 13342;

describe('dashboard', () => {
  let broadcast: ReturnType<typeof startDashboard>;

  beforeEach(async () => {
    // 确保会话目录存在（debugLogger 需要）
    await mkdir(join(homedir(), '.claude-mvp'), { recursive: true }).catch(() => {});
    // 确保前一个测试的服务器完全关闭
    await stopDashboard();
    await new Promise(r => setTimeout(r, 100));
  });

  afterEach(async () => {
    await stopDashboard();
  });

  it('startDashboard 应启动 HTTP 服务器', async () => {
    broadcast = startDashboard(TEST_PORT);
    await new Promise(r => setTimeout(r, 200));
    expect(getClientCount()).toBe(0);
  });

  it('broadcast 应发送日志到 WebSocket 客户端', async () => {
    broadcast = startDashboard(TEST_PORT);
    await new Promise(r => setTimeout(r, 200));

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // 等待连接稳定
    await new Promise(r => setTimeout(r, 100));

    // 发送日志
    broadcast({
      timestamp: new Date().toISOString(),
      type: 'tool',
      detail: 'Test log entry',
    });

    // 接收日志
    const entry = await new Promise<any>((resolve, reject) => {
      ws.on('message', (data) => {
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          reject(e);
        }
      });
      setTimeout(() => reject(new Error('timeout')), 2000);
    });

    expect(entry.type).toBe('tool');
    expect(entry.detail).toBe('Test log entry');
    expect(entry.timestamp).toBeDefined();

    ws.close();
  });

  it('stopDashboard 应关闭所有连接', async () => {
    broadcast = startDashboard(TEST_PORT);
    await new Promise(r => setTimeout(r, 200));

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => { ws.on('open', resolve); });

    await stopDashboard();

    // 等待连接关闭
    await new Promise(r => setTimeout(r, 200));
    expect(getClientCount()).toBe(0);
  });

  it('getClientCount 应返回当前连接数', async () => {
    broadcast = startDashboard(TEST_PORT);
    await new Promise(r => setTimeout(r, 200));
    expect(getClientCount()).toBe(0);

    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => { ws1.on('open', resolve); });
    expect(getClientCount()).toBe(1);

    const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => { ws2.on('open', resolve); });
    expect(getClientCount()).toBe(2);

    ws1.close();
    ws2.close();
  });
});
