import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ConversationMessage } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.claude-mvp', 'sessions');

export interface SessionMeta {
  id: string;
  timestamp: string;
  cwd: string;
  messageCount: number;
}

export interface SessionData extends SessionMeta {
  messages: ConversationMessage[];
}

// 确保会话目录存在
async function ensureSessionsDir(): Promise<void> {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

// 生成会话 ID
function generateSessionId(): string {
  return `session-${Date.now()}`;
}

/**
 * 保存会话到磁盘
 */
export async function saveSession(
  messages: ConversationMessage[],
  cwd: string,
): Promise<string> {
  await ensureSessionsDir();
  const id = generateSessionId();
  const data: SessionData = {
    id,
    timestamp: new Date().toISOString(),
    cwd,
    messageCount: messages.length,
    messages,
  };
  const filePath = join(SESSIONS_DIR, `${id}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return id;
}

/**
 * 列出所有会话（按时间倒序）
 */
export async function listSessions(): Promise<SessionMeta[]> {
  await ensureSessionsDir();
  const files = await readdir(SESSIONS_DIR);
  const sessions: SessionMeta[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(SESSIONS_DIR, file), 'utf-8');
      const data: SessionData = JSON.parse(content);
      sessions.push({
        id: data.id,
        timestamp: data.timestamp,
        cwd: data.cwd,
        messageCount: data.messageCount,
      });
    } catch {
      // 跳过损坏的会话文件
    }
  }

  return sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * 按 ID 加载会话的 messages
 */
export async function loadSession(id: string): Promise<ConversationMessage[] | null> {
  const filePath = join(SESSIONS_DIR, `${id}.json`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const data: SessionData = JSON.parse(content);
    return data.messages;
  } catch {
    return null;
  }
}

/**
 * 获取最近一个会话的 ID
 */
export async function getLatestSessionId(): Promise<string | null> {
  const sessions = await listSessions();
  return sessions.length > 0 ? sessions[0].id : null;
}
