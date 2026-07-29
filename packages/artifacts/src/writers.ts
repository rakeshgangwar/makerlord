import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Session } from '@makerlord/tools';
import {
  board, bundle, circuitRuleContext, defsMap, profilesMap,
} from '@makerlord/tools';
import { buildSequence, deriveNetlist } from '@makerlord/circuit';
import type { Footprint } from '@makerlord/parts';
import { renderBlockDiagram } from './renderers/blocks.js';
import { renderBreadboard } from './renderers/breadboard.js';
import { renderSchematic } from './renderers/schematic.js';

/**
 * The maker's real output is files, and they should own them
 * (user-journey.md §1). Everything below circuit/ is a projection of
 * project.json — D2 paying out across the arc. Writers are deterministic;
 * unavailable stages simply don't write their files yet.
 */
function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`);
}

export function writeFeasibilityMd(dir: string, session: Session): boolean {
  const f = session.file.project.feasibility;
  if (!f) return false;
  const lines = [
    '# Feasibility',
    '',
    `**Verdict: ${f.verdict}**`,
    '',
    '## Claims',
    '',
    ...f.claims.map((c) => {
      const evidence =
        c.evidence && 'url' in c.evidence
          ? ` — [source](${c.evidence.url}) (fetched ${c.evidence.fetchedAt})`
          : c.evidence && 'toolCall' in c.evidence
            ? ` — verified via \`${c.evidence.toolCall}\``
            : '';
      return `- **${c.grade}**: ${c.claim}${evidence}`;
    }),
  ];
  if (f.priorArt.length > 0) {
    lines.push('', '## Prior art', '');
    lines.push(...f.priorArt.map((p) => `- [${p.title}](${p.url}) — parts: ${p.parts.join(', ')}`));
  }
  if (f.roughCost) {
    lines.push('', `Rough cost: **${f.roughCost.value} ${f.roughCost.currency}** (${f.roughCost.grade})`);
  }
  write(join(dir, 'feasibility.md'), lines.join('\n'));
  return true;
}

export function writeRequirementsMd(dir: string, session: Session): boolean {
  const reqs = session.file.project.requirements;
  if (reqs.length === 0) return false;
  const lines = [
    '# Requirements',
    '',
    'Numeric and testable — each is consumed by a named check (D30).',
    '',
    '| id | metric | target | unit | consumed by | provenance |',
    '|---|---|---|---|---|---|',
    ...reqs.map((r) => {
      const target =
        r.comparator === 'range' ? `${r.value}–${r.max ?? '∞'}` : `${r.comparator} ${r.value}`;
      return `| ${r.id} | \`${r.metric}\` | ${target} | ${r.unit} | ${r.consumedBy.join(', ')} | ${r.provenance} |`;
    }),
    '',
    ...reqs.map((r) => `- **${r.id}** — ${r.statement}`),
  ];
  write(join(dir, 'requirements.md'), lines.join('\n'));
  return true;
}

export function writeArchitectureMd(dir: string, session: Session): boolean {
  const arch = session.file.project.architecture;
  if (arch.blocks.length === 0) return false;
  const lines = [
    '# Architecture',
    '',
    '## Blocks',
    '',
    '| block | sourcing | interfaces |',
    '|---|---|---|',
    ...arch.blocks.map((b) => {
      const sourcing =
        b.sourcing.type === 'buy' ? `buy: \`${b.sourcing.partId}\``
        : b.sourcing.type === 'build' ? `build: ${b.sourcing.partIds.map((p) => `\`${p}\``).join(', ')}`
        : '**undecided**';
      const ifaces = b.interfaces
        .map((i) => `${i.id} (${i.kind} ${i.direction}${i.voltageV ? `, ${i.voltageV} V` : ''})`)
        .join('; ');
      return `| **${b.name}** (\`${b.id}\`) | ${sourcing} | ${ifaces} |`;
    }),
    '',
    '## Links',
    '',
    ...arch.links.map(
      (l) => `- \`${l.from.blockId}.${l.from.interfaceId}\` → \`${l.to.blockId}.${l.to.interfaceId}\``,
    ),
  ];
  write(join(dir, 'architecture.md'), lines.join('\n'));
  return true;
}

export function writeCircuitDir(dir: string, session: Session): boolean {
  const circuit = session.file.project.circuit;
  if (!circuit) return false;

  const footprints = new Map<string, Footprint>();
  for (const part of circuit.parts) {
    const profile = bundle().profiles[part.defId];
    if (profile) footprints.set(part.defId, profile.footprint);
  }
  const nets = deriveNetlist(board(), circuit, footprints);
  write(
    join(dir, 'circuit', 'netlist.json'),
    JSON.stringify({ intent: circuit.intent, derived: nets }, null, 2),
  );

  write(join(dir, 'circuit', 'schematic.svg'), renderSchematic(circuit, defsMap()));
  write(
    join(dir, 'circuit', 'breadboard.svg'),
    renderBreadboard(board(), circuit, footprints),
  );

  const steps = buildSequence(circuitRuleContext(session));
  const md = [
    '# Build steps',
    '',
    'Power goes on last: every mistake before that point is made on a dead board.',
    '',
    ...steps.map((s) => {
      const gate =
        s.measurement === undefined
          ? ''
          : `\n   - **Measure:** ${s.measurement.prompt} _(expected: ${s.measurement.expected})_`;
      return `${s.index + 1}. **[${s.kind.replace(/_/g, ' ')}]** ${s.instruction}${gate}`;
    }),
  ];
  write(join(dir, 'circuit', 'build-steps.md'), md.join('\n'));
  return true;
}

export function writeArchitectureSvg(dir: string, session: Session): boolean {
  const arch = session.file.project.architecture;
  if (arch.blocks.length === 0) return false;
  write(
    join(dir, 'architecture.svg'),
    renderBlockDiagram(arch.blocks, arch.links),
  );
  return true;
}

/** Write every projection the current project state supports. */
export function writeAllArtifacts(session: Session): string[] {
  const dir = dirname(session.path);
  const written: string[] = [];
  if (writeFeasibilityMd(dir, session)) written.push('feasibility.md');
  if (writeRequirementsMd(dir, session)) written.push('requirements.md');
  if (writeArchitectureMd(dir, session)) written.push('architecture.md');
  if (writeArchitectureSvg(dir, session)) written.push('architecture.svg');
  if (writeCircuitDir(dir, session)) {
    written.push('circuit/netlist.json', 'circuit/schematic.svg', 'circuit/breadboard.svg', 'circuit/build-steps.md');
  }
  return written;
}
