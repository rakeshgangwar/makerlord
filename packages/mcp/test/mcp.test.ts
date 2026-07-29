import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ALL_TOOLS, initProjectFile } from '@makerlord/tools';
import { buildServer } from '../src/server.js';

let client: Client;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'makerlord-mcp-'));
  initProjectFile(join(dir, 'project.json'), 'an mcp test project');
  const server = buildServer(dir);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

interface TextResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  return (await client.callTool({ name, arguments: args })) as TextResult;
}

describe('maker-mcp', () => {
  it('tools/list matches the registry exactly', async () => {
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual(
      ALL_TOOLS.map((t) => t.name).sort(),
    );
  });

  it('appends expectHash to mutating tools only', async () => {
    const listed = await client.listTools();
    const byName = new Map(listed.tools.map((t) => [t.name, t]));
    const mutating = byName.get('inventory_add')!;
    const readOnly = byName.get('project_status')!;
    expect(
      (mutating.inputSchema.properties as Record<string, unknown>).expectHash,
    ).toBeDefined();
    expect(
      (readOnly.inputSchema.properties as Record<string, unknown> | undefined)
        ?.expectHash,
    ).toBeUndefined();
  });

  it('a call round-trips through the registry', async () => {
    const res = await callTool('project_status');
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as {
      ok: boolean; data: { intent: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.intent).toBe('an mcp test project');
  });

  it('a REFUSAL arrives as a normal result, not isError', async () => {
    await callTool('block_add', { id: 'psu', name: 'psu' });
    const res = await callTool('expand');
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as {
      ok: boolean; refused: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.refused).toBe('BLOCK_UNDECIDED');
  });

  it('a genuine error IS isError', async () => {
    const res = await callTool('parts_get', { id: 'not-a-part' });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]!.text)).toHaveProperty('error');
  });

  it('a stale expectHash refuses without clobbering', async () => {
    const res = await callTool('inventory_add', {
      freeText: 'some LEDs',
      expectHash: 'stale-hash-from-yesterday',
    });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as {
      ok: boolean; refused: string;
    };
    expect(parsed.refused).toBe('STALE_PROJECT');
  });
});

describe('the remote adapter: local schemas, hosted execution', () => {
  it('proxies tools/call to the hosted engine and returns its ToolResult verbatim', async () => {
    const { createServer } = await import('node:http');
    const { buildRemoteServer } = await import('../src/remote.js');
    const seen: { url?: string; auth?: string; body?: unknown } = {};
    const stub = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        seen.url = req.url ?? '';
        seen.auth = req.headers.authorization ?? '';
        seen.body = JSON.parse(data);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, refused: 'BLOCK_UNDECIDED', findings: [], message: 'no' }));
      });
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
    const port = (stub.address() as { port: number }).port;

    const remote = buildRemoteServer({
      api: `http://127.0.0.1:${port}`, token: 'sekrit', projectId: 'deadbeef',
    });
    const remoteClient = new Client({ name: 't', version: '0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await remote.connect(st);
    await remoteClient.connect(ct);

    const tools = await remoteClient.listTools();
    expect(tools.tools.length).toBe(36);   // all but project_init
    expect(tools.tools.map((t) => t.name)).not.toContain('project_init');

    const result = await remoteClient.callTool({ name: 'expand', arguments: {} });
    expect(seen.url).toBe('/api/projects/deadbeef/tool');
    expect(seen.auth).toBe('Bearer sekrit');
    expect(seen.body).toEqual({ name: 'expand', input: {} });
    // The hosted refusal arrives as a NORMAL result — the gate holds remotely.
    expect(result.isError ?? false).toBe(false);
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text);
    expect(payload).toMatchObject({ ok: false, refused: 'BLOCK_UNDECIDED' });
    stub.close();
  });
});
