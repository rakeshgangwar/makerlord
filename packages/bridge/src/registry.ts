import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface AgentEntry {
  id: string;
  displayName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  source: 'builtin' | 'user';
  detected: boolean;
}

/**
 * ⚠️ Package and binary names are UNVERIFIED (spec §3) — the ACP adapter
 * ecosystem is young and names move. A wrong entry costs a failed probe and a
 * "not found", never a crash. Confirm against each project before shipping.
 */
export const BUILTIN_PROBES: Omit<AgentEntry, 'detected' | 'source'>[] = [
  { id: 'claude-code', displayName: 'Claude Code', command: 'claude-code-acp', args: [] },
  { id: 'codex', displayName: 'Codex', command: 'codex-acp', args: [] },
  { id: 'gemini', displayName: 'Gemini CLI', command: 'gemini', args: ['--experimental-acp'] },
];

export function userAgentsPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.MAKERLORD_AGENTS_PATH ?? join(homedir(), '.makerlord', 'agents.json');
}

export function loadUserAgents(
  env: NodeJS.ProcessEnv = process.env,
): Omit<AgentEntry, 'detected' | 'source'>[] {
  const path = userAgentsPath(env);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as Omit<
    AgentEntry,
    'detected' | 'source'
  >[];
}

/** `command --version` with a hard timeout; anything else is a non-detection. */
export function probeCommand(
  command: string,
  timeoutMs = 2000,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      ['--version'],
      { timeout: timeoutMs, env: env as Record<string, string> },
      (error) => resolve(error === null),
    );
    child.on('error', () => resolve(false));
  });
}

export function resolveOnPath(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (command.includes('/')) return existsSync(command) ? command : undefined;
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, command);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Built-ins merged with ~/.makerlord/agents.json, user entries winning.
 * Probing happens on start and on demand — never on every session.
 */
export async function probeAgents(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentEntry[]> {
  const merged = new Map<string, Omit<AgentEntry, 'detected'>>();
  for (const b of BUILTIN_PROBES) merged.set(b.id, { ...b, source: 'builtin' });
  for (const u of loadUserAgents(env)) merged.set(u.id, { ...u, source: 'user' });

  const out: AgentEntry[] = [];
  for (const entry of merged.values()) {
    const resolved = resolveOnPath(entry.command, env);
    const detected =
      resolved !== undefined && (await probeCommand(resolved, 2000, env));
    out.push({
      ...entry,
      command: resolved ?? entry.command,
      detected,
    });
  }
  return out;
}
