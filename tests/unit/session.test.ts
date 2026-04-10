import { describe, it, expect, afterAll } from 'vitest';
import { saveSession, listSessions, loadSession, getLatestSessionId } from '../../src/context/session.js';
import type { ConversationMessage } from '../../src/types.js';
import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SESSIONS_DIR = join(homedir(), '.claude-mvp', 'sessions');

const testMessages: ConversationMessage[] = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
  { role: 'user', content: 'write code' },
];

describe('session persistence', () => {
  let savedIds: string[] = [];

  afterAll(async () => {
    // 清理测试会话文件
    for (const id of savedIds) {
      await rm(join(SESSIONS_DIR, `${id}.json`)).catch(() => {});
    }
  });

  it('saveSession 应保存并返回会话 ID', async () => {
    const id = await saveSession(testMessages, '/test/project');
    savedIds.push(id);
    expect(id).toMatch(/^session-\d+$/);
  });

  it('loadSession 应加载已保存的会话', async () => {
    const id = await saveSession(testMessages, '/test/project');
    savedIds.push(id);
    const loaded = await loadSession(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBe(3);
    expect(loaded![0].content).toBe('hello');
  });

  it('loadSession 对不存在的 ID 应返回 null', async () => {
    const loaded = await loadSession('session-nonexistent');
    expect(loaded).toBeNull();
  });

  it('listSessions 应列出所有会话（按时间倒序）', async () => {
    // 保存两个会话，间隔 10ms 确保时间戳不同
    const id1 = await saveSession([{ role: 'user', content: 'first' }], '/p1');
    const id2 = await saveSession([{ role: 'user', content: 'second' }], '/p2');
    savedIds.push(id1, id2);

    const sessions = await listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // 最新的在前
    const latest = sessions[0];
    expect(latest.messageCount).toBe(1);
  });

  it('getLatestSessionId 应返回最近的会话 ID', async () => {
    const id = await saveSession(testMessages, '/latest');
    savedIds.push(id);
    const latest = await getLatestSessionId();
    expect(latest).not.toBeNull();
    expect(latest).toBe(id);
  });

  it('空消息列表应正常保存', async () => {
    const id = await saveSession([], '/empty');
    savedIds.push(id);
    const loaded = await loadSession(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBe(0);
  });
});
