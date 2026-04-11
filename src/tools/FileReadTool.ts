import { readFile } from 'fs/promises';
import type { ToolDefinition } from '../types.js';

export const FileReadTool: ToolDefinition = {
  name: 'FileReadTool',
  description: `Read a file from the filesystem. Returns content with line numbers.
Supports offset and limit for large files. Default max 2000 lines.`,

  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      offset: { type: 'number', description: 'Line number to start from (0-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },

  isReadOnly() { return true; },

  async call(input) {
    const filePath = input.file_path as string;

    // 安全检查: 空字节注入
    if (typeof filePath !== 'string' || filePath.includes('\0')) {
      return { output: 'Error: Invalid file path (null byte detected)', isError: true };
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const offset = typeof input.offset === 'number' ? input.offset : 0;
      const limit = Math.min(typeof input.limit === 'number' ? input.limit : 2000, lines.length - offset);
      const selected = lines.slice(offset, offset + limit);

      const numbered = selected
        .map((line, i) => `${String(offset + i + 1).padStart(6)}\t${line}`)
        .join('\n');

      return { output: numbered };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
