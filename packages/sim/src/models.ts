import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Finding } from '@makerlord/circuit';
import type { ModelProvenance } from './provenance.js';

export interface DeviceModel {
  ref: string;
  partId: string;
  /** SPICE element line(s), nodes substituted later by the netlist stage. */
  kind: 'resistor' | 'diode' | 'mcu-stub' | 'stub';
  provenance: ModelProvenance;
  /** Model card or .include line, if the device needs one. */
  card?: string;
  params: Record<string, number>;
}

export function spiceModelsDir(): string {
  return resolve(process.env.MAKERLORD_SPICE_PATH ?? './data/spice');
}

/** A hand-curated manufacturer model, checked in — the verified case. */
export function curatedModelPath(partId: string): string | undefined {
  const path = join(spiceModelsDir(), `${partId}.lib`);
  return existsSync(path) ? path : undefined;
}

export function curatedModelCard(partId: string): string | undefined {
  const path = curatedModelPath(partId);
  return path ? readFileSync(path, 'utf8').trim() : undefined;
}

/**
 * Project one part into a device model with its provenance (spec §3):
 * curated .lib → verified; profile-derived parameters → computed;
 * MCU → behavioural stub (assumed); nothing → stub + SIM_MODEL_MISSING.
 */
export function deviceModel(
  ref: string,
  def: PartDefinition | undefined,
  profile: SafetyProfile | undefined,
): { model: DeviceModel; finding?: Finding } {
  const partId = def?.id ?? 'unknown';

  const curated = curatedModelCard(partId);
  if (curated !== undefined) {
    return {
      model: {
        ref, partId, kind: 'diode', provenance: 'verified',
        card: curated, params: {},
      },
    };
  }

  if (profile?.resistanceOhms !== undefined) {
    return {
      model: {
        ref, partId, kind: 'resistor', provenance: 'computed',
        params: { ohms: profile.resistanceOhms },
      },
    };
  }

  if (profile?.forwardVoltageV !== undefined) {
    // Diode derived from curated datasheet parameters: choose N so the diode
    // drops Vf at its rated current — N = Vf / (Vt · ln(If/Is)).
    const IS = 1e-20;
    const VT = 0.02585;
    const ratedA = (profile.maxCurrentMa ?? 20) / 1000;
    const n = profile.forwardVoltageV / (VT * Math.log(ratedA / IS));
    return {
      model: {
        ref, partId, kind: 'diode', provenance: 'computed',
        card: `.model D_${ref} D(Is=1e-20 N=${n.toFixed(3)})`,
        params: { vf: profile.forwardVoltageV },
      },
    };
  }

  if (profile?.pinMaxMa !== undefined) {
    // The MCU boundary (spec §3): a supply-current sink with declared draw.
    return {
      model: {
        ref, partId, kind: 'mcu-stub', provenance: 'assumed',
        params: { activeMa: profile.quiescentMa ?? 50 },
      },
    };
  }

  return {
    model: { ref, partId, kind: 'stub', provenance: 'assumed', params: {} },
    finding: {
      ruleId: 'SIM_MODEL_MISSING',
      severity: 'NOTE',
      message:
        `${ref} (${partId}) has no SPICE model — it was stubbed out of the ` +
        'analysis. Results involving it are indicative only.',
      affected: { parts: [ref] },
      suggestedFix:
        `Curate a model at data/spice/${partId}.lib to upgrade every check ` +
        'that depends on this part.',
    },
  };
}
