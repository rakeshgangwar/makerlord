#!/usr/bin/env node
import { buildHttpServer } from './http.js';
import { HostedSessions } from './sessions.js';

const backend = process.env.MAKERLORD_AGENT_BACKEND === 'acp' ? 'acp' as const : 'sdk' as const;
// BYOK-first (2026-07-31): an instance key is optional. Without one,
// every maker brings a provider key (◇) or a local brain (⚡) — the
// instance fronts compute for no one.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (backend === 'sdk' && !apiKey) {
  process.stderr.write('makerlord-server: no ANTHROPIC_API_KEY — makers must configure their own provider (BYOK) or a local brain\n');
}

const options: ConstructorParameters<typeof HostedSessions>[0] = {
  projectsRoot: process.env.MAKERLORD_PROJECTS_ROOT ?? './projects',
  backend,
};
if (apiKey) options.apiKey = apiKey;
if (process.env.ANTHROPIC_BASE_URL) options.baseURL = process.env.ANTHROPIC_BASE_URL;
if (process.env.MAKERLORD_MODEL) options.model = process.env.MAKERLORD_MODEL;
if (process.env.MAKERLORD_ACP_COMMAND) options.acpCommand = process.env.MAKERLORD_ACP_COMMAND;
if (process.env.MAKERLORD_ACP_ARGS) options.acpArgs = process.env.MAKERLORD_ACP_ARGS.split(' ');
if (process.env.MAKERLORD_MCP_PATH) options.mcpPath = process.env.MAKERLORD_MCP_PATH;
if (process.env.MAKERLORD_WEB_RESEARCH === '1') options.webResearch = true;
if (process.env.MAKERLORD_COMPACTION === '0') options.compactionBeta = false;

const sessions = new HostedSessions(options);
const server = buildHttpServer(sessions, process.env.MAKERLORD_ACCESS_TOKEN);
const port = Number(process.env.PORT ?? 8787);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`makerlord-server listening on 127.0.0.1:${port}\n`);
});
