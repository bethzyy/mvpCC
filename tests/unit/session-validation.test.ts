import { describe, it, expect } from 'vitest';
import { loadSession, cleanupSessions, saveSession } from '../../src/context/session.js';
import { mkdir, writeFile, readFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SESSIONS_DIR = join(homedir(), '.claude-mvp', 'sessions');

describe('session validation', () => {
  describe('loadSession', () => {
    it('应拒绝包含特殊字符的 ID', async () => {
      expect(await loadSession('../etc/passwd')).toBeNull();
      expect(await loadSession('foo/bar')).toBeNull();
      expect(await loadSession('foo;rm -rf /')).toBeNull();
      expect(await loadSession('session-123')).toBeNull(); // 不存在的会话也返回 null
    });

    it('应拒绝包含空格的 ID', async () => {
      expect(await loadSession('session 123')).toBeNull();
    });

    it('应拒绝空字符串 ID', async () => {
      expect(await loadSession('')).toBeNull();
    });

    it('应处理损坏的 JSON 文件', async () => {
      await mkdir(SESSIONS_DIR, { recursive: true });
      const badFile = join(SESSIONS_DIR, 'session-bad-json-test.json');
      await writeFile(badFile, 'not valid json{{{', 'utf-8');
      try {
        expect(await loadSession('session-bad-json-test')).toBeNull();
      } finally {
        await unlink(badFile).catch(() => {});
      }
    });

    it('应拒绝缺少 messages 字段的 JSON', async () => {
      await mkdir(SESSIONS_DIR, { recursive: true });
      const badFile = join(SESSIONS_DIR, 'session-no-messages-test.json');
      await writeFile(badFile, JSON.stringify({ id: 'test', timestamp: '2026-01-01' }), 'utf-8');
      try {
        expect(await loadSession('session-no-messages-test')).toBeNull();
      } finally {
        await unlink(badFile).catch(() => {});
      }
    });

    it('应拒绝 messages 不是数组的 JSON', async () => {
      await mkdir(SESSIONS_DIR, { recursive: true });
      const badFile = join(SESSIONS_DIR, 'session-bad-messages-test.json');
      await writeFile(badFile, JSON.stringify({ id: 'test', messages: 'not-array' }), 'utf-8');
      try {
        expect(await loadSession('session-bad-messages-test')).toBeNull();
      } finally {
        await unlink(badFile).catch(() => {});
      }
    });

    it('应成功加载有效会话', async () => {
      const id = await saveSession([{ role: 'user', content: 'hello' }], '/tmp');
      try {
        const messages = await loadSession(id);
        expect(messages).not.toBeNull();
        expect(messages!.length).toBe(1);
        expect(messages![0].content).toBe('hello');
      } finally {
        await unlink(join(SESSIONS_DIR, `${id}.json`)).catch(() => {});
      }
    });
  });

  describe('cleanupSessions', () => {
    it('应返回清理数量（>= 0）', async () => {
      const count = await cleanupSessions(365); // 365天前的会话，基本不会清理到
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('maxAgeDays=0 应清理所有会话', async () => {
      // 先创建一个临时会话
      const id = await saveSession([{ role: 'user', content: 'temp' }], '/tmp');
      // maxAgeDays=0 意味着所有会话都过期
      const count = await cleanupSessions(0);
      expect(count).toBeGreaterThanOrEqual(1);
      // 验证会话已被清理
      expect(await loadSession(id)).toBeNull();
    });
  });
});
