#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { buildRemoteServer } from './remote.js';

const { MAKERLORD_REMOTE_API, MAKERLORD_REMOTE_TOKEN, MAKERLORD_REMOTE_PROJECT } =
  process.env;
const server =
  MAKERLORD_REMOTE_API && MAKERLORD_REMOTE_TOKEN && MAKERLORD_REMOTE_PROJECT
    ? buildRemoteServer({
        api: MAKERLORD_REMOTE_API,
        token: MAKERLORD_REMOTE_TOKEN,
        projectId: MAKERLORD_REMOTE_PROJECT,
      })
    : buildServer();
await server.connect(new StdioServerTransport());
