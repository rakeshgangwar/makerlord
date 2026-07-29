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
 * The ecosystem is 35+ agents (agentclientprotocol.com/get-started/agents);
 * built-ins cover the majors with stdio transports, and anything else goes
 * in ~/.makerlord/agents.json — a wrong entry costs a failed probe or a
 * clear INIT_TIMEOUT, never a crash. claude-code is VERIFIED end-to-end
 * (2026-07-29, live bridge run); the rest carry the spec §3 caveat: names
 * move in a young ecosystem. Agents whose ACP is HTTP/SSE-only (e.g.
 * `qwen serve` daemon mode) are NOT listed — this host speaks stdio.
 */
export const BUILTIN_PROBES: Omit<AgentEntry, 'detected' | 'source'>[] = [
  { id: 'claude-code', displayName: 'Claude Code', command: 'claude-code-acp', args: [] },
  { id: 'codex', displayName: 'Codex', command: 'codex-acp', args: [] },
  { id: 'gemini', displayName: 'Gemini CLI', command: 'gemini', args: ['--experimental-acp'] },
  { id: 'goose', displayName: 'Goose', command: 'goose', args: ['acp'] },
  { id: 'qwen', displayName: 'Qwen Code', command: 'qwen', args: ['--experimental-acp'] },
  { id: 'kimi', displayName: 'Kimi CLI', command: 'kimi', args: ['--acp'] },
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
    // Presence on PATH is the detection signal. A --version probe is NOT —
    // pure ACP adapters (claude-code-acp) have no --version and just start
    // serving; a broken binary surfaces at initialize with a clear
    // INIT_TIMEOUT instead.
    out.push({
      ...entry,
      command: resolved ?? entry.command,
      detected: resolved !== undefined,
    });
  }
  return out;
}
