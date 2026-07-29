import { execFileSync } from 'node:child_process';

/**
 * D34: each project is a REAL git repo. Revision control is a production
 * requirement — v1 vs v2, what changed, why. The web app commits to the
 * server repo; power users clone and push; git owns sync.
 */
function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'MakerLord',
      GIT_AUTHOR_EMAIL: 'agent@makerlord.dev',
      GIT_COMMITTER_NAME: 'MakerLord',
      GIT_COMMITTER_EMAIL: 'agent@makerlord.dev',
    },
  });
}

export function initProjectRepo(dir: string): void {
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'Project created']);
}

/** Commit everything changed; a no-op when the tree is clean. */
export function commitAll(dir: string, message: string): boolean {
  git(dir, ['add', '-A']);
  const status = git(dir, ['status', '--porcelain']);
  if (status.trim().length === 0) return false;
  git(dir, ['commit', '--quiet', '-m', message.slice(0, 120)]);
  return true;
}

export function log(dir: string, limit = 20): string[] {
  return git(dir, ['log', `--max-count=${limit}`, '--pretty=%s'])
    .trim()
    .split('\n')
    .filter((l) => l.length > 0);
}
