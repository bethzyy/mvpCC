import { createApiClient } from './src/api/client.js';
import { queryLoop } from './src/query/queryLoop.js';
import type { ToolDefinition, ConversationMessage } from './src/types.js';
import chalk from 'chalk';

// ★ 一个最简单的 mock 工具：计算器
const CalculatorTool: ToolDefinition = {
  name: 'Calculator',
  description: 'A simple calculator. Input: { expression: "2+3" }',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression to evaluate' },
    },
    required: ['expression'],
  },
  isReadOnly() { return true; },
  async call(input) {
    const expr = input.expression as string;
    try {
      const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function('"use strict"; return (' + sanitized + ')')();
      return { output: `${expr} = ${result}` };
    } catch {
      return { output: `Error: cannot evaluate "${expr}"`, isError: true };
    }
  },
};

async function main() {
  const client = createApiClient();
  const prompt = process.argv[2] || '帮我算一下 (12+8)*3 等于多少，然后再加上 100';
  const messages: ConversationMessage[] = [
    { role: 'user', content: prompt },
  ];

  const tools = [CalculatorTool];
  const systemPrompt = 'You are a helpful assistant. You have a Calculator tool for math. Respond in Chinese.';

  console.log(`\n你说: ${prompt}\n`);

  for await (const event of queryLoop(messages, {
    client, tools, systemPrompt,
    askPermission: async () => true, // 自动允许所有权限
  })) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text);
        break;
      case 'tool_use_start':
        console.log(chalk.yellow(`\n  调用工具: ${event.name}`));
        break;
      case 'tool_use_end':
        console.log(chalk.gray(`   输入: ${JSON.stringify(event.input)}`));
        break;
      case 'usage':
        // 静默处理
        break;
    }
  }
  console.log('\n');
}

main().catch(console.error);
