import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function getGitContext(): Promise<string> {
  try {
    const [branch, status, log] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { maxBuffer: 1024 })
        .then(r => r.stdout.trim()).catch(() => '(unknown)'),
      execFileAsync('git', ['status', '--short'], { maxBuffer: 10240 })
        .then(r => r.stdout.trim() || '(clean)').catch(() => ''),
      execFileAsync('git', ['log', '--oneline', '-n', '5'], { maxBuffer: 1024 })
        .then(r => r.stdout.trim()).catch(() => ''),
    ]);

    return `Branch: ${branch}\nStatus: ${status}\nRecent commits:\n${log}`;
  } catch {
    return '';
  }
}
