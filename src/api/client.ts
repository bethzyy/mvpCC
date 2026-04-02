import Anthropic from '@anthropic-ai/sdk';

export function createApiClient(): Anthropic {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ZHIPU_API_KEY environment variable is required.\n' +
      'Set it with: set ZHIPU_API_KEY=your-id.secret'
    );
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || 'https://open.bigmodel.cn/api/anthropic',
    timeout: 600_000,
  });
}
