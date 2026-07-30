import { describe, expect, it } from 'vitest';
import { humanNetName } from '../src/net-names.js';

describe('humanNetName — net ids become maker language', () => {
  it('renders a two-ended intent net as endpoints', () => {
    expect(humanNetName('net_U1_5V__LED1_anode')).toBe('U1.5V → LED1.anode');
    expect(humanNetName('net_MCU1_D5 PWM__INDICATOR2_anode')).toBe('MCU1.D5 PWM → INDICATOR2.anode');
  });
  it('leaves opaque bus/rail ids alone', () => {
    expect(humanNetName('busX-2')).toBe('busX-2');
    expect(humanNetName('A98')).toBe('A98');
  });
});
