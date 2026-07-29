#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startDaemon } from './daemon.js';

/**
 * `maker-bridge` — run on the maker's machine. Spawns their own agent
 * (Claude Code by default) whose tools execute on the hosted engine, and
 * serves the conversation to the web app over a paired localhost WebSocket.
 *
 *   maker-bridge --token <hosted bearer token>
 *   maker-bridge --api https://makerlord.dev --agent claude-code-acp \
 *                --origin https://makerlord.dev --port 8790
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

const here = dirname(fileURLToPath(import.meta.url));
const daemon = await startDaemon({
  api: arg('api', 'https://makerlord.dev')!,
  token,
  agentCommand: arg('agent', 'claude-code-acp')!,
  origins: [
    arg('origin', 'https://makerlord.dev')!,
    'http://localhost:5173',   // vite dev
  ],
  port: Number(arg('port', '8790')),
  mcpMain: arg('mcp', resolve(here, '../../mcp/dist/main.js'))!,
});

process.stdout.write(
  `maker-bridge listening on ws://127.0.0.1:${daemon.port}\n` +
  `agent: ${arg('agent', 'claude-code-acp')} · engine: ${arg('api', 'https://makerlord.dev')}\n\n` +
  `  pairing code: ${daemon.pairingCode}\n\n` +
  'Enter it once in the web app (⚡ local brain). The code burns on use;\n' +
  'restart the bridge for a fresh one.\n',
);
