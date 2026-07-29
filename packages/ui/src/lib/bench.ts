import type { BuildStep } from '@makerlord/circuit';

/**
 * Bench mode (UI spec §8) and the measurement gate (§9): preflight, not
 * paperwork. Measurement entry takes a NUMBER, never a checkbox (D15), and
 * the predicted value is NOT shown until after entry — showing the
 * expectation first turns a measurement into a confirmation.
 */
export interface BenchState {
  steps: BuildStep[];
  currentIndex: number;
  /** Others are dimmed, not hidden — the maker needs to know there are more. */
  dimmedIndices: number[];
  wakeLockRequested: boolean;
}

export function benchState(steps: BuildStep[], currentIndex: number): BenchState {
  return {
    steps,
    currentIndex,
    dimmedIndices: steps.map((_, i) => i).filter((i) => i !== currentIndex),
    wakeLockRequested: true,   // a screen that sleeps mid-step is a betrayal
  };
}

export type GatePhase =
  | { phase: 'awaiting-entry'; prompt: string; unit: string; predictedVisible: false }
  | {
      phase: 'entered';
      entered: number;
      predicted: string;
      predictedVisible: true;
      verdict: 'consistent' | 'inconsistent';
    };

export class GateMachine {
  private state: GatePhase;

  constructor(
    private prompt: string,
    private unit: string,
    private predicted: string,
    private judge: (entered: number) => 'consistent' | 'inconsistent',
  ) {
    this.state = {
      phase: 'awaiting-entry', prompt, unit, predictedVisible: false,
    };
  }

  current(): GatePhase {
    return this.state;
  }

  /**
   * The only way forward is a number. There is no confirm(), no yes(), no
   * skip() — a measurement, or nothing.
   */
  enterMeasurement(value: number): GatePhase {
    if (!Number.isFinite(value)) {
      throw new Error('gate: a measurement must be a finite number');
    }
    this.state = {
      phase: 'entered',
      entered: value,
      predicted: this.predicted,
      predictedVisible: true,
      verdict: this.judge(value),
    };
    return this.state;
  }
}
