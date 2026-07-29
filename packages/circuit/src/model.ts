export interface PinRef {
  ref: string;
  pin: string;
}

export type Orientation = 0 | 90 | 180 | 270;

export interface Placement {
  originHole: string;
  orientation: Orientation;
}

export interface PartInstance {
  ref: string;
  defId: string;
  placement?: Placement;
}

export interface Wire {
  id: string;
  from: string;
  to: string;
  color: string;
}

export interface IntentNet {
  name: string;
  members: PinRef[];
}

/**
 * Mains safety valve (docs/decisions.md D32). Opening a tier ADDS rules; it
 * never removes them. Slice 1 is breadboard-only, where mains is refused at
 * every tier — the tiers matter once PCB work lands in Phase 3.
 */
export type MainsTier = 'none' | 'A' | 'B' | 'C';

export interface Circuit {
  boardId: string;
  parts: PartInstance[];
  wires: Wire[];
  intent: IntentNet[];
  /** Defaults to 'none' when absent. */
  mainsTier?: MainsTier;
}

export function pinKey(p: PinRef): string {
  return `${p.ref}.${p.pin}`;
}
