#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startDaemon } from './daemon.js';
import { probeAgents, userAgentsPath } from './registry.js';

/**
 * `maker-bridge` — run on the maker's machine. Spawns their own agent
 * (any stdio ACP agent) whose tools execute on the hosted engine, and
 * serves the conversation to the web app over a paired localhost WebSocket.
 *
 *   maker-bridge                          # auto-detects an installed agent
 *   maker-bridge --agent gemini           # registry id …
 *   maker-bridge --agent ./my-agent-acp   # … or any command
 *   maker-bridge --token <hosted bearer token>
 */
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const token = arg('token', process.env.MAKERLORD_ACCESS_TOKEN);
if (!token) {
  process.stderr.write(
    'maker-bridge: --token <hosted bearer token> is required ' +
    '(or MAKERLORD_ACCESS_TOKEN in the environment)\n',
  );
  process.exit(1);
}

// ── pick the brain: registry id, raw command, or auto-detect ──────────
const agents = await probeAgents();
const requested = arg('agent');
let command: string;
let args: string[] = [];
let label: string;

if (requested) {
  const entry = agents.find((a) => a.id === requested);
  if (entry) {
    if (!entry.detected) {
      process.stderr.write(
        `maker-bridge: "${requested}" is known but not installed ` +
        `(probed: ${entry.command}). Install it, or pass a command directly.\n`,
      );
      process.exit(1);
    }
    ({ command, args } = entry);
    label = entry.displayName;
  } else {
    command = requested;      // any stdio ACP agent works — pass its command
    label = requested;
  }
} else {
  const detected = agents.filter((a) => a.detected);
  if (detected.length === 0) {
    process.stderr.write(
      'maker-bridge: no ACP agent found on this machine.\n\n' +
      'Known agents probed:\n' +
      agents.map((a) => `  ✗ ${a.displayName.padEnd(12)} (${a.command}${a.args.length ? ' ' + a.args.join(' ') : ''})`).join('\n') +
      `\n\nInstall one (e.g. npm i -g @zed-industries/claude-code-acp), pass\n` +
      `--agent <command>, or add your own to ${userAgentsPath()}:\n` +
      '  [{ "id": "mine", "displayName": "Mine", "command": "my-acp", "args": [] }]\n',
    );
    process.exit(1);
  }
  ({ command, args } = detected[0]!);
  label = detected[0]!.displayName;
  if (detected.length > 1) {
    process.stdout.write(
      `detected: ${detected.map((a) => a.id).join(', ')} — using ${detected[0]!.id} ` +
      '(pick another with --agent <id>)\n',
    );
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const daemon = await startDaemon({
  api: arg('api', 'https://makerlord.dev')!,
  token,
  agentCommand: command,
  agentArgs: args,
  agentLabel: label,
  origins: [
    arg('origin', 'https://makerlord.dev')!,
    'http://localhost:5173',   // vite dev
  ],
  port: Number(arg('port', '8790')),
  mcpMain: arg('mcp', resolve(here, '../../mcp/dist/main.js'))!,
});

process.stdout.write(
  `maker-bridge listening on ws://127.0.0.1:${daemon.port}\n` +
  `brain: ${label} · engine: ${arg('api', 'https://makerlord.dev')}\n\n` +
  `  pairing code: ${daemon.pairingCode}\n\n` +
  'In the web app, click "⚡ local brain" and enter that code once.\n' +
  'The code burns on use; restart the bridge for a fresh one.\n',
);
