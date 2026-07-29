import { describe, expect, it } from 'vitest';
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
