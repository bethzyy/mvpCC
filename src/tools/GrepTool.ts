import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { ToolDefinition } from '../types.js';

const execFileAsync = promisify(execFile);

export const GrepTool: ToolDefinition = {
  name: 'GrepTool',
  description: `Search file contents using regex. Prefers ripgrep (rg) if available, falls back to Node.js.
Supports output modes: content (default), files_with_matches, count.`,

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'File or directory to search' },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output format',
      },
      '-i': { type: 'boolean', description: 'Case insensitive search' },
      '-C': { type: 'number', description: 'Context lines before and after match' },
    },
    required: ['pattern'],
  },

  isReadOnly() { return true; },

  async call(input) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || process.cwd();
    const outputMode = (input.output_mode as string) || 'content';
    const ignoreCase = !!(input['-i'] as boolean);
    const context = (input['-C'] as number) || 0;

    try {
      // ★ 构建 ripgrep 参数 — 注意 rg 的参数顺序: options 必须在 pattern 之前
      const args: string[] = [];
      if (ignoreCase) args.push('-i');
      if (context) { args.push('-C', String(context)); }
      if (outputMode === 'files_with_matches') args.push('-l');
      if (outputMode === 'count') args.push('-c');
      args.push(pattern, searchPath);

      const { stdout } = await execFileAsync('rg', args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return { output: stdout };
    } catch (rgError: any) {
      if (rgError.code === 'ENOENT') {
        // rg 不可用，回退到 Node.js 实现
        return { output: await grepNodeJS(pattern, searchPath, outputMode, ignoreCase) };
      }
      // ★ rg 没有匹配结果返回 code 1，不是真正的错误
      if (rgError.code === 1) {
        return { output: '(no matches found)' };
      }
      return { output: `Error: ${rgError.message}`, isError: true };
    }
  },
};

// 简单的 Node.js 回退实现
async function grepNodeJS(
  pattern: string,
  searchPath: string,
  outputMode: string,
  ignoreCase: boolean,
): Promise<string> {
  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
  const results: string[] = [];

  async function searchDir(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await searchDir(fullPath);
      } else {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              if (outputMode === 'content') {
                results.push(`${fullPath}:${i + 1}:${lines[i]}`);
              } else if (outputMode === 'files_with_matches') {
                results.push(fullPath);
                break;
              }
            }
            regex.lastIndex = 0; // ★ 重置 lastIndex（全局正则必须）
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  await searchDir(searchPath);
  return results.join('\n') || '(no matches found)';
}
