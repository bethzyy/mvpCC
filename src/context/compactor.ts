import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationMessage } from '../types.js';

// 原始代码: src/services/compact/autoCompact.ts
// AUTOCOMPACT_BUFFER_TOKENS = 13_000
const DEFAULT_CONTEXT_WINDOW = parseInt(process.env.CLAUDE_CONTEXT_WINDOW || '') || 128_000;
const AUTOCOMPACT_BUFFER = parseInt(process.env.CLAUDE_COMPACT_BUFFER || '') || 13_000;
const DEFAULT_KEEP_RECENT = 10;

/**
 * 粗略估算 messages 的 token 数
 * 原始代码使用 tiktoken 精确计算，MVP 用 Buffer.byteLength / 3.5 近似（支持 UTF-8 中文）
 */
export function estimateTokens(messages: ConversationMessage[]): number {
  let totalBytes = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalBytes += Buffer.byteLength(msg.content, 'utf-8');
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') totalBytes += Buffer.byteLength(block.text, 'utf-8');
        else if (block.type === 'tool_use') totalBytes += Buffer.byteLength(JSON.stringify(block.input), 'utf-8') + Buffer.byteLength(block.name, 'utf-8');
        else if (block.type === 'tool_result') totalBytes += Buffer.byteLength(block.content, 'utf-8');
      }
    }
    // 每条消息的元数据开销（role、格式等）约 20 tokens ≈ 70 bytes
    totalBytes += 70;
  }
  return Math.ceil(totalBytes / 3.5);
}

/**
 * 判断是否需要压缩
 * 原始代码: shouldAutoCompact() — autoCompact.ts 第 160 行
 */
export function shouldCompact(messages: ConversationMessage[], contextWindow = DEFAULT_CONTEXT_WINDOW): boolean {
  const threshold = contextWindow - AUTOCOMPACT_BUFFER;
  return estimateTokens(messages) >= threshold;
}

/**
 * 将 messages 中的内容块序列化为可读文本（用于生成摘要）
 */
function messagesToText(messages: ConversationMessage[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    if (typeof msg.content === 'string') {
      lines.push(`${role}: ${msg.content}`);
    } else {
      const parts: string[] = [];
      for (const block of msg.content) {
        if (block.type === 'text') parts.push(block.text);
        else if (block.type === 'tool_use') parts.push(`[调用工具 ${block.name}]`);
        else if (block.type === 'tool_result') parts.push(`[工具结果: ${block.content.slice(0, 200)}]`);
      }
      lines.push(`${role}: ${parts.join(' ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * 调用 LLM 生成对话摘要
 * 原始代码: compact() — compact.ts
 */
async function generateSummary(
  client: Anthropic,
  messagesToSummarize: ConversationMessage[],
  model?: string,
): Promise<string> {
  const conversationText = messagesToText(messagesToSummarize);
  const modelName = model || process.env.ANTHROPIC_MODEL || 'glm-5-turbo';

  const response = await client.messages.create({
    model: modelName,
    max_tokens: 2000,
    system: '你是一个对话摘要助手。请用简洁的中文总结以下对话的关键信息，包括：1)讨论了什么问题 2)达成了什么结论 3)执行了哪些重要操作。保留文件路径、代码片段等关键细节。摘要控制在500字以内。',
    messages: [{ role: 'user', content: `请总结以下对话：\n\n${conversationText}` }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '(摘要生成失败)';
}

/**
 * 压缩 messages 数组
 * 原始代码: autoCompactIfNeeded() — autoCompact.ts 第 241 行
 *
 * 将早期消息替换为 LLM 生成的摘要，保留最近 keepRecent 条完整消息
 */
export async function compactMessages(
  client: Anthropic,
  messages: ConversationMessage[],
  options?: { keepRecent?: number; model?: string },
): Promise<{ messages: ConversationMessage[]; tokensBefore: number; tokensAfter: number }> {
  const keepRecent = options?.keepRecent ?? DEFAULT_KEEP_RECENT;
  const model = options?.model;

  const tokensBefore = estimateTokens(messages);

  if (messages.length <= keepRecent) {
    return { messages: [...messages], tokensBefore, tokensAfter: tokensBefore };
  }

  const oldMessages = messages.slice(0, messages.length - keepRecent);
  const recentMessages = messages.slice(messages.length - keepRecent);

  const summary = await generateSummary(client, oldMessages, model);

  const summaryMessage: ConversationMessage = {
    role: 'user',
    content: `[以下是之前对话的摘要]\n${summary}\n[摘要结束]`,
  };

  const newMessages = [summaryMessage, ...recentMessages];
  const tokensAfter = estimateTokens(newMessages);

  return { messages: newMessages, tokensBefore, tokensAfter };
}
