import * as readline from 'readline';
import chalk from 'chalk';
import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationMessage, ToolDefinition, StreamEvent, QueryResult } from '../types.js';
import { queryLoop } from '../query/queryLoop.js';
import { buildSystemPrompt } from '../context/systemPrompt.js';
import { getGitContext } from '../context/gitContext.js';
import { renderToolUse } from './renderer.js';
import { CostTracker } from '../cost/tracker.js';
import { addToHistory } from '../history/history.js';
import { showHelp, showCost, showHistory, showSkills } from './commands.js';
import { stopDashboard } from '../debug/dashboard.js';
import { debugLog, debugError } from '../utils/debugLogger.js';
import { shouldCompact, compactMessages, estimateTokens } from '../context/compactor.js';
import { saveSession } from '../context/session.js';
import type { SkillInfo } from '../skills/discovery.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export async function startRepl(
  client: Anthropic,
  tools: ToolDefinition[],
  options: { model?: string; verbose?: boolean; initialMessages?: ConversationMessage[]; skills?: SkillInfo[] },
): Promise<void> {
  const verbose = options.verbose || false;
  const messages: ConversationMessage[] = options.initialMessages ? [...options.initialMessages] : [];
  const gitContext = await getGitContext();
  const systemPrompt = buildSystemPrompt(tools, gitContext, options.skills);
  const costTracker = new CostTracker();

  // ★ 恢复会话提示
  if (options.initialMessages && options.initialMessages.length > 0) {
    console.log(chalk.green(`  Resumed session (${options.initialMessages.length} messages)\n`));
  }

  // ★ 强制 terminal: false 避免 PTY 双回显（!命令、Windows Terminal 等）
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('> '),
    terminal: false,
  });

  // ★ 权限确认用单独的 readline 实例
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
    compact: (msg: string) => {
      console.log(chalk.green(`  [COMPACT] ${msg}`));
    },
  };

  console.log(chalk.cyan.bold('\n  Claude Code MVP'));
  console.log(chalk.gray('  /help for commands, /quit to exit'));
  console.log(chalk.gray('  Multi-line: end line with \\ or wrap in ```\n'));

  // ★ 全局错误处理
  process.on('uncaughtException', async (error) => {
    await debugError('Uncaught exception', error, verbose);
    console.error(chalk.red(`\n  [FATAL] ${error instanceof Error ? error.message : String(error)}`));
    if (verbose && error instanceof Error && error.stack) {
      console.error(chalk.red(error.stack));
    }
  });

  process.on('unhandledRejection', async (reason) => {
    await debugError('Unhandled rejection', reason, verbose);
    console.error(chalk.red(`\n  [FATAL] Unhandled rejection: ${String(reason)}`));
  });

  // ★ 同步退出日志
  const LOG_FILE = join(homedir(), '.claude-mvp', 'debug.log');
  process.on('exit', (code) => {
    try {
      writeFileSync(LOG_FILE, `\n[${new Date().toISOString()}] PROCESS EXIT: code=${code}\n`, { flag: 'a' });
    } catch { /* 无法写日志 */ }
  });
  process.on('SIGTERM', () => {
    try {
      writeFileSync(LOG_FILE, `\n[${new Date().toISOString()}] PROCESS SIGTERM received\n`, { flag: 'a' });
    } catch { /* 无法写日志 */ }
  });

  // ★ 上下文压缩
  async function tryAutoCompact(): Promise<boolean> {
    if (!shouldCompact(messages)) return false;
    log.compact(`上下文接近上限 (估算 ${estimateTokens(messages)} tokens)，开始压缩...`);
    try {
      const result = await compactMessages(client, messages, { model: options.model });
      messages.length = 0;
      messages.push(...result.messages);
      log.compact(`压缩完成: ${result.tokensBefore} → ${result.tokensAfter} tokens (${messages.length} 条消息)`);
      await debugLog(`COMPACT: ${result.tokensBefore} → ${result.tokensAfter} tokens`);
      return true;
    } catch (error) {
      await debugError('Compact failed', error, verbose);
      console.error(chalk.red('  [COMPACT] 压缩失败，继续使用完整上下文'));
      return false;
    }
  }

  let isProcessing = false;
  let shuttingDown = false;

  // ★ 多行输入状态
  let multilineMode: 'off' | 'backslash' | 'codeblock' = 'off';
  let multilineBuffer: string[] = [];

  // ★ 粘贴检测：50ms 缓冲，多行快速到达时自动合并
  let lineBuffer: string[] = [];
  let lineTimer: ReturnType<typeof setTimeout> | null = null;
  let pasteLock = false;
  const PASTE_BUFFER_MS = 50;

  function getPrompt(): string {
    if (multilineMode !== 'off') return chalk.gray('| ');
    return chalk.cyan('> ');
  }

  function resetMultiline(): void {
    multilineMode = 'off';
    multilineBuffer = [];
    rl.setPrompt(getPrompt());
  }

  // ★ 处理缓冲后的行（单行或多行）
  async function handleLines(lines: string[]): Promise<void> {
    // === 多行模式处理 ===
    if (multilineMode !== 'off') {
      if (multilineMode === 'codeblock') {
        multilineBuffer.push(...lines);
        // 检测 closing ```（在所有行中查找）
        const closingIdx = lines.findIndex(l => l.trim() === '```');
        if (closingIdx !== -1) {
          // 只保留到 closing ``` 为止
          const extraLines = lines.slice(closingIdx + 1);
          multilineBuffer = multilineBuffer.slice(0, multilineBuffer.length - lines.length + closingIdx + 1);
          const input = multilineBuffer.join('\n');
          resetMultiline();
          await processInput(input);
          // 如果 closing ``` 后面还有行，递归处理
          if (extraLines.length > 0) {
            await handleLines(extraLines);
          }
        }
        return;
      }

      if (multilineMode === 'backslash') {
        for (const l of lines) {
          if (l.trim() === '') {
            // 空行结束多行输入
            const input = multilineBuffer.join('\n');
            resetMultiline();
            await processInput(input);
            // 后续行作为新输入处理
            const remaining = lines.slice(lines.indexOf(l) + 1);
            if (remaining.length > 0) {
              await handleLines(remaining);
            }
            return;
          }
          multilineBuffer.push(l);
        }
        rl.prompt();
        return;
      }
    }

    // === 单行模式 ===

    // 粘贴检测：多行快速到达 → 合并为一条消息发送
    if (lines.length > 1) {
      const input = lines.join('\n');
      await processInput(input);
      return;
    }

    const rawLine = lines[0];
    const line = rawLine.trim();

    // 空行 → 跳过
    if (!line) { try { rl.prompt(); } catch { /* stdin closed */ } return; }

    // 斜杠命令
    if (line === '/quit' || line === '/exit') {
      await gracefulShutdown();
      return;
    }
    if (line === '/help') { showHelp(); rl.prompt(); return; }
    if (line === '/clear') {
      messages.length = 0;
      console.log(chalk.gray('  History cleared.'));
      rl.prompt(); return;
    }
    if (line === '/cost') { showCost(() => costTracker.getTotals()); rl.prompt(); return; }
    if (line === '/history') { await showHistory(); rl.prompt(); return; }
    if (line === '/compact') { await tryAutoCompact(); rl.prompt(); return; }
    if (line === '/skills') { showSkills(options.skills); rl.prompt(); return; }

    // === 检测多行输入触发 ===

    // 代码块模式：行以 ``` 开头
    if (line.trimStart().startsWith('```')) {
      multilineMode = 'codeblock';
      multilineBuffer = [rawLine];
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // 反斜杠续行模式：行以 \ 结尾
    if (line.endsWith('\\')) {
      multilineMode = 'backslash';
      multilineBuffer = [line.slice(0, -1)]; // 去掉末尾的 \
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // 普通单行 → 直接发送
    await processInput(line);
  }

  rl.prompt();

  // ★ 优雅关停：保存会话 + 清理资源
  async function gracefulShutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // 清理粘贴检测定时器
    if (lineTimer) { clearTimeout(lineTimer); lineTimer = null; }

    // ★ 关闭 Web 仪表盘（释放端口和 WebSocket 连接）
    try { await stopDashboard(); } catch { /* dashboard not started */ }

    // 保存会话
    if (messages.length > 0) {
      try {
        const sessionId = await saveSession(messages, process.cwd());
        console.log(chalk.gray(`  Session saved: ${sessionId}`));
      } catch (e) {
        console.log(chalk.gray(`  Session save failed: ${e}`));
      }
    }

    // 关闭 readline
    try { permRl.close(); } catch { /* already closed */ }
    try { rl.close(); } catch { /* already closed */ }

    process.exit(0);
  }

  // ★ 核心 line 处理（带粘贴检测缓冲）
  rl.on('line', async (rawLine) => {
    if (isProcessing || shuttingDown) return;

    // 缓冲输入行，等待 50ms 确认没有更多行到来（粘贴检测）
    lineBuffer.push(rawLine);

    if (lineTimer) clearTimeout(lineTimer);
    lineTimer = setTimeout(async () => {
      if (pasteLock) return;
      pasteLock = true;
      try {
        lineTimer = null;
        const lines = [...lineBuffer];
        lineBuffer = [];
        await handleLines(lines);
      } finally {
        pasteLock = false;
      }
    }, PASTE_BUFFER_MS);
  });

  // ★ 处理用户输入（单行或多行合并后的完整输入）
  async function processInput(input: string): Promise<void> {
    messages.push({ role: 'user', content: input });
    isProcessing = true;
    rl.pause();

    log.msg(`用户输入: "${input.slice(0, 100)}${input.length > 100 ? '...' : ''}"`);
    log.msg(`当前 messages 数量: ${messages.length}`);
    debugLog(`User input: "${input.slice(0, 100)}" (messages: ${messages.length})`, verbose);

    // ★ 发送前检查是否需要自动压缩
    await tryAutoCompact();

    const abortController = new AbortController();
    const onInterrupt = () => { abortController.abort(); };
    process.on('SIGINT', onInterrupt);

    try {
      let currentText = '';

      // ★ 用 .next() 手动迭代 async generator，确保捕获 return value
      const gen = queryLoop(messages, {
        client, tools, systemPrompt,
        signal: abortController.signal,
        model: options.model,
        askPermission,
        onTurnStart: (turn, msgCount) => log.turn(turn, `--- Turn ${turn} 开始 | messages: ${msgCount} ---`),
        onTurnEnd: (turn, reason, toolCount, textLen) =>
          log.turn(turn, `--- Turn ${turn} 结束 | ${reason} | 工具: ${toolCount} | 文本: ${textLen}字 ---`),
        onToolResult: (turn, name, output, isError) =>
          log.tool(`Turn${turn} 结果: ${name} → ${isError ? 'ERROR' : 'OK'} ${output.length > 100 ? output.slice(0, 100) + '...' : output}`),
      });

      let result: IteratorResult<StreamEvent, QueryResult>;
      while ((result = await gen.next()), !result.done) {
        const event = result.value;
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

      // ★ 捕获 generator 的 return value（QueryResult）
      // while 循环结束后 result.done === true，result.value 即为 QueryResult
      const queryResult = result.done ? (result.value as QueryResult) : undefined;
      if (queryResult) {
        log.msg(`QueryLoop 结束: ${queryResult.reason}`);
      }

      if (currentText && !currentText.endsWith('\n')) process.stdout.write('\n');

      const t = costTracker.getTotals();
      showCost(() => costTracker.getTotals());
      debugLog(`Response done: text=${currentText.length}chars, tokens=${t.inputTokens}in/${t.outputTokens}out`, verbose);

      addToHistory(input, process.cwd(), t.inputTokens, t.outputTokens);
    } catch (error) {
      debugError('QueryLoop error', error, verbose);
      console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : String(error)}`));
      if (verbose && error instanceof Error && error.stack) {
        console.error(chalk.gray(error.stack));
      }
    }

    process.off('SIGINT', onInterrupt);
    isProcessing = false;
    try { rl.resume(); rl.prompt(); } catch { /* stdin 已关闭 */ }
  }
}
