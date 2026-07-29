import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '@makerlord/protocol';
import { normalizeStopReason, normalizeUpdate } from '../src/normalize.js';

describe('normalisation golden test — recorded ACP stream in, SessionEvent[] out', () => {
  it('translates a full turn exactly', () => {
    const stream = [
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Let me check.' } },
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'c1', title: 'check_circuit', rawInput: {},
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'c1', status: 'in_progress',
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'c1', status: 'completed',
        rawOutput: {
          ok: false, refused: 'BLOCKERS_UNRESOLVED', findings: [], message: 'nope',
        },
      },
      {
        sessionUpdate: 'plan',
        entries: [
          { content: 'fix the short', status: 'in_progress' },
          { content: 'rerun checks', status: 'pending' },
        ],
      },
      { sessionUpdate: 'unknown_future_thing', payload: 1 },
    ];

    const events = stream
      .map((u) => normalizeUpdate(u))
      .filter((e): e is SessionEvent => e !== null);

    expect(events).toEqual([
      { t: 'thought.delta', text: 'hmm' },
      { t: 'message.delta', text: 'Let me check.' },
      { t: 'tool.start', callId: 'c1', name: 'check_circuit', input: {} },
      {
        t: 'tool.end',
        callId: 'c1',
        // A refusal stays a refusal all the way to the renderer.
        result: {
          ok: false, refused: 'BLOCKERS_UNRESOLVED', findings: [], message: 'nope',
        },
      },
      {
        t: 'plan',
        steps: [
          { title: 'fix the short', status: 'in_progress' },
          { title: 'rerun checks', status: 'pending' },
        ],
      },
    ]);
  });

  it('normalises stop reasons across spellings', () => {
    expect(normalizeStopReason('end_turn')).toBe('end_turn');
    expect(normalizeStopReason('endTurn')).toBe('end_turn');
    expect(normalizeStopReason('canceled')).toBe('cancelled');
    expect(normalizeStopReason('something_novel')).toBe('error');
  });
});
