#!/usr/bin/env node
/**
 * A fake ACP agent speaking newline-delimited JSON-RPC over real stdio —
 * the same posture as buzz's fake_llm.rs: a real subprocess, not a mocked
 * transport. Behaviour is selected with argv flags:
 *
 *   --no-mcp          initialize response omits MCP capability
 *   --never-init      never answers initialize (timeout case)
 *   --crash-mid-turn  exits with stderr output during the prompt
 *   --ask-permission  raises a permission request during the prompt
 *   --run-tools       executes prompt lines of the form `TOOL <name> <json>`
 *                     against the maker CLI (cross-brain assertion)
 */
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const cliPath = process.env.FAKE_AGENT_CLI; // absolute path to maker CLI main.js

const rl = createInterface({ input: process.stdin });
function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}
function update(sessionId, u) {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: u } });
}

let sessionCounter = 0;
let pendingPermissionId = null;

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method === 'initialize') {
    if (flags.has('--never-init')) return; // silence — the timeout case
    const capabilities = flags.has('--no-mcp')
      ? { promptCapabilities: {} }
      : { promptCapabilities: {}, mcpCapabilities: { stdio: true } };
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { protocolVersion: 1, agentCapabilities: capabilities, authMethods: [] },
    });
    return;
  }

  if (msg.method === 'session/new') {
    sessionCounter += 1;
    send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: `fake-${sessionCounter}` } });
    return;
  }

  if (msg.method === 'session/cancel') {
    return; // acknowledged silently; the bridge already ended the turn
  }

  if (msg.method === 'session/prompt') {
    const { sessionId, prompt } = msg.params;
    const text = prompt.map((p) => p.text ?? '').join('\n');

    if (flags.has('--crash-mid-turn')) {
      update(sessionId, {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'about to crash' },
      });
      process.stderr.write('fake-agent: simulated fatal error\n');
      process.exit(3);
    }

    if (flags.has('--ask-permission')) {
      send({
        jsonrpc: '2.0', id: 999,
        method: 'session/request_permission',
        params: {
          sessionId,
          toolCall: { title: 'write outside the project' },
          options: [
            { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'deny', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
      pendingPermissionId = msg.id;
      // The turn completes only after the permission response arrives.
      return;
    }

    if (flags.has('--run-tools') && cliPath) {
      for (const rawLine of text.split('\n')) {
        const m = /^TOOL (\S+) (.*)$/.exec(rawLine.trim());
        if (!m) continue;
        const [, name, jsonArgs] = m;
        const args = JSON.parse(jsonArgs);
        const cliArgs = name.split('_');
        for (const [k, v] of Object.entries(args)) {
          cliArgs.push(`--${k}`, typeof v === 'string' ? v : JSON.stringify(v));
        }
        update(sessionId, {
          sessionUpdate: 'tool_call',
          toolCallId: `c-${name}`, title: name, rawInput: args,
        });
        let result;
        try {
          const stdout = execFileSync(process.execPath, [cliPath, ...cliArgs], {
            cwd: process.cwd(), encoding: 'utf8', env: process.env,
          });
          result = JSON.parse(stdout);
        } catch (e) {
          result = { ok: true, data: { error: String(e.stdout || e.message) } };
        }
        update(sessionId, {
          sessionUpdate: 'tool_call_update',
          toolCallId: `c-${name}`, status: 'completed', rawOutput: result,
        });
      }
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
      return;
    }

    update(sessionId, {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'thinking about it' },
    });
    update(sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: `echo: ${text}` },
    });
    send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
    return;
  }

  // A response to our permission request.
  if (msg.id === 999 && msg.result && pendingPermissionId !== null) {
    const chosen = msg.result.outcome?.optionId ?? 'deny';
    send({
      jsonrpc: '2.0', id: pendingPermissionId,
      result: { stopReason: chosen === 'allow' ? 'end_turn' : 'refusal' },
    });
    pendingPermissionId = null;
  }
});
