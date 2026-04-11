import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_TIMEOUT_MS = 600_000;

export function createApiClient(): Anthropic {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ZHIPU_API_KEY environment variable is required.\n' +
      'Set it with: set ZHIPU_API_KEY=your-id.secret'
    );
  }
  const timeout = parseInt(process.env.CLAUDE_TIMEOUT || '') || DEFAULT_TIMEOUT_MS;
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://open.bigmodel.cn/api/anthropic',
    timeout,
  });
}
