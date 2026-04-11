import chalk from 'chalk';
import type { SkillInfo } from '../skills/discovery.js';
import { getHistory } from '../history/history.js';
import { renderCostInfo } from './renderer.js';

/** 显示帮助信息 */
export function showHelp(): void {
  console.log(chalk.gray('  /help  /quit  /exit  /clear  /cost  /history  /compact  /skills'));
  console.log(chalk.gray('  Multi-line: paste directly, end line with \\, or wrap in ``` '));
}

/** 显示 Token 消耗和费用 */
export function showCost(getTotals: () => { inputTokens: number; outputTokens: number; cost: number }): void {
  const t = getTotals();
  console.log(renderCostInfo(t.inputTokens, t.outputTokens, t.cost));
}

/** 显示最近对话历史 */
export async function showHistory(): Promise<void> {
  const entries = await getHistory(10);
  if (entries.length === 0) {
    console.log(chalk.gray('  No history yet.'));
  } else {
    console.log(chalk.gray('  Recent conversations:'));
    for (const e of entries) {
      const date = new Date(e.timestamp).toLocaleString();
      const tokens = e.inputTokens + e.outputTokens;
      console.log(chalk.gray(`  [${date}] ${e.display} (${tokens} tokens)`));
    }
  }
}

/** 显示可用 Skills */
export function showSkills(skills?: SkillInfo[]): void {
  if (!skills || skills.length === 0) {
    console.log(chalk.gray('  No skills found. Place skills in .claude/skills/<name>/SKILL.md'));
  } else {
    console.log(chalk.gray(`  Available skills (${skills.length}):`));
    for (const s of skills) {
      const desc = s.description.length > 60 ? s.description.slice(0, 60) + '...' : s.description;
      console.log(chalk.cyan(`  ${s.name}`) + chalk.gray(` v${s.version}`) + ` — ${desc}`);
      console.log(chalk.gray(`    Command: python ${s.skillDir}/${s.entryPoint} "<args>"`));
    }
  }
}
