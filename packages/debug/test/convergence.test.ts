import { describe, expect, it } from 'vitest';
import type { FaultCandidate } from '@makerlord/project';
import { applyObservation, verdictOf } from '../src/prune.js';
import { nextProbe } from '../src/probe.js';

/**
 * ── THE CONVERGENCE PROPERTY (spec §11) ───────────────────────────────
 * Seed each fault; at every proposed probe, answer with the seeded
 * candidate's OWN predicted value (a perfect meter on the faulted
 * board). The search must end with the seed convicted — or, where
 * physics genuinely cannot separate two candidates by DC voltage, with
 * an honest minimal tie that CONTAINS the seed. The x10-resistor case
 * is the real example: the LED clamps its net, so the difference from
 * no-fault hides inside the tolerance band — brightness or a current
 * reading separates them, a DC voltmeter does not, and the engine must
 * SAY that rather than guess.
 *
 * Signatures here are hand-authored but physically shaped (5 V rail,
 * 220 Ω, red LED); the ngspice leg reproduces them in integration.
 */

const TABLE: Record<string, Record<string, number>> = {
  'no-fault':       { vcc: 5.0, mid: 2.0, gnd: 0.0 },
  'open-vcc':       { vcc: 5.0, mid: 0.0, gnd: 0.0 },
  'open-mid':       { vcc: 5.0, mid: 5.0, gnd: 0.0 },   // R side floats high
  'open-gnd':       { vcc: 5.0, mid: 4.9, gnd: 4.9 },   // no current, all floats up
  'reversed-LED1':  { vcc: 5.0, mid: 4.6, gnd: 0.0 },   // blocking: near-rail at anode
  'dead-rail':      { vcc: 0.0, mid: 0.0, gnd: 0.0 },
  'value-R1-x10':   { vcc: 5.0, mid: 1.9, gnd: 0.0 },   // 0.1 V from no-fault: IN BAND
};

function candidates(): FaultCandidate[] {
  return Object.entries(TABLE).map(([id, netVoltages]) => ({
    id,
    // The verdict distinguishes no_fault from real faults; the search
    // itself only reads signatures.
    fault: id === 'no-fault'
      ? { kind: 'no_fault' as const }
      : { kind: 'open_joint' as const, net: id },
    status: 'live',
    signature: { netVoltages, provenance: 'computed' },
  }));
}

/** Candidates a perfect meter cannot tell from the seed on ANY net. */
function inseparableFrom(seed: string): string[] {
  const s = TABLE[seed]!;
  return Object.entries(TABLE)
    .filter(([, sig]) => Object.keys(s).every((net) => {
      const band = Math.max(0.1 * Math.abs(s[net]!), 0.2);
      return Math.abs(sig[net]! - s[net]!) <= band + 1e-9;
    }))
    .map(([id]) => id);
}

describe('the convergence property — every seeded fault, perfect meter', () => {
  for (const seed of Object.keys(TABLE)) {
    it(`seeded ${seed}: convicted, or an honest tie containing it`, () => {
      let cands = candidates();
      const seedSig = TABLE[seed]!;
      let obsN = 0;

      for (;;) {
        const live = cands.filter((c) => c.status === 'live');
        // The rivals invariant: mid-search there are ≥2 live candidates.
        if (live.length >= 2) {
          const p = nextProbe(cands);
          if (p === null) break;   // nothing separates the survivors — tie
          obsN += 1;
          cands = applyObservation(cands, {
            id: `obs-${obsN}`, kind: 'voltage',
            net: p.net, value: seedSig[p.net]!, unit: 'V',
          });
          expect(obsN).toBeLessThan(20);   // guaranteed progress
          continue;
        }
        break;
      }

      const survivors = cands.filter((c) => c.status === 'live').map((c) => c.id);
      // The seed always survives its own readings…
      expect(survivors).toContain(seed);
      // …and the surviving set is exactly the physics-inseparable set:
      // nothing separable was left alive, nothing inseparable was killed.
      expect(survivors.sort()).toEqual(inseparableFrom(seed).sort());

      if (survivors.length === 1) {
        const v = verdictOf(cands);
        expect(v).toBe(seed === 'no-fault' ? 'exonerated' : 'localized');
      } else {
        // The honest tie: verdict stays open, and the engine has no
        // probe left to propose — it says so instead of guessing.
        expect(verdictOf(cands)).toBe('open');
        expect(nextProbe(cands)).toBeNull();
      }
    });
  }

  it('the x10 resistor is the known DC-voltage tie with no-fault', () => {
    expect(inseparableFrom('value-R1-x10').sort()).toEqual(['no-fault', 'value-R1-x10']);
  });
});
