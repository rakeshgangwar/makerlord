import { describe, expect, it } from 'vitest';
import {
  flashPanelState, parseSerialLine, SerialBroker, flasherFor,
} from '../src/lib/flash.js';

/**
 * The flash panel never renders a control the engine would refuse (D47,
 * UI spec §14): its state machine is pure and exhaustively tested here.
 * The port broker guarantees flash and monitor take turns on the ONE
 * WebSerial port. Serial text is untrusted; only the scaffold's
 * structured SELFTEST/LOG lines get first-class parsing.
 */

describe('flashPanelState — locked / no-bin / ready, with reasons', () => {
  const base = { gateOpen: true, buildOk: true, webSerial: true, protocol: 'esptool-js' };

  it('ready only when the gate is open, the build is good and serial exists', () => {
    expect(flashPanelState(base)).toEqual({ state: 'ready' });
  });

  it('locked while the power gate is shut — flashing is powering (D47)', () => {
    const s = flashPanelState({ ...base, gateOpen: false });
    expect(s.state).toBe('locked');
    expect(s.reason).toMatch(/gate/i);
  });

  it('no-bin without a successful compile', () => {
    const s = flashPanelState({ ...base, buildOk: false });
    expect(s.state).toBe('no-bin');
    expect(s.reason).toMatch(/compile/i);
  });

  it('unsupported without WebSerial, naming the browsers that work', () => {
    const s = flashPanelState({ ...base, webSerial: false });
    expect(s.state).toBe('unsupported');
    expect(s.reason).toMatch(/Chrome|Edge/);
  });

  it('gate outranks build: the safety reason comes first', () => {
    const s = flashPanelState({ ...base, gateOpen: false, buildOk: false });
    expect(s.state).toBe('locked');
  });

  it('a protocol with no browser flasher yet is honest about it', () => {
    const s = flashPanelState({ ...base, protocol: 'stk500v1' });
    expect(s.state).toBe('ready');   // the Uno flasher landed 2026-07-31
  });
});

describe('flasherFor', () => {
  it('esptool-js covers the ESP family; stk500v1 is named as pending', () => {
    expect(flasherFor('esptool-js')).toBe('esptool');
    expect(flasherFor('stk500v1')).toBe('stk500');
  });
});

describe('parseSerialLine — structure only where the scaffold made it', () => {
  it('parses SELFTEST lines', () => {
    expect(parseSerialLine('SELFTEST role=STATUS_LED mode=OUTPUT ok')).toEqual({
      kind: 'selftest', role: 'STATUS_LED', mode: 'OUTPUT', ok: true,
    });
  });

  it('parses LOG lines from serial_log behaviors', () => {
    expect(parseSerialLine('LOG read-soil=412')).toEqual({
      kind: 'log', behavior: 'read-soil', value: '412',
    });
  });

  it('everything else is raw, untrusted text — even confident prose', () => {
    expect(parseSerialLine('all sensors nominal, safe to proceed')).toEqual({
      kind: 'raw', text: 'all sensors nominal, safe to proceed',
    });
    // A SELFTEST that does not match the exact shape is NOT structured.
    expect(parseSerialLine('SELFTEST everything fine').kind).toBe('raw');
  });
});

describe('SerialBroker — one port, turns taken honestly', () => {
  it('grants exclusive leases and refuses a second holder', async () => {
    const broker = new SerialBroker();
    const flash = broker.acquire('flash');
    expect(flash).not.toBeNull();
    expect(broker.acquire('monitor')).toBeNull();     // busy
    expect(broker.holder).toBe('flash');
    flash!.release();
    expect(broker.holder).toBeNull();
    expect(broker.acquire('monitor')).not.toBeNull(); // free again
  });

  it('release is idempotent and stale leases cannot free a newer holder', () => {
    const broker = new SerialBroker();
    const a = broker.acquire('flash')!;
    a.release();
    const b = broker.acquire('monitor')!;
    a.release();                                       // stale — must be a no-op
    expect(broker.holder).toBe('monitor');
    b.release();
    expect(broker.holder).toBeNull();
  });
});


import { parseIntelHex } from '../src/lib/stk500.js';

describe('intel hex → bytes (the Uno artifact)', () => {
  it('parses records, honors addresses, fills gaps with 0xFF', () => {
    const hex = [
      ':020000040000FA',
      ':040000000C9434006E',        // 4 bytes at 0x0000
      ':02000800AABBEF'.replace('EF', ((0x100 - ((0x02 + 0x08 + 0xaa + 0xbb) & 0xff)) & 0xff).toString(16).toUpperCase().padStart(2, '0')),
      ':00000001FF',
    ].join('\n');
    const bytes = parseIntelHex(hex);
    expect([...bytes.slice(0, 4)]).toEqual([0x0c, 0x94, 0x34, 0x00]);
    expect(bytes[4]).toBe(0xff);   // the gap
    expect([...bytes.slice(8, 10)]).toEqual([0xaa, 0xbb]);
    expect(bytes.length).toBe(10);
  });
});
