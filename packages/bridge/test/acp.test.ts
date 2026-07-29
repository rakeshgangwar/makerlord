import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '@makerlord/protocol';
import { AcpAgent } from '../src/acp.js';

const FAKE = resolve('packages/bridge/test/fake-agent.mjs');

function startFake(flags: string[] = [], initTimeoutMs = 2000) {
  return AcpAgent.start({
    command: process.execPath,
    args: [FAKE, ...flags],
    initTimeoutMs,
  });
}

async function collectTurn(
  agent: AcpAgent,
  sessionId: string,
  text: string,
): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  await agent.prompt(sessionId, text, (e) => events.push(e));
  return events;
}

describe('ACP lifecycle against a real subprocess', () => {
  it('handshakes, creates a session, and completes a clean turn', async () => {
    const started = await startFake();
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = await started.agent.newSession('/tmp', []);
    const events = await collectTurn(started.agent, sessionId, 'hello');
    expect(events.map((e) => e.t)).toEqual([
      'thought.delta', 'message.delta', 'turn.end',
    ]);
    expect(events.at(-1)).toEqual({ t: 'turn.end', reason: 'end_turn' });
    started.agent.kill();
  });

  it('REFUSES an agent that omits the MCP capability, naming the gap', async () => {
    const started = await startFake(['--no-mcp']);
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.reason).toBe('NO_MCP_CAPABILITY');
    expect(started.message).toMatch(/MCP servers/i);
    expect(started.message).toMatch(/hosted agent/i);
  });

  it('times out an agent that never answers initialize', async () => {
    const started = await startFake(['--never-init'], 300);
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.reason).toBe('INIT_TIMEOUT');
  });

  it('surfaces a mid-turn crash as session.error carrying stderr', async () => {
    const started = await startFake(['--crash-mid-turn']);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = await started.agent.newSession('/tmp', []);
    const events = await collectTurn(started.agent, sessionId, 'go');
    const error = events.find((e) => e.t === 'session.error');
    expect(error).toBeDefined();
    if (error?.t === 'session.error') {
      expect(error.detail).toContain('simulated fatal error');
    }
  });

  it('surfaces a permission request and auto-approves NOTHING', async () => {
    const started = await startFake(['--ask-permission']);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = await started.agent.newSession('/tmp', []);
    // No onPermissionAsk handler installed: the bridge must reject by default.
    const events = await collectTurn(started.agent, sessionId, 'try something');
    const ask = events.find((e) => e.t === 'permission.ask');
    expect(ask).toBeDefined();
    const end = events.find((e) => e.t === 'turn.end');
    expect(end && end.t === 'turn.end' && end.reason).toBe('refusal');
    started.agent.kill();
  });

  it('ends the turn immediately on cancel, before the agent acknowledges', async () => {
    const started = await startFake(['--never-init'], 200);
    // Reuse the clean agent for the actual cancellation flow:
    const clean = await startFake();
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    const sessionId = await clean.agent.newSession('/tmp', []);
    const events: SessionEvent[] = [];
    const turn = clean.agent.prompt(sessionId, 'slow work', (e) => events.push(e));
    clean.agent.cancel(sessionId);
    expect(events.some((e) => e.t === 'turn.end' && e.reason === 'cancelled')).toBe(
      true,
    );
    await turn;
    clean.agent.kill();
    expect(started.ok).toBe(false); // tidy up the timeout probe
  });
});
