import type { FaultCandidate } from '@makerlord/project';
import { contradicts } from './prune.js';

/**
 * The guided binary search (spec §5). For each measurable net, partition
 * the live candidates into band-overlap groups — candidates whose
 * predictions a single reading could not tell apart. The proposed net is
 * the one whose LARGEST group is smallest (greedy worst-case split),
 * ties broken by net name so the sequence is reproducible. The proposal
 * carries {net, why} and never predictions: D15, structurally.
 */

function groupsOn(candidates: FaultCandidate[], net: string): FaultCandidate[][] {
  const groups: { value: number; members: FaultCandidate[] }[] = [];
  for (const c of candidates) {
    const v = c.signature.netVoltages[net];
    if (v === undefined) continue;
    const home = groups.find((g) => !contradicts(g.value, v) || !contradicts(v, g.value));
    if (home) home.members.push(c);
    else groups.push({ value: v, members: [c] });
  }
  return groups.map((g) => g.members);
}

export function nextProbe(
  candidates: FaultCandidate[],
): { net: string; why: string } | null {
  const live = candidates.filter((c) => c.status === 'live');
  if (live.length < 2) return null;

  const nets = [...new Set(live.flatMap((c) => Object.keys(c.signature.netVoltages)))]
    .sort((a, b) => a.localeCompare(b));

  let best: { net: string; worst: number; groups: FaultCandidate[][] } | null = null;
  for (const net of nets) {
    const groups = groupsOn(live, net);
    if (groups.length < 2) continue;   // everyone agrees — useless probe
    const worst = Math.max(...groups.map((g) => g.length));
    if (best === null || worst < best.worst) best = { net, worst, groups };
  }
  if (best === null) return null;

  const named = best.groups.map((g) => {
    const v = g[0]!.signature.netVoltages[best!.net]!;
    return `${g.map((c) => c.id).join('/')} (~${v.toFixed(1)} V)`;
  });
  return {
    net: best.net,
    why: `a reading at ${best.net} separates ${named.join(' from ')}`,
  };
}
