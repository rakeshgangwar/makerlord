import type { Finding } from '@makerlord/circuit';

/**
 * A transient run needs to know what the circuit is DOING, and that is not
 * in the netlist (spec §5). Every stimulus carries provenance and rationale;
 * an assumed one caps the run at NOTE exactly as an idealised model would.
 */
export interface Stimulus {
  id: string;
  /** A net name, or a source reference. */
  target: string;
  kind: 'dc' | 'pulse' | 'pwl' | 'sine' | 'load_step';
  params: Record<string, number>;
  provenance: 'stated' | 'derived' | 'assumed';
  rationale: string;
}

/** Project one stimulus into a SPICE source line on nodes (nPlus, nMinus). */
export function stimulusLine(
  s: Stimulus,
  index: number,
  nPlus: string,
  nMinus = '0',
): string {
  const name = `V_${s.id}`.replace(/[^A-Za-z0-9_]/g, '_');
  switch (s.kind) {
    case 'dc':
      return `${name} ${nPlus} ${nMinus} DC ${s.params.volts ?? 0}`;
    case 'pulse': {
      const p = s.params;
      return (
        `${name} ${nPlus} ${nMinus} PULSE(${p.low ?? 0} ${p.high ?? 0} ` +
        `${p.delay ?? 0} ${p.rise ?? 1e-6} ${p.fall ?? 1e-6} ` +
        `${p.width ?? 1e-3} ${p.period ?? 2e-3})`
      );
    }
    case 'sine':
      return (
        `${name} ${nPlus} ${nMinus} SIN(${s.params.offset ?? 0} ` +
        `${s.params.amplitude ?? 1} ${s.params.freq ?? 1000}) AC 1`
      );
    case 'pwl': {
      const pairs = Object.entries(s.params)
        .filter(([k]) => k.startsWith('t'))
        .map(([k, t]) => `${t} ${s.params[`v${k.slice(1)}`] ?? 0}`)
        .join(' ');
      return `${name} ${nPlus} ${nMinus} PWL(${pairs})`;
    }
    case 'load_step': {
      // A current sink stepping between idle and active draw.
      const iname = `I_${s.id}`.replace(/[^A-Za-z0-9_]/g, '_');
      const p = s.params;
      return (
        `${iname} ${nPlus} ${nMinus} PULSE(${(p.idleMa ?? 0) / 1000} ` +
        `${(p.activeMa ?? 0) / 1000} ${p.delay ?? 1e-3} 1u 1u ` +
        `${p.duration ?? 5e-3} ${p.period ?? 1e-2})`
      );
    }
    default:
      throw new Error(`stimulus ${s.id}: unknown kind ${String(s.kind)} (${index})`);
  }
}

/** A NOTE listing every assumed stimulus with its rationale — the prompt to
 *  replace a guess with a number and watch the analysis get stronger. */
export function assumedStimulusFinding(stimuli: Stimulus[]): Finding | null {
  const assumed = stimuli.filter((s) => s.provenance === 'assumed');
  if (assumed.length === 0) return null;
  return {
    ruleId: 'SIM_STIMULUS_ASSUMED',
    severity: 'NOTE',
    message:
      'This run rests on assumed stimulus: ' +
      assumed.map((s) => `${s.id} (${s.rationale})`).join('; ') +
      '. Findings are capped at NOTE until these are stated or derived.',
    affected: {},
    suggestedFix:
      'State the real duty cycle, load or timing — or derive it from a ' +
      'requirement — and re-run.',
  };
}
