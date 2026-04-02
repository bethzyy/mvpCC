import fg from 'fast-glob';
import type { ToolDefinition } from '../types.js';

export const GlobTool: ToolDefinition = {
  name: 'GlobTool',
  description: `Fast file pattern matching. Supports glob patterns like "**/*.ts".
Returns matching file paths. Limit 100 results.`,

  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
  },

  isReadOnly() { return true; },

  async call(input) {
    try {
      const files = await fg(input.pattern as string, {
        cwd: (input.path as string) || process.cwd(),
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      const limited = files.slice(0, 100);
      return {
        output: limited.join('\n') + (files.length > 100 ? `\n... (${files.length - 100} more)` : ''),
      };
    } catch (error: any) {
      return { output: `Error: ${error.message}`, isError: true };
    }
  },
};
