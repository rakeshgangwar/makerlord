import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Finding, Severity } from '@makerlord/circuit';
import type { Project } from '../model.js';
import { isMeasurable } from './schema.js';

export interface ProjectContext {
  readonly project: Project;
  readonly defs: ReadonlyMap<string, PartDefinition>;
  readonly profiles: ReadonlyMap<string, SafetyProfile>;
}

export interface ProjectRule {
  readonly id: string;
  readonly severity: Severity;
  check(ctx: ProjectContext): Finding[];
}

export function makeProjectContext(
  project: Project,
  defs: ReadonlyMap<string, PartDefinition>,
  profiles: ReadonlyMap<string, SafetyProfile>,
): ProjectContext {
  return { project, defs, profiles };
}

const notMeasurable: ProjectRule = {
  id: 'REQ_NOT_MEASURABLE',
  severity: 'BLOCKER',
  check(ctx) {
    return ctx.project.requirements
      .filter((r) => !isMeasurable(r) && r.consumedBy.length > 0)
      .map((r) => ({
        ruleId: 'REQ_NOT_MEASURABLE',
        severity: 'BLOCKER' as const,
        message:
          `Requirement "${r.id}" is not measurable — it needs a value, a unit ` +
          'and a comparator before anything downstream can check it.',
        affected: { parts: [r.id] },
        suggestedFix: `Ask what "${r.statement}" means as a number with units.`,
      }));
  },
};

const orphan: ProjectRule = {
  id: 'REQ_ORPHAN',
  severity: 'WARNING',
  check(ctx) {
    return ctx.project.requirements
      .filter((r) => r.consumedBy.length === 0)
      .map((r) => ({
        ruleId: 'REQ_ORPHAN',
        severity: 'WARNING' as const,
        message:
          `Requirement "${r.id}" is read by nothing. Either it is redundant, ` +
          'or a check that should consume it does not exist yet.',
        affected: { parts: [r.id] },
        suggestedFix:
          'Name the check or test that will read this, or drop the requirement.',
      }));
  },
};

const assumedUnconfirmed: ProjectRule = {
  id: 'REQ_ASSUMED_UNCONFIRMED',
  severity: 'NOTE',
  check(ctx) {
    return ctx.project.requirements
      .filter((r) => r.provenance === 'assumed')
      .map((r) => ({
        ruleId: 'REQ_ASSUMED_UNCONFIRMED',
        severity: 'NOTE' as const,
        message:
          `"${r.statement}" was assumed, not stated. Confirm it before it ` +
          'feeds a decision you cannot cheaply reverse.',
        affected: { parts: [r.id] },
      }));
  },
};

export const REQUIREMENT_RULES: readonly ProjectRule[] = [
  notMeasurable,
  orphan,
  assumedUnconfirmed,
];

export const SEVERITY_ORDER: Record<Severity, number> = {
  REFUSE: 0, BLOCKER: 1, WARNING: 2, NOTE: 3,
};

export function checkRequirements(ctx: ProjectContext): Finding[] {
  return REQUIREMENT_RULES.flatMap((r) => r.check(ctx)).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
