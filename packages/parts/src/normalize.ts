import type { RawFzp } from './fzp/types.js';
import type { PartDefinition, PinRole } from './types.js';

const GND = /^(gnd|ground|vss|earth|agnd|dgnd)$/i;
const SUPPLY = /^(vcc|vdd|vin|v\+|\d+v\d*|\d+v|vbat|vbus|3v3|5v)$/i;
const IO = /^(d\d+|gpio\d+|a\d+|io\d+|p[a-d]\d+|s(cl|da|ck)|mosi|miso|tx|rx)$/i;
const PASSIVE = /^(anode|cathode|pin\s*\d+|leg\s*\d*|\d+|lead\s*\d*|[+-])$/i;

/** Pin roles are inferable from connector names: gnd appears 1989x in core. */
export function classifyPinRole(name: string): PinRole {
  const n = name.trim();
  if (GND.test(n)) return 'gnd';
  if (SUPPLY.test(n)) return 'supply';
  if (IO.test(n)) return 'io';
  if (PASSIVE.test(n)) return 'passive';
  return 'unknown';
}

const PREFIX: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3,
  k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

/**
 * Corpus values are free text: "0.030A", "0.25W", "4.7k".
 * Returns the value in base SI units, or undefined if unparseable.
 */
export function parseUnitValue(rawValue: string): number | undefined {
  const s = rawValue.trim();
  if (s.length === 0) return undefined;
  const m = /^([+-]?\d*\.?\d+)\s*([a-zA-Zµ]?)/.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const suffix = m[2] ?? '';
  // A trailing unit letter (A, W, V, F, Ω) is not a multiplier.
  const mult = PREFIX[suffix];
  return mult === undefined ? n : n * mult;
}

export function normalize(raw: RawFzp): PartDefinition {
  if (raw.moduleId.length === 0) {
    throw new Error('normalize: part is missing a moduleId');
  }
  return {
    id: raw.moduleId,
    title: raw.title,
    family: raw.properties.family ?? 'unknown',
    properties: raw.properties,
    pins: raw.connectors.map((c) => ({
      id: c.id,
      name: c.name,
      role: classifyPinRole(c.name),
    })),
    buses: raw.buses,
    views: raw.views,
  };
}
