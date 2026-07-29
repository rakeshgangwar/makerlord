#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * `maker-bridge` — run on the maker's machine. Spawns their own agent
 * (any stdio ACP agent) whose tools execute on the hosted engine, and
 * serves the conversation to the web app over a paired localhost WebSocket.
 *
 *   maker-bridge                          # auto-detects an installed agent
 *   maker-bridge --agent gemini           # registry id …
 *   maker-bridge --agent ./my-agent-acp   # … or any command
 *   maker-bridge --token <hosted bearer token>
 *
 * Config precedence: flags > environment > ~/.makerlord/bridge.json
 * (written by install.sh).
 *
 * The same binary serves the MCP role: `maker-bridge mcp` runs the remote
 * tool server the daemon hands to the spawned agent — which is what lets
 * the whole bridge ship as one bundled file.
 */

// ── dispatch: daemon by default, MCP role on `mcp` (same file, second
// hat) — kept awaitless at top level so the CJS bundle stays legal.
async function dispatch(): Promise<void> {
  if (process.argv[2] === 'mcp') {
    const { MAKERLORD_REMOTE_API, MAKERLORD_REMOTE_TOKEN, MAKERLORD_REMOTE_PROJECT } =
      process.env;
    if (!MAKERLORD_REMOTE_API || !MAKERLORD_REMOTE_TOKEN || !MAKERLORD_REMOTE_PROJECT) {
      process.stderr.write(
        'maker-bridge mcp: MAKERLORD_REMOTE_API/TOKEN/PROJECT are required — ' +
        'this mode is spawned by the daemon, not run by hand\n',
      );
      process.exit(1);
    }
    const { buildRemoteServer } = await import('@makerlord/mcp');
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const server = buildRemoteServer({
      api: MAKERLORD_REMOTE_API,
      token: MAKERLORD_REMOTE_TOKEN,
      projectId: MAKERLORD_REMOTE_PROJECT,
    });
    await server.connect(new StdioServerTransport());
    return;
  }
  await runDaemon();
}

void dispatch().catch((e: Error) => {
  process.stderr.write(`maker-bridge: ${e.message}\n`);
  process.exit(1);
});

async function runDaemon(): Promise<void> {
  const { startDaemon } = await import('./daemon.js');
  const { probeAgents, userAgentsPath } = await import('./registry.js');

  const arg = (name: string, fallback?: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
  };

  /** ~/.makerlord/bridge.json — the install.sh-written fallback config. */
  const configPath = join(homedir(), '.makerlord', 'bridge.json');
  let config: { token?: string; api?: string; agent?: string } = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      process.stderr.write(`maker-bridge: ignoring unreadable ${configPath}\n`);
    }
  }

  const token = arg('token', process.env.MAKERLORD_ACCESS_TOKEN ?? config.token);
  if (!token) {
    process.stderr.write(
      'maker-bridge: no token. Pass --token <hosted bearer token>, set ' +
      `MAKERLORD_ACCESS_TOKEN, or run install.sh to write ${configPath}\n`,
    );
    process.exit(1);
  }
  const api = arg('api', process.env.MAKERLORD_API ?? config.api ?? 'https://makerlord.dev')!;

  // ── pick the brain: registry id, raw command, or auto-detect ────────
  const agents = await probeAgents();
  const requested = arg('agent', config.agent);
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
      label = requested.split('/').pop() ?? requested;
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

  // Bundled (bridge.cjs) → spawn OURSELF for the MCP role; from the repo →
  // the mcp package's own entry. import.meta.url does not survive the CJS
  // bundle, so only touch it on the repo path.
  const self = process.argv[1] ?? '';
  const bundled = self.endsWith('bridge.cjs');
  const here = bundled ? '' : dirname(fileURLToPath(import.meta.url));

  const daemon = await startDaemon({
    api,
    token,
    agentCommand: command,
    agentArgs: args,
    agentLabel: label,
    origins: [
      arg('origin', 'https://makerlord.dev')!,
      'http://localhost:5173',   // vite dev
    ],
    port: Number(arg('port', '8790')),
    mcpMain: bundled ? self : arg('mcp', resolve(here, '../../mcp/dist/main.js'))!,
    mcpArgs: bundled ? ['mcp'] : [],
  });

  process.stdout.write(
    `maker-bridge listening on ws://127.0.0.1:${daemon.port}\n` +
    `brain: ${label} · engine: ${api}\n\n` +
    `  pairing code: ${daemon.pairingCode}\n\n` +
    'In the web app, click "⚡ local brain" and enter that code once.\n' +
    'The code burns on use; restart the bridge for a fresh one.\n',
  );
}
