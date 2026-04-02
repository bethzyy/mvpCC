#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createApiClient } from './api/client.js';
import { getAllTools } from './tools/registry.js';
import { startRepl } from './ui/repl.js';

const program = new Command();

program
  .name('claude-mvp')
  .description('Claude Code MVP - AI-powered CLI coding assistant')
  .version('0.1.0')
  .option('-m, --model <model>', 'Model to use')
  .option('-v, --verbose', 'Show detailed API interaction logs (teaching mode)')
  .option('--api-key <key>', 'API key (ZHIPU_API_KEY)')
  .option('--base-url <url>', 'Custom API base URL')
  .argument('[prompt]', 'Initial prompt (non-interactive)');

program.action(async (prompt, options) => {
  if (options.apiKey) process.env.ZHIPU_API_KEY = options.apiKey;
  if (options.baseUrl) process.env.ANTHROPIC_BASE_URL = options.baseUrl;

  try {
    const client = createApiClient();
    const tools = getAllTools();
    await startRepl(client, tools, {
      model: options.model,
      verbose: options.verbose,
    });
  } catch (error) {
    console.error(chalk.red(`Fatal: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
});

program.parse();
