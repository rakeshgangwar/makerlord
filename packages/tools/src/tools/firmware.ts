import { join, relative } from 'node:path';
import { z } from 'zod';
import type { Finding } from '@makerlord/circuit';
import type { Firmware } from '@makerlord/project';
import { behaviorSchema } from '@makerlord/project';
import {
  checkFirmware as runFwRules, compileFirmware, derivePinPlan, findMcu,
  lintApplicationRegion, writeSketch, type FwRuleContext,
} from '@makerlord/firmware';
import { defsMap, profilesMap } from '../data.js';
import type { ToolCtx, ToolDef } from '../def.js';
import { requireSession } from '../def.js';
import type { Session } from '../session.js';
import { ok, refuse } from '../result.js';
import { refusalFor } from './gated.js';
import { circuitFindings } from './checks.js';

/**
 * The six firmware tools (spec §7). Roles are derived, never authored —
 * there is deliberately NO tool that sets a role's mcuPin (D46, the
 * D3/D4 absence pattern). fw_generate and fw_manifest are gated like
 * every state-changer; fw_manifest sits behind the power gate because
 * flashing IS powering (D47).
 */

function circuitOf(s: Session) {
  const c = s.file.project.circuit;
  if (!c) throw new Error('firmware: no circuit yet — expand or add parts first');
  return c;
}

/** The facet, created on first use with the MCU as target. */
function facetOf(s: Session): Firmware {
  const c = circuitOf(s);
  if (!s.file.project.firmware) {
    const mcu = findMcu(c, profilesMap());
    s.file.project.firmware = { target: { ref: mcu.ref }, behaviors: [], roles: [] };
  }
  return s.file.project.firmware;
}

function mcuProfile(s: Session) {
  const c = circuitOf(s);
  return findMcu(c, profilesMap()).profile;
}

/** Fresh derivation + rules + lint — the one place check logic lives. */
function fwFindings(s: Session, regionOverride?: string): Finding[] {
  const fw = facetOf(s);
  const c = circuitOf(s);
  const plan = derivePinPlan(c, profilesMap(), fw.behaviors, fw.roles);
  fw.roles = plan.roles;
  const ctx: FwRuleContext = {
    circuit: c,
    defs: defsMap(),
    profiles: profilesMap(),
    firmware: fw,
    unbound: plan.unbound,
  };
  const findings = runFwRules(ctx);
  const region = regionOverride ?? fw.applicationRegion;
  if (region !== undefined && region.length > 0) {
    findings.push(...lintApplicationRegion(region, mcuProfile(s), fw.roles));
  }
  return findings;
}

const fwBehaviorSet: ToolDef = {
  name: 'fw_behavior_set',
  summary:
    'Call this to add, replace or remove a firmware behavior — the closed ' +
    'set: sample, threshold, drive, serial_log. Behaviors reference roles; ' +
    'pins are derived by fw_pin_plan, never named.',
  input: z
    .object({
      set: behaviorSchema.optional(),
      remove: z.string().min(1).optional(),
    })
    .refine((i) => (i.set !== undefined) !== (i.remove !== undefined), {
      message: 'pass exactly one of set / remove',
    }),
  mutates: true,
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const fw = facetOf(s);
    const { set, remove } = input as { set?: Firmware['behaviors'][0]; remove?: string };
    if (set) {
      fw.behaviors = [...fw.behaviors.filter((b) => b.id !== set.id), set];
    } else {
      fw.behaviors = fw.behaviors.filter((b) => b.id !== remove);
    }
    return ok({ behaviors: fw.behaviors.length });
  },
};

const fwPinPlan: ToolDef = {
  name: 'fw_pin_plan',
  summary:
    'Call this to (re)derive the pin plan from the netlist: every net ' +
    'joining an MCU gpio pin to a part yields a role. Renames survive; ' +
    'behaviors no wiring supports are reported as unbound.',
  input: z.object({}),
  mutates: true,
  gated: false,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    const fw = facetOf(s);
    const plan = derivePinPlan(circuitOf(s), profilesMap(), fw.behaviors, fw.roles);
    fw.roles = plan.roles;
    return ok(plan);
  },
};

const checkFirmwareTool: ToolDef = {
  name: 'check_firmware',
  summary:
    'Call this to run the firmware cross-checks: circuit × firmware rules ' +
    '(output-into-rail, capabilities, strap pins, floating inputs, unbound ' +
    'roles) plus the raw-pin lint over the application region.',
  input: z.object({ applicationRegion: z.string().optional() }),
  mutates: true,   // derivation refreshes stored roles
  gated: false,
  handler(input, ctx) {
    const s = requireSession(ctx);
    const { applicationRegion } = input as { applicationRegion?: string };
    return ok({ findings: fwFindings(s, applicationRegion) });
  },
};

const fwGenerate: ToolDef = {
  name: 'fw_generate',
  summary:
    'Call this to project the firmware sources (pins.h, main.cpp) into the ' +
    'project. Refuses while any circuit or firmware BLOCKER stands. An ' +
    'applicationRegion, when passed, is linted before it is accepted.',
  input: z.object({ applicationRegion: z.string().optional() }),
  mutates: true,
  gated: true,
  handler(input, ctx: ToolCtx) {
    const s = requireSession(ctx);
    const { applicationRegion } = input as { applicationRegion?: string };

    const blocked = refusalFor([
      ...circuitFindings(s),
      ...fwFindings(s, applicationRegion),
    ]);
    if (blocked) {
      return refuse(
        blocked.code,
        blocked.code === 'MAINS_ON_BREADBOARD'
          ? 'mains on a breadboard is refused at every tier'
          : 'unresolved blockers — fix them before generating firmware',
        blocked.blocking,
      );
    }

    const fw = facetOf(s);
    if (applicationRegion !== undefined) fw.applicationRegion = applicationRegion;
    const profile = mcuProfile(s);
    writeSketch(ctx.cwd, fw, profile.fqbn!, fw.applicationRegion ?? '');
    return ok({
      files: ['firmware/pins.h', 'firmware/main.cpp', 'firmware/firmware.ino'],
    });
  },
};

const fwCompile: ToolDef = {
  name: 'fw_compile',
  summary:
    'Call this to compile the generated firmware with arduino-cli — the ' +
    'D13 arbiter. Errors come back verbatim to iterate on; success records ' +
    'the build, and only a successful build can ever be flashed.',
  input: z.object({}),
  mutates: true,
  gated: false,
  async handler(_input, ctx) {
    const s = requireSession(ctx);
    const fw = facetOf(s);
    const result = await compileFirmware(join(ctx.cwd, 'firmware'), mcuProfile(s));
    const build: NonNullable<Firmware['lastBuild']> = {
      ok: result.ok,
      at: new Date().toISOString(),
    };
    if (result.binPath !== undefined) build.bin = relative(ctx.cwd, result.binPath);
    fw.lastBuild = build;
    return ok({ ok: result.ok, log: result.log, ...(build.bin ? { bin: build.bin } : {}) });
  },
};

const fwManifest: ToolDef = {
  name: 'fw_manifest',
  summary:
    'Call this to release the compiled firmware for flashing — bin path, ' +
    'fqbn and flash protocol. Refuses while the power gate is shut: ' +
    'plugging in USB energises the board (D47).',
  input: z.object({}),
  mutates: false,
  gated: true,
  handler(_input, ctx) {
    const s = requireSession(ctx);
    if (!s.file.build.gateOpen) {
      return refuse(
        'GATE_NOT_OPEN',
        'flashing powers the board through USB — record the gate ' +
        'measurements and open the power gate first (D47)',
      );
    }
    const fw = facetOf(s);
    if (fw.lastBuild?.ok !== true || fw.lastBuild.bin === undefined) {
      throw new Error('fw_manifest: no successful build — run fw_compile first');
    }
    const profile = mcuProfile(s);
    return ok({
      bin: fw.lastBuild.bin,
      fqbn: profile.fqbn,
      flash: profile.flash,
    });
  },
};

export const FIRMWARE_TOOLS: ToolDef[] = [
  fwBehaviorSet, fwPinPlan, checkFirmwareTool, fwGenerate, fwCompile, fwManifest,
];
