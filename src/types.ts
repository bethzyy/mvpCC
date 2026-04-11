// ========== 消息类型 ==========
// 对应原始: types/message.ts

export type Role = 'user' | 'assistant';

// 三种内容块: 文本 / 工具调用 / 工具结果
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;                        // API 生成的唯一 ID
  name: string;                      // 工具名，如 "BashTool"
  input: Record<string, unknown>;    // 工具输入参数
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;   // 对应 ToolUseBlock 的 id
  content: string;       // 工具执行结果
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// 一条消息 = 角色 + 内容
export interface ConversationMessage {
  role: Role;
  content: string | ContentBlock[];
}

// ========== 流事件类型 ==========
// 对应原始: types/message.ts 的 StreamEvent

export interface StreamTextDelta {
  type: 'text_delta';
  text: string;
}

export interface StreamToolUseStart {
  type: 'tool_use_start';
  id: string;
  name: string;
}

export interface StreamToolUseEnd {
  type: 'tool_use_end';
  id: string;
  name: string;
  input: Record<string, unknown>;
  parseFailed?: boolean;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

export interface StreamMessageStop {
  type: 'message_stop';
  stop_reason: StopReason;
}

export interface StreamUsage {
  type: 'usage';
  input_tokens: number;
  output_tokens: number;
}

export interface StreamError {
  type: 'error';
  error: { type: string; message: string };
}

export type StreamEvent =
  | StreamTextDelta
  | StreamToolUseStart
  | StreamToolUseEnd
  | StreamMessageStop
  | StreamUsage
  | StreamError;

// ========== 权限类型 ==========
// 对应原始: types/permissions.ts

export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask';
  message?: string;
}

// ========== 工具类型 ==========
// 对应原始: Tool.ts (原始有 ~30 个方法，MVP 只保留 5 个)

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  call(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }>;
  checkPermissions?(input: Record<string, unknown>): PermissionResult;
  isReadOnly?(input: Record<string, unknown>): boolean;
}

// ========== 查询结果 ==========

export interface QueryResult {
  reason: 'completed' | 'aborted' | 'max_turns';
  messages?: ConversationMessage[];  // ★ 更新后的消息列表（含 assistant 回复和工具结果）
}
