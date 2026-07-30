/**
 * The firmware facet (firmware spec §2). Behaviors are the maker's
 * vocabulary — a CLOSED set: a kind the engine knows is a kind it can
 * scaffold, cross-check and test deterministically. Roles are DERIVED
 * from the netlist, never authored; no tool sets `mcuPin` (D46, the
 * D3/D4 absence-of-tool pattern).
 */

export interface SampleBehavior {
  id: string;
  kind: 'sample';
  /** The role read (ANALOG_IN or INPUT). */
  role: string;
  everyMs: number;
}

export interface ThresholdBehavior {
  id: string;
  kind: 'threshold';
  /** The sample behavior watched, by id. */
  watch: string;
  above?: number;
  below?: number;
  /** The role driven when the bound crosses. */
  drive: string;
  to: 'HIGH' | 'LOW';
}

export interface DriveBehavior {
  id: string;
  kind: 'drive';
  role: string;
  to: 'HIGH' | 'LOW';
}

export interface SerialLogBehavior {
  id: string;
  kind: 'serial_log';
  /** The sample behavior logged, by id. */
  watch: string;
}

export type Behavior =
  | SampleBehavior
  | ThresholdBehavior
  | DriveBehavior
  | SerialLogBehavior;

export type RoleMode = 'ANALOG_IN' | 'INPUT' | 'OUTPUT';

/** One row of the derived pin plan. `mcuPin` comes only from derivation. */
export interface Role {
  role: string;
  /** The served part and its pin, from the netlist. */
  ref: string;
  pin: string;
  mcuPin: string;
  mode: RoleMode;
}

export interface Firmware {
  /** Which circuit part is the MCU. */
  target: { ref: string };
  behaviors: Behavior[];
  roles: Role[];
}
