import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import type { ToolDefinition, PermissionResult } from '../types.js';

const execAsync = promisify(exec);

// Windows 上 shell: 'bash' 会解析到 WSL，需要用 Git Bash
function resolveShell(): string | undefined {
  // 优先使用环境变量（Git Bash 终端会设置 SHELL）
  if (process.env.SHELL) return process.env.SHELL;
  if (process.platform !== 'win32') return undefined;
  // 按常见路径检测 Git Bash
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Git\\bin\\bash.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Git\\bin\\bash.exe`,
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return undefined; // 找不到则用系统默认 shell
}

// 只读命令白名单 (从原始 BashTool/readOnlyValidation.ts 提取)
const READONLY_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'wc', 'stat', 'file',
  'strings', 'jq', 'awk', 'cut', 'sort', 'uniq', 'tr',
  'find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis',
  'ls', 'tree', 'du', 'echo', 'printf',
  'git', 'node', 'python', 'python3', 'pip', 'npm', 'npx',
  'pwd', 'whoami', 'date', 'uname', 'env', 'cal', 'uptime',
]);

function getBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0]?.split('/').pop()?.toLowerCase() || '';
}

export const BashTool: ToolDefinition = {
  name: 'BashTool',
  description: `Execute a bash command. Returns stdout and stderr.
Use for shell operations that cannot be done with dedicated tools.
Prefer dedicated tools: FileRead (not cat), FileEdit (not sed), Glob (not find), Grep (not grep).`,

  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 120000, max 600000)' },
    },
    required: ['command'],
  },

  isReadOnly(input) {
    const cmd = getBaseCommand(input.command as string);
    return READONLY_COMMANDS.has(cmd);
  },

  checkPermissions(input): PermissionResult {
    const cmd = getBaseCommand(input.command as string);
    const command = input.command as string;

    // 危险命令直接拒绝
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', 'chmod -R 777 /', '> /dev/sd'];
    if (dangerous.some(d => command.includes(d))) {
      return { behavior: 'deny', message: `Dangerous command blocked: ${command}` };
    }

    // 只读命令自动允许
    if (READONLY_COMMANDS.has(cmd)) {
      return { behavior: 'allow' };
    }

    // 其他命令需要确认
    return { behavior: 'ask', message: `Run command: ${command}` };
  },

  async call(input) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) || 120_000, 600_000);
    const shell = resolveShell();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell,
      });
      const output = [stdout, stderr].filter(Boolean).join('\n');
      return { output: output || '(no output)' };
    } catch (error: any) {
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n');
      return { output: output || error.message, isError: true };
    }
  },
};
