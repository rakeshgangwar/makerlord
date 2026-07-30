import type {
  Behavior, Firmware, SampleBehavior, ThresholdBehavior,
} from '@makerlord/project';

/**
 * The scaffold is engine-owned codegen from the CLOSED behavior set —
 * deterministic, golden-file tested, no LLM. The agent gets exactly one
 * marked region; everything else regenerates with the model, and
 * extraction/merge keeps that region intact across regenerations.
 */

export const REGION_START = '  // ── application logic (agent-authored) ──';
export const REGION_END = '  // ── end application logic ──';

const cIdent = (id: string): string => id.replace(/[^A-Za-z0-9]+/g, '_');

function sampleReadCall(fw: Firmware, b: SampleBehavior): string {
  const role = fw.roles.find((r) => r.role === b.role);
  return role?.mode === 'ANALOG_IN'
    ? `analogRead(${b.role})`
    : `digitalRead(${b.role})`;
}

function thresholdCondition(t: ThresholdBehavior, valueVar: string): string {
  const parts: string[] = [];
  if (t.above !== undefined) parts.push(`${valueVar} > ${t.above}`);
  if (t.below !== undefined) parts.push(`${valueVar} < ${t.below}`);
  return parts.join(' || ');
}

function thresholdComment(t: ThresholdBehavior): string {
  const bound = [
    ...(t.above !== undefined ? [`above ${t.above}`] : []),
    ...(t.below !== undefined ? [`below ${t.below}`] : []),
  ].join(' or ');
  return `${t.drive} ${t.to} when ${bound}`;
}

export function renderMainCpp(fw: Firmware): string {
  const samples = fw.behaviors.filter((b): b is SampleBehavior => b.kind === 'sample');
  const dependents = (id: string): Behavior[] =>
    fw.behaviors.filter((b) =>
      (b.kind === 'threshold' || b.kind === 'serial_log') && b.watch === id);

  // A threshold/serial_log must watch a SAMPLE — anything else has no
  // value variable to read.
  for (const b of fw.behaviors) {
    if ((b.kind === 'threshold' || b.kind === 'serial_log')
      && !samples.some((s) => s.id === b.watch)) {
      throw new Error(
        `scaffold: behavior "${b.id}" watches "${b.watch}", which is not a sample`,
      );
    }
  }

  const state = samples.flatMap((s) => [
    `// sample state — behavior "${s.id}"`,
    `unsigned long last_${cIdent(s.id)} = 0;`,
    `int value_${cIdent(s.id)} = 0;`,
  ]);

  const selftests = [...fw.roles]
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((r) => `  Serial.println("SELFTEST role=${r.role} mode=${r.mode} ok");`);

  const drives = fw.behaviors
    .filter((b) => b.kind === 'drive')
    .map((b) => `  digitalWrite(${b.role}, ${b.to});  // behavior "${b.id}"`);

  const loops = samples.flatMap((s) => {
    const v = `value_${cIdent(s.id)}`;
    const t = `last_${cIdent(s.id)}`;
    const inner = dependents(s.id).flatMap((d) => {
      if (d.kind === 'threshold') {
        return [
          `    // behavior "${d.id}": ${thresholdComment(d)}`,
          `    digitalWrite(${d.drive}, (${thresholdCondition(d, v)}) ? ${d.to} : ${d.to === 'HIGH' ? 'LOW' : 'HIGH'});`,
        ];
      }
      return [
        `    // behavior "${d.id}"`,
        `    Serial.print("LOG ${s.id}=");`,
        `    Serial.println(${v});`,
      ];
    });
    return [
      `  // behavior "${s.id}": sample ${s.role} every ${s.everyMs} ms`,
      `  if (millis() - ${t} >= ${s.everyMs}) {`,
      `    ${t} = millis();`,
      `    ${v} = ${sampleReadCall(fw, s)};`,
      ...inner,
      '  }',
      '',
    ];
  });

  return [
    '// main.cpp — engine scaffold; regenerated with the model. ONLY the',
    '// marked application region below is yours to edit.',
    '#include <Arduino.h>',
    '#include "pins.h"',
    '',
    ...state,
    '',
    'void setup() {',
    '  Serial.begin(115200);',
    '  setup_pins();',
    ...selftests,
    ...drives,
    '}',
    '',
    'void loop() {',
    ...loops,
    REGION_START,
    REGION_END,
    '}',
    '',
  ].join('\n');
}

function markerSpans(code: string): { start: number; end: number } {
  const starts = [...code.matchAll(new RegExp(escapeRe(REGION_START), 'g'))];
  const ends = [...code.matchAll(new RegExp(escapeRe(REGION_END), 'g'))];
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error(
      'scaffold: the application-region markers must appear exactly once — ' +
      'they were moved, removed or duplicated',
    );
  }
  const start = starts[0]!.index + REGION_START.length;
  const end = ends[0]!.index;
  if (end < start) throw new Error('scaffold: region markers are out of order');
  return { start, end };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The agent's code, exactly as it sits between the markers. */
export function extractApplicationRegion(code: string): string {
  const { start, end } = markerSpans(code);
  return code.slice(start, end).replace(/^\n/, '').replace(/\n\s*$/, '');
}

/** A regenerated scaffold with the agent's region put back verbatim. */
export function mergeApplicationRegion(scaffold: string, region: string): string {
  const { start, end } = markerSpans(scaffold);
  const body = region.length > 0 ? `\n${region}\n` : '\n';
  return scaffold.slice(0, start) + body + scaffold.slice(end);
}
