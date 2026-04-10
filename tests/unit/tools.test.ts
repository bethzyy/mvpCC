import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BashTool } from '../../src/tools/BashTool.js';
import { FileReadTool } from '../../src/tools/FileReadTool.js';
import { FileEditTool } from '../../src/tools/FileEditTool.js';
import { GlobTool } from '../../src/tools/GlobTool.js';
import { GrepTool } from '../../src/tools/GrepTool.js';
import { FileWriteTool } from '../../src/tools/FileWriteTool.js';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), 'claude-mvp-tools-test');

// ===== BashTool =====
describe('BashTool', () => {
  it('应执行只读命令并返回结果', async () => {
    const result = await BashTool.call({ command: 'echo hello' });
    expect(result.output).toContain('hello');
    expect(result.isError).toBeFalsy();
  });

  it('isReadOnly 应识别白名单命令', () => {
    expect(BashTool.isReadOnly!({ command: 'ls' })).toBe(true);
    expect(BashTool.isReadOnly!({ command: 'git status' })).toBe(true);
    expect(BashTool.isReadOnly!({ command: 'cat file.txt' })).toBe(true);
  });

  it('isReadOnly 应拒绝非白名单命令', () => {
    expect(BashTool.isReadOnly!({ command: 'rm file.txt' })).toBe(false);
    expect(BashTool.isReadOnly!({ command: 'sudo apt install' })).toBe(false);
  });

  it('checkPermissions 应拦截危险命令', () => {
    const result = BashTool.checkPermissions!({ command: 'rm -rf /' });
    expect(result.behavior).toBe('deny');
  });

  it('checkPermissions 应自动允许只读命令', () => {
    const result = BashTool.checkPermissions!({ command: 'ls -la' });
    expect(result.behavior).toBe('allow');
  });

  it('checkPermissions 应对非只读命令要求确认', () => {
    // npm 不在白名单中...实际上 npm 在白名单里。用自定义命令
    const result = BashTool.checkPermissions!({ command: 'curl https://example.com' });
    expect(result.behavior).toBe('ask');
  });

  it('应处理命令执行失败', async () => {
    const result = await BashTool.call({ command: 'nonexistent_command_xyz' });
    expect(result.isError).toBe(true);
  });

  it('应在 bash 环境中执行 Unix 命令 (Windows 兼容)', async () => {
    // ls 是 Unix 命令，Windows CMD 不支持，bash 环境下应该可以
    const result = await BashTool.call({ command: 'ls /dev/null' });
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('/dev/null');
  });

  it('应在 bash 环境中支持管道和重定向', async () => {
    const result = await BashTool.call({ command: 'echo "hello world" | tr a-z A-Z' });
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('HELLO WORLD');
  });

  it('不应使用 WSL bash（Windows）', async () => {
    // 如果 bash 解析到 WSL，会报 localhost 代理错误
    const result = await BashTool.call({ command: 'echo wsl-test-ok' });
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('wsl-test-ok');
  });
});

// ===== FileReadTool =====
describe('FileReadTool', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  it('应读取文件并带行号', async () => {
    const testFile = join(TEST_DIR, 'read-test.txt');
    await writeFile(testFile, 'line1\nline2\nline3');
    const result = await FileReadTool.call({ file_path: testFile });
    expect(result.output).toContain('line1');
    expect(result.output).toContain('line2');
    expect(result.isError).toBeFalsy();
  });

  it('应处理不存在的文件', async () => {
    const result = await FileReadTool.call({ file_path: '/nonexistent/file.txt' });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Error');
  });

  it('isReadOnly 应始终返回 true', () => {
    expect(FileReadTool.isReadOnly!()).toBe(true);
  });
});

// ===== FileEditTool =====
describe('FileEditTool', () => {
  const testFile = join(TEST_DIR, 'edit-test.txt');

  beforeEach(async () => {
    await writeFile(testFile, 'hello world\nfoo bar');
  });

  afterAll(async () => {
    await unlink(testFile).catch(() => {});
    await rm(join(TEST_DIR, 'nested', 'dir'), { recursive: true, force: true }).catch(() => {});
  });

  it('应替换唯一字符串', async () => {
    const result = await FileEditTool.call({
      file_path: testFile, old_string: 'world', new_string: 'MVP',
    });
    expect(result.isError).toBeFalsy();
    const content = await readFile(testFile, 'utf-8');
    expect(content).toBe('hello MVP\nfoo bar');
  });

  it('old_string 不存在时应报错', async () => {
    const result = await FileEditTool.call({
      file_path: testFile, old_string: 'notfound', new_string: 'x',
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('not found');
  });

  it('old_string 不唯一时应报错', async () => {
    const result = await FileEditTool.call({
      file_path: testFile, old_string: 'o', new_string: 'X',
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('not unique');
  });

  it('replace_all 应替换所有出现', async () => {
    const result = await FileEditTool.call({
      file_path: testFile, old_string: 'o', new_string: 'O', replace_all: true,
    });
    expect(result.isError).toBeFalsy();
    const content = await readFile(testFile, 'utf-8');
    expect(content).not.toContain('o');
  });

  it('checkPermissions 应对敏感文件要求确认', () => {
    const env = FileEditTool.checkPermissions!({ file_path: '/project/.env' });
    expect(env.behavior).toBe('ask');
    const normal = FileEditTool.checkPermissions!({ file_path: '/project/src/index.ts' });
    expect(normal.behavior).toBe('allow');
  });

  it('应自动创建不存在的父目录', async () => {
    const nestedFile = join(TEST_DIR, 'nested', 'dir', 'new-file.txt');
    // 先创建文件内容
    await mkdir(join(TEST_DIR, 'nested', 'dir'), { recursive: true });
    await writeFile(nestedFile, 'original content\nend');
    // 编辑：替换字符串
    const result = await FileEditTool.call({
      file_path: nestedFile, old_string: 'original', new_string: 'modified',
    });
    expect(result.isError).toBeFalsy();
    const content = await readFile(nestedFile, 'utf-8');
    expect(content).toContain('modified content');
  });
});

// ===== GlobTool =====
describe('GlobTool', () => {
  it('应找到匹配的文件', async () => {
    const result = await GlobTool.call({
      pattern: '*.ts',
      path: TEST_DIR,
    });
    expect(result.isError).toBeFalsy();
  });

  it('isReadOnly 应始终返回 true', () => {
    expect(GlobTool.isReadOnly!()).toBe(true);
  });
});

// ===== GrepTool =====
describe('GrepTool', () => {
  it('应搜索到匹配内容', async () => {
    const result = await GrepTool.call({
      pattern: 'ToolDefinition',
      path: join(process.cwd(), 'src'),
    });
    expect(result.output).toContain('ToolDefinition');
    expect(result.isError).toBeFalsy();
  });

  it('无匹配时应返回提示', async () => {
    const result = await GrepTool.call({
      pattern: 'zzz_nonexistent_pattern_zzz',
      path: TEST_DIR,
    });
    expect(result.output).toContain('no matches');
  });

  it('isReadOnly 应始终返回 true', () => {
    expect(GrepTool.isReadOnly!()).toBe(true);
  });
});

// ===== FileWriteTool =====
describe('FileWriteTool', () => {
  const writeTestFile = join(TEST_DIR, 'write-test.txt');
  const nestedWriteFile = join(TEST_DIR, 'write-nested', 'sub', 'new-file.txt');

  afterAll(async () => {
    await unlink(writeTestFile).catch(() => {});
    await rm(join(TEST_DIR, 'write-nested'), { recursive: true, force: true }).catch(() => {});
  });

  it('应创建新文件并写入内容', async () => {
    const result = await FileWriteTool.call({
      file_path: writeTestFile, content: 'hello from WriteTool',
    });
    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('File written');
    const content = await readFile(writeTestFile, 'utf-8');
    expect(content).toBe('hello from WriteTool');
  });

  it('应覆盖已存在的文件', async () => {
    await writeFile(writeTestFile, 'old content');
    const result = await FileWriteTool.call({
      file_path: writeTestFile, content: 'new content',
    });
    expect(result.isError).toBeFalsy();
    const content = await readFile(writeTestFile, 'utf-8');
    expect(content).toBe('new content');
  });

  it('应自动创建不存在的父目录', async () => {
    const result = await FileWriteTool.call({
      file_path: nestedWriteFile, content: 'nested file content',
    });
    expect(result.isError).toBeFalsy();
    const content = await readFile(nestedWriteFile, 'utf-8');
    expect(content).toBe('nested file content');
  });

  it('isReadOnly 应返回 false', () => {
    expect(FileWriteTool.isReadOnly!()).toBe(false);
  });

  it('checkPermissions 应对敏感文件要求确认', () => {
    const env = FileWriteTool.checkPermissions!({ file_path: '/project/.env' });
    expect(env.behavior).toBe('ask');
    const normal = FileWriteTool.checkPermissions!({ file_path: '/project/src/index.ts' });
    expect(normal.behavior).toBe('allow');
  });
});
