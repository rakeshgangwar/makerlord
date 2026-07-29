import type { Requirement } from '@makerlord/project';

/**
 * Simulation is the first stage that can automatically discharge a
 * requirement (spec §6). The last row of the table matters as much as the
 * others: NOT-SIMULABLE is said out loud, never silently passed or skipped.
 */
export type SimAnalysis = 'op' | 'tran' | 'ac';

const METRIC_TO_ANALYSIS: Record<string, SimAnalysis> = {
  corner_frequency: 'ac',
  bandwidth: 'ac',
  gain: 'ac',
  rail_voltage: 'tran',
  ripple: 'tran',
  startup_time: 'tran',
  quiescent_current: 'op',
  device_dissipation: 'op',
};

export interface DischargePlan {
  requirement: Requirement;
  analysis: SimAnalysis | 'not-simulable';
}

export function dischargePlan(requirements: Requirement[]): DischargePlan[] {
  return requirements.map((requirement) => ({
    requirement,
    analysis: METRIC_TO_ANALYSIS[requirement.metric] ?? 'not-simulable',
  }));
}

export interface RequirementVerdict {
  requirementId: string;
  verdict: 'pass' | 'fail' | 'not-simulable' | 'no-result';
  measured?: number;
  runId?: string;
  detail: string;
}

export function notSimulable(requirement: Requirement): RequirementVerdict {
  return {
    requirementId: requirement.id,
    verdict: 'not-simulable',
    detail:
      `"${requirement.statement}" cannot be checked by simulation — carry it ` +
      'to the stage that can measure it. An unchecked requirement is a known ' +
      'gap; a silently unchecked one is a false sense of coverage.',
  };
}
