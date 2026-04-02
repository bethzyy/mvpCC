import * as readline from 'readline';
import chalk from 'chalk';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationMessage, ToolDefinition, StreamEvent } from '../types.js';
import { queryLoop } from '../query/queryLoop.js';
import { buildSystemPrompt } from '../context/systemPrompt.js';
import { getGitContext } from '../context/gitContext.js';
import { renderToolUse, renderCostInfo } from './renderer.js';
import { CostTracker } from '../cost/tracker.js';

export async function startRepl(
  client: Anthropic,
  tools: ToolDefinition[],
  options: { model?: string; verbose?: boolean },
): Promise<void> {
  const verbose = options.verbose || false;
  const messages: ConversationMessage[] = [];
  const gitContext = await getGitContext();
  const systemPrompt = buildSystemPrompt(tools, gitContext);
  const costTracker = new CostTracker();

  // ★ 强制 terminal: false 避免 PTY 双回显（!命令、Windows Terminal 等）
  // 终端驱动仍会正常回显字符，readline 不再额外处理
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('> '),
    terminal: false,
  });

  // ★ 权限确认用单独的 readline 实例，避免和主输入冲突
  const permRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  function askPermission(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
      permRl.question(chalk.yellow(`  [Permission] ${msg} (y/n): `), (answer) => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  // ★ Verbose 日志输出函数
  const log = {
    turn: (turn: number, msg: string) => {
      if (verbose) console.log(chalk.magenta(`  [T${turn}] ${msg}`));
    },
    api: (msg: string) => {
      if (verbose) console.log(chalk.blue(`  [API] ${msg}`));
    },
    tool: (msg: string) => {
      if (verbose) console.log(chalk.yellow(`  [TOOL] ${msg}`));
    },
    msg: (msg: string) => {
      if (verbose) console.log(chalk.gray(`  [MSG] ${msg}`));
    },
  };

  console.log(chalk.cyan.bold('\n  Claude Code MVP'));
  console.log(chalk.gray('  /help for commands, /quit to exit\n'));

  let isProcessing = false;

  rl.prompt();

  rl.on('line', async (line) => {
    if (isProcessing) return;
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // 斜杠命令
    if (input === '/quit' || input === '/exit') { rl.close(); permRl.close(); return; }
    if (input === '/help') {
      console.log(chalk.gray('  /help  /quit  /clear  /cost'));
      rl.prompt(); return;
    }
    if (input === '/clear') {
      messages.length = 0;
      console.log(chalk.gray('  History cleared.'));
      rl.prompt(); return;
    }
    if (input === '/cost') {
      const t = costTracker.getTotals();
      console.log(renderCostInfo(t.inputTokens, t.outputTokens, t.cost));
      rl.prompt(); return;
    }

    // 发送消息
    messages.push({ role: 'user', content: input });
    isProcessing = true;
    rl.pause();

    log.msg(`用户输入: "${input}"`);
    log.msg(`当前 messages 数量: ${messages.length}`);

    const abortController = new AbortController();
    const onInterrupt = () => { abortController.abort(); };
    process.on('SIGINT', onInterrupt);

    try {
      let currentText = '';

      for await (const event of queryLoop(messages, {
        client, tools, systemPrompt,
        signal: abortController.signal,
        model: options.model,
        askPermission,
        onTurnStart: (turn, msgCount) => log.turn(turn, `--- Turn ${turn} 开始 | messages: ${msgCount} ---`),
        onTurnEnd: (turn, reason, toolCount, textLen) =>
          log.turn(turn, `--- Turn ${turn} 结束 | ${reason} | 工具: ${toolCount} | 文本: ${textLen}字 ---`),
        onToolResult: (turn, name, output, isError) =>
          log.tool(`Turn${turn} 结果: ${name} → ${isError ? 'ERROR' : 'OK'} ${output.length > 100 ? output.slice(0, 100) + '...' : output}`),
      })) {
        switch (event.type) {
          case 'text_delta':
            process.stdout.write(event.text);
            currentText += event.text;
            break;
          case 'tool_use_start':
            log.tool(`开始调用: ${event.name} (id: ${event.id.slice(0, 12)}...)`);
            process.stdout.write(renderToolUse(event.name));
            break;
          case 'tool_use_end':
            log.tool(`${event.name} 输入参数: ${JSON.stringify(event.input)}`);
            break;
          case 'message_stop':
            log.api(`stop_reason: ${event.stop_reason}`);
            break;
          case 'usage':
            if (verbose) {
              if (event.input_tokens > 0) log.api(`input tokens: ${event.input_tokens}`);
              if (event.output_tokens > 0) log.api(`output tokens: ${event.output_tokens}`);
            }
            costTracker.add(event);
            break;
          case 'error':
            log.api(`错误: ${event.error.message}`);
            break;
        }
      }

      if (currentText && !currentText.endsWith('\n')) process.stdout.write('\n');

      const t = costTracker.getTotals();
      console.log(renderCostInfo(t.inputTokens, t.outputTokens, t.cost));
    } catch (error) {
      console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : String(error)}`));
    }

    process.off('SIGINT', onInterrupt);
    isProcessing = false;
    try { rl.resume(); rl.prompt(); } catch { /* stdin 已关闭 */ }
  });
}
