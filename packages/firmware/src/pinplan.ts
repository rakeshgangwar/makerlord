import type { Circuit } from '@makerlord/circuit';
import type { SafetyProfile } from '@makerlord/parts';
import type { Behavior, Role, RoleMode } from '@makerlord/project';

/**
 * Roles are DERIVED, never authored (spec §2). Every intent net joining a
 * gpio pin of the MCU to another part's pin yields a role candidate named
 * from the block it serves. Modes come from the behaviors referencing the
 * role: sample → ANALOG_IN (strictly — a non-analog pin then FAILS the
 * capability rule rather than silently degrading), drive/threshold.drive
 * → OUTPUT, unreferenced → INPUT. The maker renames roles; `mcuPin` comes
 * only from here — no tool sets it (D46).
 */

export interface PinPlan {
  roles: Role[];
  /** Behaviors naming a role no wiring supports (RULE_FW_ROLE_UNBOUND). */
  unbound: { behaviorId: string; role: string }[];
}

function upperSnake(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

/** The single MCU: exactly one part whose profile carries an fqbn. */
export function findMcu(
  circuit: Circuit,
  profiles: ReadonlyMap<string, SafetyProfile>,
): { ref: string; profile: SafetyProfile } {
  const mcus = circuit.parts.filter((p) => profiles.get(p.defId)?.fqbn !== undefined);
  if (mcus.length === 0) {
    throw new Error('pin plan: no MCU in the circuit (no part with a curated fqbn)');
  }
  if (mcus.length > 1) {
    throw new Error(
      `pin plan: ${mcus.length} MCUs (${mcus.map((m) => m.ref).join(', ')}) — one target only`,
    );
  }
  const mcu = mcus[0]!;
  return { ref: mcu.ref, profile: profiles.get(mcu.defId)! };
}

export function derivePinPlan(
  circuit: Circuit,
  profiles: ReadonlyMap<string, SafetyProfile>,
  behaviors: Behavior[],
  previousRoles: Role[] = [],
): PinPlan {
  const mcu = findMcu(circuit, profiles);
  const gpio = mcu.profile.gpio ?? {};

  // Mode wanted per role name, from the behaviors that reference it.
  const wanted = new Map<string, RoleMode>();
  for (const b of behaviors) {
    if (b.kind === 'sample') wanted.set(b.role, 'ANALOG_IN');
    if (b.kind === 'drive') wanted.set(b.role, 'OUTPUT');
    if (b.kind === 'threshold') wanted.set(b.drive, 'OUTPUT');
  }

  // Prior names survive re-derivation, keyed by the served (ref, pin).
  const priorName = new Map(previousRoles.map((r) => [`${r.ref}::${r.pin}`, r.role]));

  const roles: Role[] = [];
  const taken = new Set<string>();
  for (const net of circuit.intent) {
    const mcuPins = net.members.filter((m) => m.ref === mcu.ref && m.pin in gpio);
    const others = net.members.filter((m) => m.ref !== mcu.ref);
    for (const mcuPin of mcuPins) {
      for (const served of others) {
        const part = circuit.parts.find((p) => p.ref === served.ref);
        const base = upperSnake(priorName.get(`${served.ref}::${served.pin}`)
          ?? part?.blockId ?? served.ref);
        let name = base;
        for (let n = 2; taken.has(name); n += 1) name = `${base}_${n}`;
        taken.add(name);
        roles.push({
          role: name,
          ref: served.ref,
          pin: served.pin,
          mcuPin: mcuPin.pin,
          mode: wanted.get(name) ?? 'INPUT',
        });
      }
    }
  }

  const known = new Set(roles.map((r) => r.role));
  const unbound: PinPlan['unbound'] = [];
  for (const b of behaviors) {
    const refs = b.kind === 'sample' || b.kind === 'drive' ? [b.role]
      : b.kind === 'threshold' ? [b.drive]
      : [];
    for (const role of refs) {
      if (!known.has(role)) unbound.push({ behaviorId: b.id, role });
    }
  }
  return { roles, unbound };
}
