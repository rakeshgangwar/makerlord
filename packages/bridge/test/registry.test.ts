import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeAgents, probeCommand, resolveOnPath } from '../src/registry.js';

function stubDir(): string {
  return mkdtempSync(join(tmpdir(), 'makerlord-agents-'));
}

function writeStub(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe('agent registry probing', () => {
  it('detects a binary that answers --version', async () => {
    const dir = stubDir();
    writeStub(dir, 'claude-code-acp', 'echo 1.0.0; exit 0');
    const env = { ...process.env, PATH: dir, MAKERLORD_AGENTS_PATH: '/nonexistent' };
    const agents = await probeAgents(env);
    const claude = agents.find((a) => a.id === 'claude-code')!;
    expect(claude.detected).toBe(true);
    expect(claude.command).toBe(join(dir, 'claude-code-acp'));
  });

  it('marks missing binaries as not detected — a failed probe, not a crash', async () => {
    const env = { ...process.env, PATH: stubDir(), MAKERLORD_AGENTS_PATH: '/nonexistent' };
    const agents = await probeAgents(env);
    expect(agents.every((a) => !a.detected)).toBe(true);
  });

  it('treats a hanging binary as a non-detection after the timeout', async () => {
    const dir = stubDir();
    const path = writeStub(dir, 'hangs', 'sleep 60');
    expect(await probeCommand(path, 200)).toBe(false);
  });

  it('lets a user entry override a builtin with the same id', async () => {
    const dir = stubDir();
    writeStub(dir, 'my-claude', 'echo ok; exit 0');
    const agentsJson = join(dir, 'agents.json');
    writeFileSync(
      agentsJson,
      JSON.stringify([
        { id: 'claude-code', displayName: 'My build', command: 'my-claude', args: [] },
      ]),
    );
    const env = { ...process.env, PATH: dir, MAKERLORD_AGENTS_PATH: agentsJson };
    const agents = await probeAgents(env);
    const claude = agents.find((a) => a.id === 'claude-code')!;
    expect(claude.source).toBe('user');
    expect(claude.displayName).toBe('My build');
    expect(claude.detected).toBe(true);
  });

  it('resolveOnPath walks PATH in order', () => {
    const a = stubDir();
    const b = stubDir();
    writeStub(b, 'tool', 'exit 0');
    const found = resolveOnPath('tool', { PATH: `${a}:${b}` } as NodeJS.ProcessEnv);
    expect(found).toBe(join(b, 'tool'));
  });
});
