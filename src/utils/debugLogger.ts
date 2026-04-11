import { appendFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { LogEntry } from '../debug/dashboard.js';

const LOG_DIR = join(homedir(), '.claude-mvp');
const LOG_FILE = join(LOG_DIR, 'debug.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

let initialized = false;
let currentLogLevel = LogLevel.INFO;

// ★ 广播回调 — 仪表盘激活时设置
let broadcastFn: ((entry: LogEntry) => void) | null = null;

/**
 * 设置日志广播回调（由 dashboard 启动时调用）
 */
export function setLogBroadcast(fn: (entry: LogEntry) => void): void {
  broadcastFn = fn;
}

async function ensureLogDir() {
  if (!initialized) {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
    // 从环境变量读取日志级别
    const envLevel = process.env.CLAUDE_LOG_LEVEL?.toUpperCase();
    if (envLevel === 'ERROR') currentLogLevel = LogLevel.ERROR;
    else if (envLevel === 'WARN') currentLogLevel = LogLevel.WARN;
    else if (envLevel === 'DEBUG') currentLogLevel = LogLevel.DEBUG;
  }
}

/**
 * 日志轮转: 超过 10MB 时重命名旧日志
 */
async function rotateLogIfNeeded(): Promise<void> {
  try {
    const stats = await stat(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const { rename } = await import('fs/promises');
      const backupFile = LOG_FILE + '.' + Date.now();
      await rename(LOG_FILE, backupFile);
    }
  } catch { /* file doesn't exist yet */ }
}

/**
 * 写入 debug 日志到 ~/.claude-mvp/debug.log（追加模式）
 * 同时广播到仪表盘 WebSocket（如果已激活）
 */
export async function debugLog(message: string, verbose = false): Promise<void> {
  try {
    await ensureLogDir();
    await rotateLogIfNeeded();

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    if (verbose) {
      process.stderr.write(`[DEBUG] ${line}`);
    }
    await appendFile(LOG_FILE, line, 'utf-8');

    // ★ 广播到仪表盘
    if (broadcastFn) {
      const type = guessLogType(message);
      broadcastFn({ timestamp, type, detail: message });
    }
  } catch {
    // 日志写入失败不应影响主流程
  }
}

/**
 * 记录错误（含 stack trace）
 */
export async function debugError(message: string, error: unknown, verbose = false): Promise<void> {
  const stack = error instanceof Error ? error.stack : String(error);
  await debugLog(`ERROR: ${message}\n${stack}`, verbose);
}

/**
 * 根据日志内容推断日志类型
 */
function guessLogType(message: string): LogEntry['type'] {
  if (message.includes('Turn ') && message.includes('start')) return 'turn_start';
  if (message.includes('Turn ') && message.includes('end')) return 'turn_end';
  if (message.includes('Executing tool:') || message.includes('\u7ED3\u679C:')) return 'tool';
  if (message.includes('API call:') || message.includes('input tokens') || message.includes('output tokens')) return 'api';
  if (message.includes('User input:') || message.includes('Response done:')) return 'msg';
  if (message.includes('COMPACT')) return 'compact';
  if (message.includes('ERROR')) return 'error';
  return 'msg';
}
