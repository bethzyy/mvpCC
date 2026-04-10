import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 日志条目类型
export interface LogEntry {
  timestamp: string;
  type: 'turn_start' | 'turn_end' | 'tool' | 'api' | 'msg' | 'compact' | 'error';
  detail: string;
}

let wss: WebSocketServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
let clients: Set<WebSocket> = new Set();

// 类型颜色映射（用于仪表盘显示）
const TYPE_COLORS: Record<string, string> = {
  turn_start: '#a78bfa', // 紫色
  turn_end: '#a78bfa',
  tool: '#fbbf24',      // 黄色
  api: '#60a5fa',        // 蓝色
  msg: '#9ca3af',        // 灰色
  compact: '#34d399',    // 绿色
  error: '#f87171',      // 红色
};

/**
 * 启动 Web 仪表盘
 * 返回一个 broadcastLog 函数用于推送日志
 */
export function startDashboard(port = 3334): (entry: LogEntry) => void {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getDashboardHTML());
  });

  httpServer = server;
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  server.listen(port, () => {
    console.log(`  Dashboard: http://localhost:${port}`);
  });

  // 返回广播函数
  return (entry: LogEntry) => {
    if (clients.size === 0) return;
    const data = JSON.stringify(entry);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };
}

/**
 * 停止仪表盘
 */
export function stopDashboard(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      for (const client of clients) client.close();
      wss.close(() => {
        wss = null;
        clients = new Set();
        if (httpServer) {
          httpServer.close(() => {
            httpServer = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    } else if (httpServer) {
      httpServer.close(() => {
        httpServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * 获取当前连接的客户端数
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * 内嵌 HTML 页面 — 实时日志查看器
 */
function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code MVP - Debug Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Cascadia Code', 'Fira Code', monospace; background: #1e1e2e; color: #cdd6f4; padding: 16px; }
h1 { color: #89b4fa; font-size: 18px; margin-bottom: 8px; }
.status { color: #6c7086; font-size: 12px; margin-bottom: 16px; }
#log { height: calc(100vh - 60px); overflow-y: auto; font-size: 13px; line-height: 1.6; }
.entry { padding: 2px 0; border-bottom: 1px solid #313244; }
.entry:hover { background: #313244; }
.time { color: #6c7086; margin-right: 8px; }
.tag { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-right: 8px; }
.detail { color: #cdd6f4; }
.empty { color: #6c7086; text-align: center; margin-top: 40px; }
</style>
</head>
<body>
<h1>Claude Code MVP - Debug Dashboard</h1>
<div class="status" id="status">Connecting...</div>
<div id="log"><div class="empty">Waiting for logs...</div></div>
<script>
const log = document.getElementById('log');
const status = document.getElementById('status');
const ws = new WebSocket('ws://' + window.location.host);
const TYPE_COLORS = ${JSON.stringify(TYPE_COLORS)};
let entryCount = 0;

ws.onmessage = (e) => {
  const entry = JSON.parse(e.data);
  entryCount++;
  const empty = log.querySelector('.empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'entry';
  const color = TYPE_COLORS[entry.type] || '#cdd6f4';
  div.innerHTML = '<span class="time">' + entry.timestamp.split('T')[1].split('.')[0] + '</span>' +
    '<span class="tag" style="background:' + color + '22;color:' + color + '">' + entry.type + '</span>' +
    '<span class="detail">' + escapeHtml(entry.detail) + '</span>';
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  status.textContent = 'Connected | ' + entryCount + ' entries';
};

ws.onopen = () => { status.textContent = 'Connected | 0 entries'; };
ws.onclose = () => {
  status.textContent = 'Disconnected | Reconnecting in 2s...';
  status.style.color = '#f38ba8';
  setTimeout(() => location.reload(), 2000);
};

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>`;
}
