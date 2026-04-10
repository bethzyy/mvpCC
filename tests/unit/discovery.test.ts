import { describe, it, expect, afterAll } from 'vitest';
import { parseSkillFile, discoverSkills } from '../../src/skills/discovery.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'claude-mvp-skill-test');

const SAMPLE_SKILL_MD = `---
name: test-search
description: Search the web for information. Use when user says "search", "find", "look up", or "搜索".
version: 1.0.0
entry_point: main.py
tags: [search, web, test]
---

# Test Search Skill

A test skill for searching.

## Usage

\`\`\`bash
python main.py "query"
\`\`\`
`;

describe('skill discovery', () => {
  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it('parseSkillFile 应解析 SKILL.md', async () => {
    const skillDir = join(TEST_DIR, 'test-search');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SAMPLE_SKILL_MD, 'utf-8');

    const skill = parseSkillFile(skillDir);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('test-search');
    expect(skill!.version).toBe('1.0.0');
    expect(skill!.entryPoint).toBe('main.py');
    expect(skill!.description.toLowerCase()).toContain('search the web');
    expect(skill!.triggerKeywords.length).toBeGreaterThan(0);
    expect(skill!.skillDir).toBe(skillDir);
  });

  it('parseSkillFile 对不存在的文件应返回 null', () => {
    const skill = parseSkillFile(join(TEST_DIR, 'nonexistent'));
    expect(skill).toBeNull();
  });

  it('parseSkillFile 对缺少 name 的文件应返回 null', async () => {
    const skillDir = join(TEST_DIR, 'no-name');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), `---\nversion: 1.0.0\n---\n`, 'utf-8');

    const skill = parseSkillFile(skillDir);
    expect(skill).toBeNull();
  });

  it('parseSkillFile 应提取触发关键词', async () => {
    const skillDir = join(TEST_DIR, 'keywords-test');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SAMPLE_SKILL_MD, 'utf-8');

    const skill = parseSkillFile(skillDir)!;
    expect(skill.triggerKeywords).toContain('search');
    expect(skill.triggerKeywords).toContain('find');
    expect(skill.triggerKeywords).toContain('web');
  });

  it('discoverSkills 应发现指定目录下的 Skill', async () => {
    const skillDir = join(TEST_DIR, '.claude', 'skills', 'test-search');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SAMPLE_SKILL_MD, 'utf-8');

    const skills = discoverSkills(TEST_DIR);
    expect(skills.length).toBeGreaterThanOrEqual(1);
    const found = skills.find(s => s.name === 'test-search');
    expect(found).toBeDefined();
  });

  it('discoverSkills 对空目录应返回空数组', async () => {
    const emptyDir = join(TEST_DIR, 'empty-project');
    await mkdir(emptyDir, { recursive: true });
    await mkdir(join(emptyDir, '.claude', 'skills'), { recursive: true });

    const skills = discoverSkills(emptyDir);
    // 可能有全局 skills，但不应有 cwd 下的
    const cwdSkills = skills.filter(s => s.skillDir.startsWith(emptyDir));
    expect(cwdSkills.length).toBe(0);
  });
});
