#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createApiClient } from './api/client.js';
import { getAllTools } from './tools/registry.js';
import { startRepl } from './ui/repl.js';
import { loadSession, getLatestSessionId, listSessions } from './context/session.js';
import { discoverSkills } from './skills/discovery.js';
import { startDashboard } from './debug/dashboard.js';
import { setLogBroadcast } from './utils/debugLogger.js';
import type { ConversationMessage } from './types.js';

const program = new Command();

program
  .name('claude-mvp')
  .description('Claude Code MVP - AI-powered CLI coding assistant')
  .version('0.1.0')
  .option('-m, --model <model>', 'Model to use')
  .option('-v, --verbose', 'Show detailed API interaction logs (teaching mode)')
  .option('--api-key <key>', 'API key (ZHIPU_API_KEY)')
  .option('--base-url <url>', 'Custom API base URL')
  .option('-c, --continue', 'Resume the most recent session')
  .option('--resume [id]', 'Resume a specific session by ID')
  .option('-d, --dashboard', 'Start web dashboard for real-time log viewing')
  .argument('[prompt]', 'Initial prompt (non-interactive)');

program.action(async (prompt, options) => {
  if (options.apiKey) process.env.ZHIPU_API_KEY = options.apiKey;
  if (options.baseUrl) process.env.ANTHROPIC_BASE_URL = options.baseUrl;

  try {
    const client = createApiClient();
    const tools = getAllTools();

    // ★ 发现可用 Skill
    const skills = discoverSkills(process.cwd());
    if (skills.length > 0) {
      console.log(chalk.gray(`  Skills: ${skills.map(s => s.name).join(', ')}\n`));
    }

    // ★ 启动 Web 仪表盘
    if (options.dashboard) {
      const broadcast = startDashboard();
      setLogBroadcast(broadcast);
    }

    // ★ 会话恢复逻辑
    let initialMessages: ConversationMessage[] | undefined;

    if (options.continue) {
      const latestId = await getLatestSessionId();
      if (latestId) {
        initialMessages = await loadSession(latestId) ?? undefined;
        if (initialMessages) {
          console.log(chalk.gray(`  Loading session: ${latestId}\n`));
        } else {
          console.log(chalk.yellow('  No session found to resume.\n'));
        }
      } else {
        console.log(chalk.yellow('  No sessions found. Starting fresh.\n'));
      }
    } else if (options.resume) {
      const resumeId = typeof options.resume === 'string' ? options.resume : null;
      if (resumeId) {
        initialMessages = await loadSession(resumeId) ?? undefined;
        if (initialMessages) {
          console.log(chalk.gray(`  Loading session: ${resumeId}\n`));
        } else {
          console.log(chalk.yellow(`  Session "${resumeId}" not found. Starting fresh.\n`));
        }
      } else {
        // 无参数 --resume → 列出可用会话
        const sessions = await listSessions();
        if (sessions.length === 0) {
          console.log(chalk.yellow('  No sessions found.\n'));
        } else {
          console.log(chalk.gray('  Available sessions:'));
          for (const s of sessions.slice(0, 10)) {
            const date = new Date(s.timestamp).toLocaleString();
            console.log(chalk.gray(`  ${s.id}  [${date}]  ${s.messageCount} msgs  ${s.cwd}`));
          }
          console.log();
        }
      }
    }

    await startRepl(client, tools, {
      model: options.model,
      verbose: options.verbose,
      initialMessages,
      skills,
    });
  } catch (error) {
    console.error(chalk.red(`Fatal: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
});

program.parse();
