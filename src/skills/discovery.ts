import { readdirSync, readFileSync, existsSync, type Dirent } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  entryPoint: string;
  skillDir: string;
  triggerKeywords: string[];
  usageExample: string;
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（简易解析，不引入 yaml 库）
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

/**
 * 从 Markdown 正文提取 ## Usage 章节
 */
function extractUsageSection(content: string): string {
  const match = content.match(/## Usage\r?\n([\s\S]*?)(?=\r?\n## |\r?\n---|$)/);
  if (!match) return '';
  return match[1].trim().split('\n').slice(0, 8).join('\n');
}

/**
 * 从 description 和 tags 提取触发关键词
 */
function extractKeywords(meta: Record<string, string>): string[] {
  const keywords: string[] = [];
  const desc = meta.description || '';
  // 提取引号内的短语
  const quoted = desc.match(/"([^"]+)"/g);
  if (quoted) {
    for (const q of quoted) {
      keywords.push(q.replace(/"/g, ''));
    }
  }
  // 提取 tags
  const tagsMatch = meta.tags?.match(/\[([^\]]+)\]/);
  if (tagsMatch) {
    for (const tag of tagsMatch[1].split(',')) {
      keywords.push(tag.trim());
    }
  }
  return keywords.slice(0, 20); // 限制数量
}

/**
 * 解析单个 SKILL.md 文件
 */
export function parseSkillFile(skillDir: string): SkillInfo | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;

  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    const meta = parseFrontmatter(content);

    if (!meta.name) return null;

    return {
      name: meta.name,
      description: meta.description || '',
      version: meta.version || '0.0.0',
      entryPoint: meta.entry_point || 'main.py',
      skillDir: resolve(skillDir),
      triggerKeywords: extractKeywords(meta),
      usageExample: extractUsageSection(content),
    };
  } catch {
    return null;
  }
}

/**
 * 发现所有可用 Skill
 * 扫描 cwd/.claude/skills 下的 SKILL.md 和 home/.claude/skills 下的 SKILL.md
 */
export function discoverSkills(cwd: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  const searchDirs = [
    join(cwd, '.claude', 'skills'),
    join(homedir(), '.claude', 'skills'),
  ];

  for (const skillsDir of searchDirs) {
    if (!existsSync(skillsDir)) continue;

    let entries: Dirent[];
    try {
      entries = readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (seen.has(entry.name)) continue;

      const skill = parseSkillFile(join(skillsDir, entry.name));
      if (skill) {
        skills.push(skill);
        seen.add(entry.name);
      }
    }
  }

  return skills;
}
