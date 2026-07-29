#!/usr/bin/env node
import { buildHttpServer } from './http.js';
import { HostedSessions } from './sessions.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  process.stderr.write('makerlord-server: ANTHROPIC_API_KEY is required\n');
  process.exit(1);
}

const options: ConstructorParameters<typeof HostedSessions>[0] = {
  projectsRoot: process.env.MAKERLORD_PROJECTS_ROOT ?? './projects',
  apiKey,
};
if (process.env.ANTHROPIC_BASE_URL) options.baseURL = process.env.ANTHROPIC_BASE_URL;
if (process.env.MAKERLORD_MODEL) options.model = process.env.MAKERLORD_MODEL;

const sessions = new HostedSessions(options);
const server = buildHttpServer(sessions, process.env.MAKERLORD_ACCESS_TOKEN);
const port = Number(process.env.PORT ?? 8787);
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`makerlord-server listening on 127.0.0.1:${port}\n`);
});
