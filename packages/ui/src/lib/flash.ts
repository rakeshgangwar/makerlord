/**
 * The browser half of stage ⑦ (firmware spec §6, D37/D47) — pure logic,
 * no DOM: the panel state machine (the UI never renders a flash control
 * the engine would refuse), the one-port broker, and the serial-line
 * parser that grants structure ONLY to the scaffold's own SELFTEST/LOG
 * shapes. Everything else the device prints is untrusted raw text.
 */

export interface FlashInputs {
  gateOpen: boolean;
  buildOk: boolean;
  webSerial: boolean;
  protocol: string;
}

export type FlashPanel =
  | { state: 'ready' }
  | { state: 'locked' | 'no-bin' | 'unsupported' | 'protocol-pending'; reason: string };

export function flashPanelState(i: FlashInputs): FlashPanel {
  // Safety first: the gate outranks every convenience state.
  if (!i.gateOpen) {
    return {
      state: 'locked',
      reason:
        'flashing powers the board over USB — record the gate measurements ' +
        'and open the power gate first',
    };
  }
  if (!i.buildOk) {
    return {
      state: 'no-bin',
      reason: 'no compiled firmware — run the compile step; the bin exists only if it succeeded',
    };
  }
  if (!i.webSerial) {
    return {
      state: 'unsupported',
      reason: 'this browser has no WebSerial — Chrome or Edge on desktop can flash',
    };
  }
  if (flasherFor(i.protocol) === null) {
    return {
      state: 'protocol-pending',
      reason:
        `no browser flasher for ${i.protocol} yet (Uno) — flash from a ` +
        'checkout with arduino-cli upload meanwhile',
    };
  }
  return { state: 'ready' };
}

/** Which browser flasher drives this protocol. */
export function flasherFor(protocol: string): 'esptool' | 'stk500' | null {
  if (protocol === 'esptool-js') return 'esptool';
  if (protocol === 'stk500v1') return 'stk500';
  return null;
}

export type SerialLine =
  | { kind: 'selftest'; role: string; mode: string; ok: boolean }
  | { kind: 'log'; behavior: string; value: string }
  | { kind: 'raw'; text: string };

export function parseSerialLine(line: string): SerialLine {
  const selftest = /^SELFTEST role=(\S+) mode=(\S+) (ok|fail)$/.exec(line);
  if (selftest) {
    return {
      kind: 'selftest',
      role: selftest[1]!,
      mode: selftest[2]!,
      ok: selftest[3] === 'ok',
    };
  }
  const log = /^LOG ([^=]+)=(.*)$/.exec(line);
  if (log) return { kind: 'log', behavior: log[1]!, value: log[2]! };
  return { kind: 'raw', text: line };
}

export interface SerialLease {
  purpose: 'flash' | 'monitor';
  release(): void;
}

/**
 * One WebSerial port, turns taken honestly: a flash never fights the
 * monitor. Whoever holds the lease owns open/close; a stale release
 * can never evict a newer holder.
 */
export class SerialBroker {
  private current: SerialLease | null = null;

  get holder(): 'flash' | 'monitor' | null {
    return this.current?.purpose ?? null;
  }

  acquire(purpose: 'flash' | 'monitor'): SerialLease | null {
    if (this.current !== null) return null;
    const lease: SerialLease = {
      purpose,
      release: () => {
        if (this.current === lease) this.current = null;
      },
    };
    this.current = lease;
    return lease;
  }
}
