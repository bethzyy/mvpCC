import chalk from 'chalk';

export function renderToolUse(name: string): string {
  return chalk.dim(`\n  ⏺ ${name}\n`);
}

export function renderToolResult(output: string, isError?: boolean): string {
  if (isError) {
    return chalk.red(`  ✗ ${output}`);
  }
  return chalk.dim(`  ✓ ${output}`);
}

export function renderCostInfo(inputTokens: number, outputTokens: number, cost: number): string {
  return chalk.dim(
    `\n─── Tokens: ${inputTokens} in / ${outputTokens} out | Cost: $${cost.toFixed(4)} ───`
  );
}
