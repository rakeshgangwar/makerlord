import { describe, expect, it } from 'vitest';
import { digestTranscript } from '../src/digest.js';

const turn = (maker: string, agent: string, tools: string[] = []) => [
  { kind: 'maker', text: maker },
  ...tools.map((name) => ({ kind: 'event', event: { t: 'tool.start', name } })),
  { kind: 'event', event: { t: 'message.delta', text: agent } },
  { kind: 'event', event: { t: 'turn.end', reason: 'end_turn' } },
];

describe('the transcript digest a fresh bridge session receives', () => {
  it('renders turns as dialogue with the tools that ran', () => {
    const d = digestTranscript([
      ...turn('build a lamp', 'On it.', ['parts_search']),
      ...turn('use a red LED', 'Recorded.'),
    ]);
    expect(d).toContain('MAKER: build a lamp');
    expect(d).toContain('AGENT: On it.');
    expect(d).toContain('(tools used: parts_search)');
    expect(d).toContain('MAKER: use a red LED');
    expect(d).toContain('do not re-introduce yourself');
  });

  it('caps one turn\'s monologue so it cannot evict the other turns', () => {
    const records = [
      ...turn('first question', 'x'.repeat(9000)),
      ...turn('latest question', 'short answer'),
    ];
    const d = digestTranscript(records);
    // Both turns survive; the long prose is clipped, not the history.
    expect(d).toContain('first question');
    expect(d).toContain('latest question');
    expect(d).toContain('[…truncated]');
    expect(d.length).toBeLessThan(3000);
  });

  it('drops the OLDEST turns when even clipped turns overflow, and says so', () => {
    const records = [
      ...turn('first question', 'x'.repeat(700)),
      ...turn('latest question', 'y'.repeat(700)),
    ];
    const d = digestTranscript(records, 800);
    expect(d).toContain('latest question');
    expect(d).not.toContain('first question');
    expect(d).toMatch(/earlier turns? omitted/);
  });

  it('an empty transcript injects nothing at all', () => {
    expect(digestTranscript([])).toBe('');
  });
});
