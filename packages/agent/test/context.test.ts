import { describe, expect, it } from 'vitest';
import { compact } from '../src/compaction.js';
import {
  contextPressureBytes, estimatedBytes, IMAGE_PRESSURE_BYTES,
} from '../src/context.js';

describe('two measures, not one', () => {
  it('text is billed as text by both measures', () => {
    const msg = { role: 'user', content: 'hello world' };
    expect(estimatedBytes(msg)).toBe(11);
    expect(contextPressureBytes(msg)).toBe(11);
  });

  it('THE inherited-bug regression: a 3 MB image charges 16 KiB pressure', () => {
    const threeMb = 'x'.repeat(3 * 1024 * 1024);
    const msg = {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', data: threeMb } },
      ],
    };
    expect(estimatedBytes(msg)).toBe(3 * 1024 * 1024);       // true wire size
    expect(contextPressureBytes(msg)).toBe(IMAGE_PRESSURE_BYTES);
    // The over-count this prevents: ~192×; buzz measured ~1500× on 3.1 MB.
    expect(estimatedBytes(msg) / contextPressureBytes(msg)).toBeGreaterThan(100);
  });

  it('a project.json excerpt is billed at its actual size by both', () => {
    const excerpt = JSON.stringify({ parts: ['a', 'b'] });
    const msg = { role: 'user', content: [{ type: 'text', text: excerpt }] };
    expect(estimatedBytes(msg)).toBe(Buffer.byteLength(excerpt));
    expect(contextPressureBytes(msg)).toBe(Buffer.byteLength(excerpt));
  });

  it('mixed content charges each piece by its own rule', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: 'look:' },
        { type: 'image', source: { type: 'base64', data: 'y'.repeat(100_000) } },
      ],
    };
    expect(contextPressureBytes(msg)).toBe(5 + IMAGE_PRESSURE_BYTES);
    expect(estimatedBytes(msg)).toBe(5 + 100_000);
  });
});

describe('compaction never orphans a tool_result (observed live)', () => {
  it('a cut landing on a results message drops it to the next clean head', () => {
    // Live shape: assistant messages are HEAVY (thinking blocks), results
    // are modest — the budget runs out between a kept result and its
    // heavier assistant call, orphaning the result.
    const thinking = 'x'.repeat(52_000);
    const messages = [
      { role: 'user' as const, content: 'start the research' },
      { role: 'assistant' as const, content: [
        { type: 'thinking', thinking },
        { type: 'tool_use', id: 'tu_1', name: 'parts_search', input: {} },
      ] as never },
      { role: 'user' as const, content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'small result' },
      ] as never },
      { role: 'assistant' as const, content: [
        { type: 'thinking', thinking },
        { type: 'tool_use', id: 'tu_2', name: 'parts_get', input: {} },
      ] as never },
      { role: 'user' as const, content: [
        { type: 'tool_result', tool_use_id: 'tu_2', content: 'small result 2' },
      ] as never },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'ok' }] as never },
      { role: 'user' as const, content: 'and now finish up' },
    ];
    // A limit that forces the cut INTO the pairs.
    const { messages: out, compacted } = compact(messages, { openFindings: [], measurements: [] }, 90_000);
    expect(compacted).toBe(true);
    // No kept message may carry a tool_result whose tool_use was dropped.
    const keptJson = JSON.stringify(out);
    const resultIds = [...keptJson.matchAll(/"tool_use_id":"(tu_\d+)"/g)].map((m) => m[1]);
    for (const id of resultIds) {
      expect(keptJson, `orphan result for ${id}`).toContain(`"id":"${id}"`);
    }
    // The newest user text always survives.
    expect(keptJson).toContain('and now finish up');
  });

  it('an all-heavy history still keeps the latest message rather than nothing', () => {
    const big = 'y'.repeat(120_000);
    const messages = [
      { role: 'user' as const, content: 'go' },
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: 'tu_9', name: 'x', input: {} }] as never },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'tu_9', content: big }] as never },
    ];
    const { messages: out } = compact(messages, { openFindings: [], measurements: [] }, 60_000);
    expect(out.length).toBeGreaterThan(1);   // summary + the final PAIR
    // Over budget beats invalid: the pair stays intact, never an orphan.
    const keptJson = JSON.stringify(out);
    expect(keptJson).toContain('"tool_use_id":"tu_9"');
    expect(keptJson).toContain('"id":"tu_9"');
  });
});
