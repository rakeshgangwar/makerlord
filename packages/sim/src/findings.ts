import type { Finding, Severity } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import type { Requirement } from '@makerlord/project';
import { capFinding } from './provenance.js';
import type { Trace } from './parse.js';
import { cornerFrequency, traceMin } from './parse.js';

/** Device dissipation vs package rating, from `.op` per-device power. */
export function checkDissipation(
  powerByRef: Map<string, number>,
  profileByRef: Map<string, SafetyProfile>,
  ceiling: Severity,
): Finding[] {
  const out: Finding[] = [];
  for (const [ref, watts] of powerByRef) {
    const rating = profileByRef.get(ref)?.powerRatingW;
    if (rating === undefined || watts <= rating) continue;
    out.push(
      capFinding(
        {
          ruleId: 'SIM_POWER_DISSIPATION',
          severity: 'BLOCKER',
          message:
            `${ref} dissipates ${watts.toFixed(3)} W in the operating point, ` +
            `above its ${rating} W rating.`,
          affected: { parts: [ref] },
          suggestedFix: 'Raise the resistance, lower the rail, or fit a bigger package.',
        },
        ceiling,
      ),
    );
  }
  return out;
}

/** A node voltage beyond a part's absolute maximum. */
export function checkAbsMax(
  voltageByRef: Map<string, number>,
  profileByRef: Map<string, SafetyProfile>,
  ceiling: Severity,
): Finding[] {
  const out: Finding[] = [];
  for (const [ref, volts] of voltageByRef) {
    const limit = profileByRef.get(ref)?.absMaxVoltageV;
    if (limit === undefined || volts <= limit) continue;
    out.push(
      capFinding(
        {
          ruleId: 'SIM_ABSMAX_EXCEEDED',
          severity: 'BLOCKER',
          message:
            `${ref} sees ${volts.toFixed(2)} V, beyond its absolute maximum ` +
            `of ${limit} V.`,
          affected: { parts: [ref] },
        },
        ceiling,
      ),
    );
  }
  return out;
}

/**
 * The failure a static power budget cannot see: a rail dipping below a
 * part's minimum operating voltage at any point in the window.
 */
export function checkRailSag(
  railTrace: Trace,
  minimumV: number,
  railName: string,
  ceiling: Severity,
): Finding[] {
  const lowest = traceMin(railTrace);
  if (lowest >= minimumV) return [];
  return [
    capFinding(
      {
        ruleId: 'SIM_RAIL_SAG',
        severity: 'BLOCKER',
        message:
          `Rail "${railName}" sags to ${lowest.toFixed(2)} V during the ` +
          `transient window, below the ${minimumV} V minimum.`,
        affected: { nets: [railName] },
        suggestedFix:
          'Add bulk capacitance at the load, thicken the supply path, or ' +
          'stagger the load step.',
      },
      ceiling,
    ),
  ];
}

/** Measured −3 dB corner against a numeric requirement's bounds. */
export function checkCorner(
  acTrace: Trace,
  requirement: Requirement,
  ceiling: Severity,
): { finding: Finding | null; measured: number | undefined } {
  const measured = cornerFrequency(acTrace);
  if (measured === undefined) return { finding: null, measured };
  const ok =
    requirement.comparator === '<=' ? measured <= requirement.value
    : requirement.comparator === '>=' ? measured >= requirement.value
    : requirement.comparator === '=='
      ? Math.abs(measured - requirement.value) / requirement.value < 0.05
      : measured >= requirement.value && measured <= (requirement.max ?? Infinity);
  if (ok) return { finding: null, measured };
  return {
    measured,
    finding: capFinding(
      {
        ruleId: 'SIM_AC_CORNER_MISMATCH',
        severity: 'BLOCKER',
        message:
          `Measured corner frequency ${measured.toFixed(1)} Hz misses the ` +
          `requirement "${requirement.statement}" ` +
          `(${requirement.comparator} ${requirement.value} ${requirement.unit}).`,
        affected: { parts: [requirement.id] },
      },
      ceiling,
    ),
  };
}

/** Never a finding about the circuit — about the simulation (spec §7). */
export function noConvergenceFinding(rungsTried: string[], detail: string): Finding {
  return {
    ruleId: 'SIM_NO_CONVERGENCE',
    severity: 'NOTE',
    message:
      'The simulation could not solve this circuit — that is a statement ' +
      `about our tool, not about your design. Rungs tried: ${rungsTried.join(' → ')}.`,
    affected: {},
    suggestedFix: detail,
  };
}
