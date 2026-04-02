import type { ToolDefinition, ToolResultBlock, PermissionResult } from '../types.js';

export async function executeTool(
  tool: ToolDefinition,
  toolUseId: string,
  input: Record<string, unknown>,
  askPermission: (message: string) => Promise<boolean>,
): Promise<ToolResultBlock> {
  // 1. 权限检查
  // 原始代码在 toolOrchestration.ts 的 runToolUse() 中做同样的事
  let permission: PermissionResult = { behavior: 'allow' };
  if (tool.checkPermissions) {
    permission = tool.checkPermissions(input);
  }

  if (permission.behavior === 'deny') {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: permission.message || 'Permission denied',
      is_error: true,
    };
  }

  if (permission.behavior === 'ask') {
    const allowed = await askPermission(
      permission.message || `Allow ${tool.name}?`
    );
    if (!allowed) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: 'User denied permission',
        is_error: true,
      };
    }
  }

  // 2. 执行工具
  try {
    const result = await tool.call(input);
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result.output,
      is_error: result.isError,
    };
  } catch (error) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      is_error: true,
    };
  }
}
