import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const HISTORY_DIR = join(homedir(), '.claude-mvp');
const HISTORY_FILE = join(HISTORY_DIR, 'history.json');

export interface HistoryEntry {
  display: string;       // 用户输入（截断 200 字符）
  timestamp: number;     // 毫秒时间戳
  project: string;       // 项目路径
  inputTokens: number;
  outputTokens: number;
}

export async function addToHistory(
  entry: string,
  project: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  try {
    const history = await loadHistory();
    history.unshift({
      display: entry.slice(0, 200),
      timestamp: Date.now(),
      project,
      inputTokens,
      outputTokens,
    });
    if (history.length > 100) history.length = 100;
    await mkdir(HISTORY_DIR, { recursive: true });
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch { /* ignore */ }
}

export async function getHistory(limit: number = 10): Promise<HistoryEntry[]> {
  try {
    const history = await loadHistory();
    return history.slice(0, limit);
  } catch { return []; }
}

async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf-8'));
  } catch { return []; }
}
