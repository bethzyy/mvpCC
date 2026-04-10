import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { ToolDefinition, PermissionResult } from '../types.js';

export const FileWriteTool: ToolDefinition = {
  name: 'FileWriteTool',
  description: `Write content to a file, creating it if it doesn't exist. Overwrites existing content.
Use this to create NEW files. Use FileEditTool to modify existing files.
Automatically creates parent directories.`,

  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['file_path', 'content'],
  },

  isReadOnly() {
    return false;
  },

  checkPermissions(input): PermissionResult {
    const filePath = input.file_path as string;
    const sensitive = [/\.env/, /credentials/, /secret/, /\.ssh\//, /\.aws\//];
    if (sensitive.some(p => p.test(filePath))) {
      return { behavior: 'ask', message: `Writing to sensitive file: ${filePath}` };
    }
    return { behavior: 'allow' };
  },

  async call(input) {
    const filePath = input.file_path as string;
    const content = input.content as string;

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return { output: `File written: ${filePath}` };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
