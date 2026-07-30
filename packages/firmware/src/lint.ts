import type { Finding } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import type { Role } from '@makerlord/project';

/**
 * D46 enforcement: the application region names roles, never pins. A
 * vocabulary table + pin-position call sites over ONE bounded region —
 * deliberately not a C++ parser (spec §11, rejected alternative). Three
 * nets catch the drift:
 *   1. board pin names (from the profile footprint) used as identifiers
 *   2. GPIO<n> vocabulary anywhere
 *   3. bare integers in the pin position of the Arduino pin API
 */

const PIN_CALLS = [
  'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite',
  'attachInterrupt', 'digitalPinToInterrupt', 'analogReference', 'tone', 'noTone',
];

function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

export function lintApplicationRegion(
  code: string,
  profile: SafetyProfile,
  roles: Role[] = [],
): Finding[] {
  const findings: Finding[] = [];
  const clean = stripCommentsAndStrings(code);
  const roleFor = new Map(roles.map((r) => [r.mcuPin, r.role]));

  const flag = (literal: string, why: string): void => {
    const bound = roleFor.get(literal);
    findings.push({
      ruleId: 'RULE_FW_RAW_PIN_LITERAL',
      severity: 'BLOCKER',
      message: `application code names pin "${literal}" directly (${why}) — ` +
        'code and circuit drift apart the moment the wiring changes',
      affected: { parts: [profile.partId] },
      suggestedFix: bound
        ? `use the role symbol ${bound} from pins.h instead of ${literal}`
        : 'reference pins only through the role symbols in pins.h; if no ' +
          'role covers this pin, wire the part and re-derive the pin plan',
    });
  };

  // 1 + 2: pin-name / GPIO<n> vocabulary used as an identifier anywhere.
  const vocabulary = new Set(Object.keys(profile.footprint.pins));
  const identifiers = clean.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g);
  const seen = new Set<string>();
  for (const m of identifiers) {
    const word = m[0];
    if (seen.has(word)) continue;
    if (vocabulary.has(word)) {
      seen.add(word);
      flag(word, 'board pin name');
    } else if (/^GPIO\d+$/.test(word)) {
      seen.add(word);
      flag(word, 'chip GPIO number');
    }
  }

  // 3: a bare integer where the Arduino API expects a pin.
  const callRe = new RegExp(`\\b(${PIN_CALLS.join('|')})\\s*\\(\\s*(\\d+)\\b`, 'g');
  for (const m of clean.matchAll(callRe)) {
    flag(m[2]!, `bare number in ${m[1]!}()`);
  }

  return findings;
}
