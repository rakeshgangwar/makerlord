import { z } from 'zod';
import type { Decision } from '@makerlord/project';
import type { ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import { ok } from '../result.js';

const decisionRecord: ToolDef = {
  name: 'decision_record',
  summary:
    'Call this the moment a choice is settled that someone might later ' +
    'relitigate — a part picked over another, a requirement relaxed, a ' +
    'topology changed. Record what was chosen AND the alternatives rejected ' +
    'with why: the rejected options are the most valuable part (D29). Do ' +
    'not use it for routine tool activity; git already records that.',
  input: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    decision: z.string().min(1),
    rejected: z
      .array(z.object({ option: z.string().min(1), reason: z.string().min(1) }))
      .min(1),
    consequence: z.string().optional(),
    stage: z.number().int().min(1).max(17).optional(),
  }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const record = input as Omit<Decision, 'date'>;
    const history = (s.file.project.history ??= []);
    if (history.some((d) => d.id === record.id)) {
      throw new Error(
        `decision_record: "${record.id}" already recorded — decisions are ` +
          'append-only; record a NEW decision that supersedes it instead',
      );
    }
    history.push({ ...record, date: new Date().toISOString().slice(0, 10) });
    return ok({ decisions: history.length });
  },
};

export const HISTORY_TOOLS: ToolDef[] = [decisionRecord];
