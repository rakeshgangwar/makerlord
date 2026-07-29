/**
 * The convergence retry ladder (spec §7), applied automatically and recorded
 * in the report. A result obtained at a relaxed rung is a WEAKER claim than
 * one found at default, and is reported with the options that produced it.
 */
export interface LadderRung {
  name: string;
  options: string[];
  /** True when a solution here weakens the claim (relaxed tolerances). */
  weakensClaim: boolean;
}

export const CONVERGENCE_LADDER: readonly LadderRung[] = [
  { name: 'default', options: [], weakensClaim: false },
  {
    name: 'gmin stepping',
    options: ['.options gmin=1e-10 gminsteps=200'],
    weakensClaim: false,
  },
  {
    name: 'source stepping',
    options: ['.options srcsteps=200'],
    weakensClaim: false,
  },
  {
    name: 'relaxed tolerances',
    options: ['.options reltol=1e-2 abstol=1e-10'],
    weakensClaim: true,
  },
  {
    name: 'gear integration',
    options: ['.options method=gear'],
    weakensClaim: true,
  },
];

export interface LadderOutcome<T> {
  result?: T;
  rung?: LadderRung;
  rungsTried: string[];
  converged: boolean;
}

/** Try each rung until one converges; record everything tried. */
export async function climbLadder<T>(
  attempt: (rung: LadderRung) => Promise<T | null>,
): Promise<LadderOutcome<T>> {
  const rungsTried: string[] = [];
  for (const rung of CONVERGENCE_LADDER) {
    rungsTried.push(rung.name);
    const result = await attempt(rung);
    if (result !== null) {
      return { result, rung, rungsTried, converged: true };
    }
  }
  return { rungsTried, converged: false };
}
