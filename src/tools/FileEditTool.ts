import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { ToolDefinition, PermissionResult } from '../types.js';

export const FileEditTool: ToolDefinition = {
  name: 'FileEditTool',
  description: `Edit a file by replacing an exact string match.
The old_string must be unique in the file. Use replace_all to replace all occurrences.
Prefer this over creating new files.`,

  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      old_string: { type: 'string', description: 'The exact string to replace' },
      new_string: { type: 'string', description: 'The replacement string' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },

  checkPermissions(input): PermissionResult {
    const filePath = input.file_path as string;
    const sensitive = [/\.env/, /credentials/, /secret/, /\.ssh\//, /\.aws\//];
    if (sensitive.some(p => p.test(filePath))) {
      return { behavior: 'ask', message: `Editing sensitive file: ${filePath}` };
    }
    return { behavior: 'allow' };
  },

  async call(input) {
    const filePath = input.file_path as string;
    const oldStr = input.old_string as string;
    const newStr = input.new_string as string;
    const replaceAll = input.replace_all as boolean;

    if (typeof filePath !== 'string' || filePath.includes('\0')) {
      return { output: 'Error: Invalid file path (null byte detected)', isError: true };
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      let content = await readFile(filePath, 'utf-8');

      if (!content.includes(oldStr)) {
        return { output: 'Error: old_string not found in file', isError: true };
      }

      if (!replaceAll) {
        const count = content.split(oldStr).length - 1;
        if (count > 1) {
          return {
            output: `Error: old_string is not unique (${count} occurrences). Use replace_all or provide more context.`,
            isError: true,
          };
        }
        content = content.replace(oldStr, newStr);
      } else {
        content = content.split(oldStr).join(newStr);
      }

      await writeFile(filePath, content, 'utf-8');
      return { output: `File updated: ${filePath}` };
    } catch (error: any) {
      if (error.code === 'EACCES') return { output: `Permission denied: ${filePath}`, isError: true };
      if (error.code === 'ENOSPC') return { output: 'No space left on device', isError: true };
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
