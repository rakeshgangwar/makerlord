# MakerLord Front Door (stages ①–④) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project-level model and checks that turn a vague idea into a block architecture provably meeting numeric requirements.

**Architecture:** A third package, `@makerlord/project`, sitting above `@makerlord/circuit` and `@makerlord/parts`. It adds requirements, a block graph, feasibility with graded evidence, and an optional inventory — plus the checks over them, reusing the `Finding` type and rule engine from Slice 1. Pure functions over plain data; no agent, no UI.

**Tech Stack:** TypeScript (strict), Node 22, pnpm, Vitest, zod.

**Prerequisite:** Slices 0 and 1 ([2026-07-28-slices-0-and-1.md](2026-07-28-slices-0-and-1.md)) must be complete. This plan imports `Finding`, `Severity`, `Rule`, `runRules` from `@makerlord/circuit`, and `SafetyProfile` from `@makerlord/parts`.

**Spec:** [../specs/2026-07-29-front-door-design.md](../specs/2026-07-29-front-door-design.md)

## Global Constraints

- **Node 22+, pnpm 11+.** TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- **Reuse the Slice 1 rule engine.** Do not define a second `Finding` type or severity ladder.
- **Severity is bounded by provenance.** `verified`/computed may reach BLOCKER; `sourced` tops at WARNING; `inferred`/`assumed` tops at NOTE. Spec §4.
- **A `sourced` feasibility claim without `evidence.url` and `evidence.fetchedAt` is a validation error**, not a finding. Spec §3.5.
- **Computed checks degrade** — BLOCKER when every load-bearing input is `curated`, WARNING when any is `assumed`. Spec §3.2.
- **A requirement is measurable** when `value` + `unit` + `comparator` are present **and** `consumedBy` is non-empty. Spec §2.1.
- **Severity strings:** `REFUSE | BLOCKER | WARNING | NOTE`, uppercase, from `@makerlord/circuit`.

---

## File Structure

```
packages/project/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               public surface
    ├── model.ts               Project, InventoryItem
    ├── requirements/
    │   ├── types.ts           Requirement, Category, Provenance
    │   ├── schema.ts          zod validation
    │   ├── rules.ts           REQ_* rules
    │   └── archetypes.ts      universal core + 8 archetypes
    ├── architecture/
    │   ├── types.ts           Block, Interface, BlockLink
    │   ├── context.ts         ArchContext + lookup helpers
    │   ├── power.ts           ComputedValue, average-current budget
    │   ├── evaluators.ts      metric evaluator registry
    │   ├── rules.ts           ARCH_* rules
    │   └── expand.ts          block → Circuit handoff
    └── feasibility/
        ├── types.ts           Feasibility, FeasibilityClaim, Grade
        └── schema.ts          evidence validation
```

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/project/package.json`, `packages/project/tsconfig.json`
- Create: `packages/project/src/index.ts`, `packages/project/src/model.ts`
- Test: `packages/project/test/model.test.ts`

**Interfaces:**
- Consumes: `Circuit` from `@makerlord/circuit`
- Produces:
  - `interface InventoryItem { partId?: string; freeText?: string; quantity?: number }`
  - `interface Project { intent: string; inventory: InventoryItem[]; feasibility?: Feasibility; requirements: Requirement[]; architecture: { blocks: Block[]; links: BlockLink[] }; circuit?: Circuit }`
  - `emptyProject(intent: string): Project`

- [x] **Step 1: Write the failing test**

Create `packages/project/test/model.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model.js';

describe('emptyProject', () => {
  it('records the intent verbatim', () => {
    const p = emptyProject('a soil sensor for Home Assistant');
    expect(p.intent).toBe('a soil sensor for Home Assistant');
  });

  it('starts with empty collections, not undefined', () => {
    const p = emptyProject('x');
    expect(p.inventory).toEqual([]);
    expect(p.requirements).toEqual([]);
    expect(p.architecture.blocks).toEqual([]);
    expect(p.architecture.links).toEqual([]);
  });

  it('leaves feasibility and circuit absent until produced', () => {
    const p = emptyProject('x');
    expect(p.feasibility).toBeUndefined();
    expect(p.circuit).toBeUndefined();
  });

  it('rejects an empty intent', () => {
    expect(() => emptyProject('   ')).toThrow(/intent/);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/model.test.ts`
Expected: FAIL — cannot resolve `../src/model.js`.

- [x] **Step 3: Create the package files**

`packages/project/package.json`:

```json
{
  "name": "@makerlord/project",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@makerlord/parts": "workspace:*",
    "@makerlord/circuit": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

`packages/project/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../parts" }, { "path": "../circuit" }]
}
```

- [x] **Step 4: Write the model**

Create `packages/project/src/model.ts`:

```typescript
import type { Circuit } from '@makerlord/circuit';
import type { Block, BlockLink } from './architecture/types.js';
import type { Feasibility } from './feasibility/types.js';
import type { Requirement } from './requirements/types.js';

export interface InventoryItem {
  partId?: string;
  freeText?: string;
  quantity?: number;
}

export interface Project {
  intent: string;
  inventory: InventoryItem[];
  feasibility?: Feasibility;
  requirements: Requirement[];
  architecture: { blocks: Block[]; links: BlockLink[] };
  circuit?: Circuit;
}

export function emptyProject(intent: string): Project {
  if (intent.trim().length === 0) {
    throw new Error('emptyProject: intent must not be blank');
  }
  return {
    intent,
    inventory: [],
    requirements: [],
    architecture: { blocks: [], links: [] },
  };
}
```

Create the three type modules it imports so the build resolves — each is filled in by a later task:

`packages/project/src/requirements/types.ts`:

```typescript
export type RequirementCategory =
  | 'power' | 'environment' | 'interface'
  | 'performance' | 'physical' | 'cost';

export type Provenance = 'stated' | 'derived' | 'assumed';

export type Comparator = '>=' | '<=' | '==' | 'range';

export interface Requirement {
  id: string;
  category: RequirementCategory;
  statement: string;
  metric: string;
  comparator: Comparator;
  value: number;
  max?: number;
  unit: string;
  consumedBy: string[];
  provenance: Provenance;
}
```

`packages/project/src/architecture/types.ts`:

```typescript
export type InterfaceKind =
  | 'power' | 'i2c' | 'spi' | 'uart' | 'gpio' | 'analog' | 'pwm';

export interface BlockInterface {
  id: string;
  kind: InterfaceKind;
  direction: 'provides' | 'consumes';
  voltageV?: number;
  currentMa?: number;
}

export type Sourcing =
  | { type: 'buy'; partId: string }
  | { type: 'build'; partIds: string[] }
  | { type: 'undecided' };

export interface Block {
  id: string;
  name: string;
  sourcing: Sourcing;
  interfaces: BlockInterface[];
  power?: { activeMa: number; sleepMa?: number };
}

export interface BlockLink {
  from: { blockId: string; interfaceId: string };
  to: { blockId: string; interfaceId: string };
}
```

`packages/project/src/feasibility/types.ts`:

```typescript
export type Grade = 'verified' | 'sourced' | 'inferred';

export type Evidence =
  | { url: string; fetchedAt: string }
  | { toolCall: string };

export interface FeasibilityClaim {
  claim: string;
  grade: Grade;
  evidence?: Evidence;
}

export interface PriorArt {
  title: string;
  url: string;
  parts: string[];
}

export type Verdict =
  | 'buildable' | 'buildable-with-caveats'
  | 'buy-instead' | 'out-of-envelope';

export interface Feasibility {
  verdict: Verdict;
  claims: FeasibilityClaim[];
  priorArt: PriorArt[];
  roughCost?: { value: number; currency: string; grade: Grade };
}
```

`packages/project/src/index.ts`:

```typescript
export * from './model.js';
export * from './requirements/types.js';
export * from './architecture/types.js';
export * from './feasibility/types.js';
```

- [x] **Step 5: Install and run**

Run: `pnpm install && pnpm vitest run packages/project/test/model.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 6: Commit**

```bash
git add packages/project
git commit -m "feat(project): scaffold project package with model types"
```

---

### Task 2: Requirement validation

**Files:**
- Create: `packages/project/src/requirements/schema.ts`
- Test: `packages/project/test/requirement-schema.test.ts`

**Interfaces:**
- Consumes: `Requirement` (Task 1)
- Produces:
  - `requirementSchema` (zod)
  - `parseRequirement(input: unknown): Requirement`
  - `isMeasurable(r: Requirement): boolean`

**Definition (spec §2.1):** measurable = `value` + `unit` + `comparator` present **and** `consumedBy` non-empty.

- [x] **Step 1: Write the failing test**

Create `packages/project/test/requirement-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isMeasurable, parseRequirement } from '../src/requirements/schema.js';
import type { Requirement } from '../src/requirements/types.js';

const GOOD = {
  id: 'r1',
  category: 'power',
  statement: '≥6 months on 2×AA, one reading per hour',
  metric: 'battery_runtime',
  comparator: '>=',
  value: 6,
  unit: 'months',
  consumedBy: ['CHECK_POWER_BUDGET'],
  provenance: 'stated',
};

describe('parseRequirement', () => {
  it('accepts a well-formed requirement', () => {
    expect(parseRequirement(GOOD).metric).toBe('battery_runtime');
  });

  it('rejects an unknown category', () => {
    expect(() => parseRequirement({ ...GOOD, category: 'vibes' })).toThrow();
  });

  it('rejects a blank unit', () => {
    expect(() => parseRequirement({ ...GOOD, unit: '' })).toThrow();
  });

  it('requires max when comparator is range', () => {
    expect(() =>
      parseRequirement({ ...GOOD, comparator: 'range' }),
    ).toThrow(/max/);
  });

  it('accepts range when max is supplied', () => {
    const r = parseRequirement({ ...GOOD, comparator: 'range', value: 0, max: 40, unit: 'C' });
    expect(r.max).toBe(40);
  });
});

describe('isMeasurable', () => {
  it('is true for a complete requirement', () => {
    expect(isMeasurable(parseRequirement(GOOD))).toBe(true);
  });

  it('is false when consumedBy is empty — nothing reads it', () => {
    const r = { ...parseRequirement(GOOD), consumedBy: [] } as Requirement;
    expect(isMeasurable(r)).toBe(false);
  });

  it('is false when the unit is blank', () => {
    const r = { ...parseRequirement(GOOD), unit: '  ' } as Requirement;
    expect(isMeasurable(r)).toBe(false);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/requirement-schema.test.ts`
Expected: FAIL — cannot resolve `../src/requirements/schema.js`.

- [x] **Step 3: Write the schema**

Create `packages/project/src/requirements/schema.ts`:

```typescript
import { z } from 'zod';
import type { Requirement } from './types.js';

export const requirementSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum([
      'power', 'environment', 'interface',
      'performance', 'physical', 'cost',
    ]),
    statement: z.string().min(1),
    metric: z.string().min(1),
    comparator: z.enum(['>=', '<=', '==', 'range']),
    value: z.number().finite(),
    max: z.number().finite().optional(),
    unit: z.string().min(1),
    consumedBy: z.array(z.string().min(1)),
    provenance: z.enum(['stated', 'derived', 'assumed']),
  })
  .refine((r) => r.comparator !== 'range' || r.max !== undefined, {
    message: 'comparator "range" requires max',
    path: ['max'],
  });

export function parseRequirement(input: unknown): Requirement {
  return requirementSchema.parse(input) as Requirement;
}

/**
 * Spec §2.1: measurable means value + unit + comparator present AND
 * consumedBy non-empty. An orphan requirement is not measurable, because
 * nothing downstream would ever read it.
 */
export function isMeasurable(r: Requirement): boolean {
  return (
    Number.isFinite(r.value) &&
    r.unit.trim().length > 0 &&
    r.comparator.length > 0 &&
    r.consumedBy.length > 0
  );
}
```

- [x] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/requirement-schema.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add packages/project/src/requirements/schema.ts packages/project/test/requirement-schema.test.ts
git commit -m "feat(project): requirement schema and measurability check"
```

---

### Task 3: Requirement rules

**Files:**
- Create: `packages/project/src/requirements/rules.ts`
- Create: `packages/project/test/fixtures.ts`
- Test: `packages/project/test/requirement-rules.test.ts`

**Interfaces:**
- Consumes: `Finding`, `Rule` from `@makerlord/circuit`; `isMeasurable` (Task 2)
- Produces:
  - `interface ProjectContext { project: Project; defs: ReadonlyMap<string, PartDefinition>; profiles: ReadonlyMap<string, SafetyProfile> }`
  - `makeProjectContext(project, defs, profiles): ProjectContext`
  - `checkRequirements(ctx: ProjectContext): Finding[]`
  - `REQUIREMENT_RULES: readonly ProjectRule[]` where `interface ProjectRule { id: string; severity: Severity; check(ctx: ProjectContext): Finding[] }`

- [x] **Step 1: Write the shared fixture helper**

Create `packages/project/test/fixtures.ts`:

```typescript
import type { PartDefinition, SafetyProfile } from '@makerlord/parts';
import type { Project } from '../src/model.js';
import type { Requirement } from '../src/requirements/types.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { emptyProject } from '../src/model.js';
import { makeProjectContext } from '../src/requirements/rules.js';

export function req(over: Partial<Requirement> = {}): Requirement {
  return {
    id: 'r1',
    category: 'power',
    statement: '≥6 months on 2×AA',
    metric: 'battery_runtime',
    comparator: '>=',
    value: 6,
    unit: 'months',
    consumedBy: ['CHECK_POWER_BUDGET'],
    provenance: 'stated',
    ...over,
  };
}

export const ESP32_PROFILE: SafetyProfile = {
  partId: 'esp32',
  footprint: { pins: { GND: [0, 0], '3V3': [1, 0], D4: [2, 0] } },
  logicLevelV: 3.3,
  pinMaxMa: 20,
  portTotalMaxMa: 100,
  quiescentMa: 80,
  hazardClass: 'none',
};

export const AA_PROFILE: SafetyProfile = {
  partId: 'aa-2x',
  footprint: { pins: { '+': [0, 0], '-': [1, 0] } },
  hazardClass: 'none',
};

export function ctx(
  project: Project,
  profiles: [string, SafetyProfile][] = [
    ['esp32', ESP32_PROFILE],
    ['aa-2x', AA_PROFILE],
  ],
) {
  return makeProjectContext(
    project,
    new Map<string, PartDefinition>(),
    new Map(profiles),
  );
}

export function projectWith(
  requirements: Requirement[] = [],
  blocks: Block[] = [],
  links: BlockLink[] = [],
): Project {
  const p = emptyProject('test project');
  p.requirements = requirements;
  p.architecture = { blocks, links };
  return p;
}
```

- [x] **Step 2: Write the failing test**

Create `packages/project/test/requirement-rules.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { checkRequirements } from '../src/requirements/rules.js';
import { ctx, projectWith, req } from './fixtures.js';

describe('checkRequirements', () => {
  it('passes a complete requirement', () => {
    expect(checkRequirements(ctx(projectWith([req()])))).toEqual([]);
  });

  it('blocks a requirement with no unit', () => {
    const f = checkRequirements(ctx(projectWith([req({ unit: '' })])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('REQ_NOT_MEASURABLE');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('warns on an orphan requirement', () => {
    const f = checkRequirements(ctx(projectWith([req({ consumedBy: [] })])));
    const orphan = f.find((x) => x.ruleId === 'REQ_ORPHAN');
    expect(orphan?.severity).toBe('WARNING');
  });

  it('notes an assumed value so the maker can correct it', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ provenance: 'assumed' })])),
    );
    const note = f.find((x) => x.ruleId === 'REQ_ASSUMED_UNCONFIRMED');
    expect(note?.severity).toBe('NOTE');
  });

  it('names the offending requirement', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ id: 'runtime', unit: '' })])),
    );
    expect(f[0]!.message).toContain('runtime');
  });

  it('reports each requirement independently', () => {
    const f = checkRequirements(
      ctx(projectWith([req({ id: 'a', unit: '' }), req({ id: 'b', unit: '' })])),
    );
    expect(f.filter((x) => x.ruleId === 'REQ_NOT_MEASURABLE')).toHaveLength(2);
  });

  it('returns nothing for a project with no requirements yet', () => {
    expect(checkRequirements(ctx(projectWith([])))).toEqual([]);
  });
});
```

- [x] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/requirement-rules.test.ts`
Expected: FAIL — cannot resolve `../src/requirements/rules.js`.

- [x] **Step 4: Write the rules**

Create `packages/project/src/requirements/rules.ts`:

```typescript
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
```

- [x] **Step 5: Run the tests**

Run: `pnpm vitest run packages/project/test/requirement-rules.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 6: Commit**

```bash
git add packages/project/src/requirements/rules.ts packages/project/test/fixtures.ts packages/project/test/requirement-rules.test.ts
git commit -m "feat(project): requirement rules over the Slice 1 engine"
```

---

### Task 4: Computed values and the power budget

**Files:**
- Create: `packages/project/src/architecture/power.ts`
- Test: `packages/project/test/power.test.ts`

**Interfaces:**
- Consumes: `ProjectContext` (Task 3), `Block` (Task 1)
- Produces:
  - `interface ComputedValue<T> { value: T; provenance: 'curated' | 'assumed'; source: string }`
  - `const DEFAULT_ACTIVE_MA = 50`, `DEFAULT_SLEEP_MA = 0.01`
  - `blockActiveMa(ctx, block): ComputedValue<number>`
  - `blockSleepMa(ctx, block): ComputedValue<number>`
  - `dutyCycle(ctx): ComputedValue<number>` — from `sample_interval` + `active_duration` requirements
  - `interface PowerBudget { averageMa: number; inputs: ComputedValue<number>[]; anyAssumed: boolean }`
  - `computePowerBudget(ctx): PowerBudget`
  - `severityForComputed(anyAssumed: boolean): Severity`

**The provenance rule (spec §3.2):** every input records whether it came from a curated safety profile or a default. `severityForComputed` turns that into BLOCKER or WARNING — this one function is where spec §4 becomes code.

- [x] **Step 1: Write the failing test**

Create `packages/project/test/power.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  blockActiveMa, computePowerBudget, dutyCycle, severityForComputed,
} from '../src/architecture/power.js';
import type { Block } from '../src/architecture/types.js';
import { ctx, projectWith, req } from './fixtures.js';

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'p', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
};

const mcuWithPower: Block = { ...mcu, power: { activeMa: 80, sleepMa: 0.01 } };

describe('blockActiveMa', () => {
  it('prefers the block power field and marks it curated', () => {
    const v = blockActiveMa(ctx(projectWith([], [mcuWithPower])), mcuWithPower);
    expect(v.value).toBe(80);
    expect(v.provenance).toBe('curated');
  });

  it('falls back to the profile quiescent current, still curated', () => {
    const v = blockActiveMa(ctx(projectWith([], [mcu])), mcu);
    expect(v.value).toBe(80);           // ESP32_PROFILE.quiescentMa
    expect(v.provenance).toBe('curated');
  });

  it('falls back to a default and marks it assumed', () => {
    const unknown: Block = {
      id: 'x', name: 'x',
      sourcing: { type: 'buy', partId: 'not-curated' },
      interfaces: [],
    };
    const v = blockActiveMa(ctx(projectWith([], [unknown])), unknown);
    expect(v.value).toBe(50);
    expect(v.provenance).toBe('assumed');
  });
});

describe('dutyCycle', () => {
  it('derives duty from sample interval and active duration', () => {
    const p = projectWith([
      req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ]);
    const d = dutyCycle(ctx(p));
    expect(d.value).toBeCloseTo(3 / 3600, 6);
    expect(d.provenance).toBe('curated');
  });

  it('assumes always-on when no sample interval is stated', () => {
    const d = dutyCycle(ctx(projectWith([])));
    expect(d.value).toBe(1);
    expect(d.provenance).toBe('assumed');
  });
});

describe('computePowerBudget', () => {
  it('computes the worked hourly case from the spec', () => {
    // 80 mA active for 3 s per hour, 0.01 mA asleep the rest.
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(0.077, 2);
    expect(b.anyAssumed).toBe(false);
  });

  it('computes the worked per-minute case from the spec', () => {
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(4.01, 2);
  });

  it('flags anyAssumed when duty was not stated', () => {
    const b = computePowerBudget(ctx(projectWith([], [mcuWithPower])));
    expect(b.anyAssumed).toBe(true);
  });

  it('sums across blocks', () => {
    const second: Block = { ...mcuWithPower, id: 'radio', name: 'radio' };
    const p = projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      ],
      [mcuWithPower, second],
    );
    const b = computePowerBudget(ctx(p));
    expect(b.averageMa).toBeCloseTo(0.154, 2);
  });
});

describe('severityForComputed', () => {
  it('blocks when every input is curated', () => {
    expect(severityForComputed(false)).toBe('BLOCKER');
  });

  it('degrades to a warning when any input is assumed', () => {
    expect(severityForComputed(true)).toBe('WARNING');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/power.test.ts`
Expected: FAIL — cannot resolve `../src/architecture/power.js`.

- [x] **Step 3: Write the implementation**

Create `packages/project/src/architecture/power.ts`:

```typescript
import type { Severity } from '@makerlord/circuit';
import type { ProjectContext } from '../requirements/rules.js';
import type { Block } from './types.js';

export interface ComputedValue<T> {
  value: T;
  provenance: 'curated' | 'assumed';
  source: string;
}

export const DEFAULT_ACTIVE_MA = 50;
export const DEFAULT_SLEEP_MA = 0.01;

function profileFor(ctx: ProjectContext, block: Block) {
  if (block.sourcing.type === 'buy') {
    return ctx.profiles.get(block.sourcing.partId);
  }
  return undefined;
}

export function blockActiveMa(
  ctx: ProjectContext,
  block: Block,
): ComputedValue<number> {
  if (block.power?.activeMa !== undefined) {
    return {
      value: block.power.activeMa,
      provenance: 'curated',
      source: `block ${block.id}`,
    };
  }
  const quiescent = profileFor(ctx, block)?.quiescentMa;
  if (quiescent !== undefined) {
    return {
      value: quiescent,
      provenance: 'curated',
      source: `profile ${block.sourcing.type === 'buy' ? block.sourcing.partId : block.id}`,
    };
  }
  return {
    value: DEFAULT_ACTIVE_MA,
    provenance: 'assumed',
    source: `default for ${block.id}`,
  };
}

export function blockSleepMa(
  ctx: ProjectContext,
  block: Block,
): ComputedValue<number> {
  if (block.power?.sleepMa !== undefined) {
    return {
      value: block.power.sleepMa,
      provenance: 'curated',
      source: `block ${block.id}`,
    };
  }
  return {
    value: DEFAULT_SLEEP_MA,
    provenance: 'assumed',
    source: `default for ${block.id}`,
  };
}

function requirementValue(
  ctx: ProjectContext,
  metric: string,
): number | undefined {
  return ctx.project.requirements.find((r) => r.metric === metric)?.value;
}

/** Fraction of time the design is active. Spec §3.3. */
export function dutyCycle(ctx: ProjectContext): ComputedValue<number> {
  const interval = requirementValue(ctx, 'sample_interval');
  const active = requirementValue(ctx, 'active_duration');
  if (interval !== undefined && active !== undefined && interval > 0) {
    return {
      value: active / interval,
      provenance: 'curated',
      source: 'requirements sample_interval + active_duration',
    };
  }
  return { value: 1, provenance: 'assumed', source: 'assumed always-on' };
}

export interface PowerBudget {
  averageMa: number;
  inputs: ComputedValue<number>[];
  anyAssumed: boolean;
}

export function computePowerBudget(ctx: ProjectContext): PowerBudget {
  const duty = dutyCycle(ctx);
  const inputs: ComputedValue<number>[] = [duty];
  let averageMa = 0;

  for (const block of ctx.project.architecture.blocks) {
    const active = blockActiveMa(ctx, block);
    const sleep = blockSleepMa(ctx, block);
    inputs.push(active, sleep);
    averageMa += active.value * duty.value + sleep.value * (1 - duty.value);
  }

  return {
    averageMa,
    inputs,
    anyAssumed: inputs.some((i) => i.provenance === 'assumed'),
  };
}

/**
 * Spec §3.2 / §4: you may only gate on what you verified. A computed check
 * whose inputs are all curated may BLOCK; if any input was assumed it
 * degrades to a WARNING that names the assumption.
 */
export function severityForComputed(anyAssumed: boolean): Severity {
  return anyAssumed ? 'WARNING' : 'BLOCKER';
}
```

- [x] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/power.test.ts`
Expected: PASS, 11 tests.

- [x] **Step 5: Commit**

```bash
git add packages/project/src/architecture/power.ts packages/project/test/power.test.ts
git commit -m "feat(project): power budget with input provenance tracking"
```

---

### Task 5: Metric evaluator registry

**Files:**
- Create: `packages/project/src/architecture/evaluators.ts`
- Test: `packages/project/test/evaluators.test.ts`

**Interfaces:**
- Consumes: `computePowerBudget`, `ComputedValue` (Task 4)
- Produces:
  - `interface EvaluationResult { value: number; unit: string; inputs: ComputedValue<number>[]; workings: string }`
  - `interface MetricEvaluator { metric: string; unit: string; evaluate(ctx: ProjectContext): EvaluationResult | null }`
  - `const EVALUATORS: ReadonlyMap<string, MetricEvaluator>`
  - `evaluateMetric(ctx, metric): EvaluationResult | null`

**Spec §3.2:** a requirement is *computable* when its `metric` has a registered evaluator. `battery_runtime` has one; `enclosure_colour` does not, and is carried to the stage ⑭ test plan instead.

- [x] **Step 1: Write the failing test**

Create `packages/project/test/evaluators.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { EVALUATORS, evaluateMetric } from '../src/architecture/evaluators.js';
import type { Block } from '../src/architecture/types.js';
import { ctx, projectWith, req } from './fixtures.js';

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [],
  power: { activeMa: 80, sleepMa: 0.01 },
};

const battery: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3.0 }],
  power: { activeMa: 0 },
};

function hourly() {
  return ctx(
    projectWith(
      [
        req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
        req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
        req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
      ],
      [mcu, battery],
    ),
  );
}

describe('EVALUATORS', () => {
  it('registers battery_runtime', () => {
    expect(EVALUATORS.has('battery_runtime')).toBe(true);
  });

  it('does not register an arbitrary metric', () => {
    expect(EVALUATORS.has('enclosure_colour')).toBe(false);
  });
});

describe('evaluateMetric', () => {
  it('returns null for an unregistered metric — not computable', () => {
    expect(evaluateMetric(hourly(), 'enclosure_colour')).toBeNull();
  });

  it('computes the spec worked case: hourly sampling lasts years', () => {
    const r = evaluateMetric(hourly(), 'battery_runtime')!;
    expect(r.unit).toBe('months');
    expect(r.value).toBeGreaterThan(36);      // ≈3.4 years
  });

  it('computes the failing case: per-minute sampling lasts weeks', () => {
    const perMinute = ctx(
      projectWith(
        [
          req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
          req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
          req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
        ],
        [mcu, battery],
      ),
    );
    const r = evaluateMetric(perMinute, 'battery_runtime')!;
    expect(r.value).toBeLessThan(2);          // ≈29 days
  });

  it('shows its workings so a finding can quote the arithmetic', () => {
    const r = evaluateMetric(hourly(), 'battery_runtime')!;
    expect(r.workings).toMatch(/mA/);
    expect(r.workings).toMatch(/2800/);
  });

  it('returns null when capacity is unknown', () => {
    const noCapacity = ctx(projectWith([], [mcu]));
    expect(evaluateMetric(noCapacity, 'battery_runtime')).toBeNull();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/evaluators.test.ts`
Expected: FAIL — cannot resolve `../src/architecture/evaluators.js`.

- [x] **Step 3: Write the registry**

Create `packages/project/src/architecture/evaluators.ts`:

```typescript
import type { ProjectContext } from '../requirements/rules.js';
import type { ProjectContext } from '../requirements/rules.js';
import type { ComputedValue } from './power.js';
import { computePowerBudget } from './power.js';

export interface EvaluationResult {
  value: number;
  unit: string;
  inputs: ComputedValue<number>[];
  workings: string;
}

export interface MetricEvaluator {
  metric: string;
  unit: string;
  evaluate(ctx: ProjectContext): EvaluationResult | null;
}

const HOURS_PER_MONTH = 730;

const batteryRuntime: MetricEvaluator = {
  metric: 'battery_runtime',
  unit: 'months',
  evaluate(ctx) {
    const capacity = ctx.project.requirements.find(
      (r) => r.metric === 'supply_capacity',
    );
    if (!capacity) return null;

    const budget = computePowerBudget(ctx);
    if (budget.averageMa <= 0) return null;

    const hours = capacity.value / budget.averageMa;
    const months = hours / HOURS_PER_MONTH;

    return {
      value: months,
      unit: 'months',
      inputs: budget.inputs,
      workings:
        `${capacity.value} mAh / ${budget.averageMa.toFixed(3)} mA ` +
        `= ${hours.toFixed(0)} h = ${months.toFixed(1)} months`,
    };
  },
};

export const EVALUATORS: ReadonlyMap<string, MetricEvaluator> = new Map([
  [batteryRuntime.metric, batteryRuntime],
]);

/** Returns null when the metric has no evaluator, or cannot be computed yet. */
export function evaluateMetric(
  ctx: ProjectContext,
  metric: string,
): EvaluationResult | null {
  return EVALUATORS.get(metric)?.evaluate(ctx) ?? null;
}
```

- [x] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/evaluators.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add packages/project/src/architecture/evaluators.ts packages/project/test/evaluators.test.ts
git commit -m "feat(project): metric evaluator registry with battery runtime"
```

---

### Task 6: Interface rules

**Files:**
- Create: `packages/project/src/architecture/context.ts`
- Create: `packages/project/src/architecture/rules.ts`
- Test: `packages/project/test/interface-rules.test.ts`

**Interfaces:**
- Consumes: `ProjectContext` (Task 3), `Block`, `BlockInterface`, `BlockLink` (Task 1)
- Produces:
  - `findBlock(ctx, blockId): Block | undefined`
  - `findInterface(block, interfaceId): BlockInterface | undefined`
  - `linksTouching(ctx, blockId, interfaceId): BlockLink[]`
  - `const interfaceUnmetRule: ProjectRule` — `ARCH_INTERFACE_UNMET`
  - `const voltageMismatchRule: ProjectRule` — `ARCH_VOLTAGE_MISMATCH`

**Both are unconditional BLOCKERs.** Unlike the power budget, these compare values the maker or agent *declared* — no profile lookup, so no assumed inputs, so no severity degradation.

- [x] **Step 1: Write the failing test**

Create `packages/project/test/interface-rules.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  interfaceUnmetRule, voltageMismatchRule,
} from '../src/architecture/rules.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ctx, projectWith } from './fixtures.js';

const supply3v3: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3.3 }],
};

const supply5v: Block = {
  ...supply3v3,
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 5 }],
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
};

const powered: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

describe('interfaceUnmetRule', () => {
  it('blocks a consumes port with no link', () => {
    const f = interfaceUnmetRule.check(ctx(projectWith([], [supply3v3, mcu], [])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_INTERFACE_UNMET');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('passes when the port is linked', () => {
    expect(
      interfaceUnmetRule.check(ctx(projectWith([], [supply3v3, mcu], [powered]))),
    ).toEqual([]);
  });

  it('ignores unlinked provides ports — a spare output is fine', () => {
    const spare: Block = {
      id: 'psu', name: 'psu',
      sourcing: { type: 'buy', partId: 'aa-2x' },
      interfaces: [
        { id: 'a', kind: 'power', direction: 'provides', voltageV: 3.3 },
        { id: 'b', kind: 'power', direction: 'provides', voltageV: 3.3 },
      ],
    };
    const link: BlockLink = {
      from: { blockId: 'psu', interfaceId: 'a' },
      to: { blockId: 'mcu', interfaceId: 'vin' },
    };
    expect(
      interfaceUnmetRule.check(ctx(projectWith([], [spare, mcu], [link]))),
    ).toEqual([]);
  });

  it('names the block and the port', () => {
    const f = interfaceUnmetRule.check(ctx(projectWith([], [mcu], [])));
    expect(f[0]!.message).toContain('mcu');
    expect(f[0]!.message).toContain('vin');
  });
});

describe('voltageMismatchRule', () => {
  it('blocks 5 V driving a 3V3 input', () => {
    const f = voltageMismatchRule.check(
      ctx(projectWith([], [supply5v, mcu], [powered])),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_VOLTAGE_MISMATCH');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('reports both voltages so the maker can see the gap', () => {
    const f = voltageMismatchRule.check(
      ctx(projectWith([], [supply5v, mcu], [powered])),
    );
    expect(f[0]!.message).toMatch(/5/);
    expect(f[0]!.message).toMatch(/3\.3/);
  });

  it('passes on a matched rail', () => {
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [supply3v3, mcu], [powered]))),
    ).toEqual([]);
  });

  it('stays quiet when either side declares no voltage', () => {
    const noVolts: Block = {
      ...mcu,
      interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes' }],
    };
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [supply5v, noVolts], [powered]))),
    ).toEqual([]);
  });

  it('ignores non-power links', () => {
    const i2cA: Block = {
      id: 'supply', name: 'a',
      sourcing: { type: 'buy', partId: 'esp32' },
      interfaces: [{ id: 'out', kind: 'i2c', direction: 'provides', voltageV: 5 }],
    };
    const i2cB: Block = {
      id: 'mcu', name: 'b',
      sourcing: { type: 'buy', partId: 'esp32' },
      interfaces: [{ id: 'vin', kind: 'i2c', direction: 'consumes', voltageV: 3.3 }],
    };
    // Kind is i2c, not power — level shifting is a circuit-stage concern.
    expect(
      voltageMismatchRule.check(ctx(projectWith([], [i2cA, i2cB], [powered]))),
    ).toEqual([]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/interface-rules.test.ts`
Expected: FAIL — cannot resolve `../src/architecture/rules.js`.

- [x] **Step 3: Write the lookup helpers**

Create `packages/project/src/architecture/context.ts`:

```typescript
import type { ProjectContext } from '../requirements/rules.js';
import type { Block, BlockInterface, BlockLink } from './types.js';

export function findBlock(
  ctx: ProjectContext,
  blockId: string,
): Block | undefined {
  return ctx.project.architecture.blocks.find((b) => b.id === blockId);
}

export function findInterface(
  block: Block,
  interfaceId: string,
): BlockInterface | undefined {
  return block.interfaces.find((i) => i.id === interfaceId);
}

export function linksTouching(
  ctx: ProjectContext,
  blockId: string,
  interfaceId: string,
): BlockLink[] {
  return ctx.project.architecture.links.filter(
    (l) =>
      (l.from.blockId === blockId && l.from.interfaceId === interfaceId) ||
      (l.to.blockId === blockId && l.to.interfaceId === interfaceId),
  );
}
```

- [x] **Step 4: Write the rules**

Create `packages/project/src/architecture/rules.ts`:

```typescript
import type { Finding } from '@makerlord/circuit';
import type { ProjectRule } from '../requirements/rules.js';
import { findBlock, findInterface, linksTouching } from './context.js';

export const interfaceUnmetRule: ProjectRule = {
  id: 'ARCH_INTERFACE_UNMET',
  severity: 'BLOCKER',
  check(ctx) {
    const out: Finding[] = [];
    for (const block of ctx.project.architecture.blocks) {
      for (const iface of block.interfaces) {
        if (iface.direction !== 'consumes') continue;
        if (linksTouching(ctx, block.id, iface.id).length > 0) continue;
        out.push({
          ruleId: 'ARCH_INTERFACE_UNMET',
          severity: 'BLOCKER',
          message:
            `Block "${block.name}" (${block.id}) needs ${iface.kind} on port ` +
            `"${iface.id}", but nothing is connected to it.`,
          affected: { parts: [block.id] },
          suggestedFix:
            `Link "${iface.id}" to a block that provides ${iface.kind}, or ` +
            'remove the port if the block does not really need it.',
        });
      }
    }
    return out;
  },
};

export const voltageMismatchRule: ProjectRule = {
  id: 'ARCH_VOLTAGE_MISMATCH',
  severity: 'BLOCKER',
  check(ctx) {
    const out: Finding[] = [];
    for (const link of ctx.project.architecture.links) {
      const fromBlock = findBlock(ctx, link.from.blockId);
      const toBlock = findBlock(ctx, link.to.blockId);
      if (!fromBlock || !toBlock) continue;

      const a = findInterface(fromBlock, link.from.interfaceId);
      const b = findInterface(toBlock, link.to.interfaceId);
      if (!a || !b) continue;

      // Only power rails are checked here. Signal-level mismatches are a
      // circuit-stage concern (RULE_VOLTAGE_DOMAIN_MISMATCH, Slice 1).
      if (a.kind !== 'power' || b.kind !== 'power') continue;
      if (a.voltageV === undefined || b.voltageV === undefined) continue;
      if (a.voltageV === b.voltageV) continue;

      const provider = a.direction === 'provides' ? a : b;
      const consumer = a.direction === 'provides' ? b : a;

      out.push({
        ruleId: 'ARCH_VOLTAGE_MISMATCH',
        severity: 'BLOCKER',
        message:
          `"${fromBlock.name}" supplies ${provider.voltageV} V to ` +
          `"${toBlock.name}", which expects ${consumer.voltageV} V.`,
        affected: { parts: [fromBlock.id, toBlock.id] },
        suggestedFix:
          'Add a regulator block between them, or pick a supply at the ' +
          'voltage the load expects.',
      });
    }
    return out;
  },
};
```

- [x] **Step 5: Run the tests**

Run: `pnpm vitest run packages/project/test/interface-rules.test.ts`
Expected: PASS, 9 tests.

- [x] **Step 6: Commit**

```bash
git add packages/project/src/architecture/context.ts packages/project/src/architecture/rules.ts packages/project/test/interface-rules.test.ts
git commit -m "feat(project): interface and voltage architecture rules"
```

---

### Task 7: The computed rules — power budget and requirement satisfaction

**Files:**
- Modify: `packages/project/src/architecture/rules.ts`
- Test: `packages/project/test/computed-rules.test.ts`

**Interfaces:**
- Consumes: `computePowerBudget`, `severityForComputed` (Task 4), `evaluateMetric` (Task 5)
- Produces:
  - `const powerBudgetRule: ProjectRule` — `ARCH_POWER_BUDGET_EXCEEDED`
  - `const requirementUnsatisfiedRule: ProjectRule` — `ARCH_REQUIREMENT_UNSATISFIED`
  - `assumedInputSummary(inputs: ComputedValue<number>[]): string`

**This is spec §3.3 — the rule that earns the front door.** Both rules degrade from BLOCKER to WARNING when any load-bearing input was assumed, and both name the assumption in the message.

- [ ] **Step 1: Write the failing test**

Create `packages/project/test/computed-rules.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  powerBudgetRule, requirementUnsatisfiedRule,
} from '../src/architecture/rules.js';
import type { Block } from '../src/architecture/types.js';
import { ctx, projectWith, req } from './fixtures.js';

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [],
  power: { activeMa: 80, sleepMa: 0.01 },
};

const battery: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [
    { id: 'out', kind: 'power', direction: 'provides', voltageV: 3, currentMa: 200 },
  ],
  power: { activeMa: 0, sleepMa: 0 },
};

const timing = [
  req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
  req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
];
const capacity = req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' });

describe('powerBudgetRule', () => {
  it('passes when the supply covers the average draw', () => {
    expect(
      powerBudgetRule.check(ctx(projectWith(timing, [mcu, battery]))),
    ).toEqual([]);
  });

  it('blocks when average draw exceeds what the supply provides', () => {
    const hungry: Block = { ...mcu, power: { activeMa: 500, sleepMa: 400 } };
    const always = [
      req({ id: 'si', metric: 'sample_interval', value: 1, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 1, unit: 's' }),
    ];
    const f = powerBudgetRule.check(ctx(projectWith(always, [hungry, battery])));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_POWER_BUDGET_EXCEEDED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('degrades to WARNING when an input was assumed', () => {
    // No sleepMa declared and no curated profile value -> assumed default.
    const vague: Block = {
      id: 'mystery', name: 'mystery',
      sourcing: { type: 'buy', partId: 'not-curated' },
      interfaces: [],
    };
    const always = [
      req({ id: 'si', metric: 'sample_interval', value: 1, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 1, unit: 's' }),
    ];
    const tiny: Block = {
      ...battery,
      interfaces: [
        { id: 'out', kind: 'power', direction: 'provides', voltageV: 3, currentMa: 1 },
      ],
    };
    const f = powerBudgetRule.check(ctx(projectWith(always, [vague, tiny])));
    expect(f[0]!.severity).toBe('WARNING');
    expect(f[0]!.message).toMatch(/assumed/i);
  });

  it('stays quiet when no block provides a current budget', () => {
    const noBudget: Block = {
      ...battery,
      interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3 }],
    };
    expect(
      powerBudgetRule.check(ctx(projectWith(timing, [mcu, noBudget]))),
    ).toEqual([]);
  });
});

describe('requirementUnsatisfiedRule', () => {
  it('passes the spec worked case — hourly sampling meets 6 months', () => {
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    expect(
      requirementUnsatisfiedRule.check(
        ctx(projectWith([...timing, capacity, runtime], [mcu, battery])),
      ),
    ).toEqual([]);
  });

  it('blocks the spec failing case — per-minute sampling misses 6 months', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ];
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([...perMinute, capacity, runtime], [mcu, battery])),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_REQUIREMENT_UNSATISFIED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('shows the arithmetic in the message', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
    ];
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([...perMinute, capacity, runtime], [mcu, battery])),
    );
    expect(f[0]!.message).toMatch(/2800/);
    expect(f[0]!.message).toMatch(/mAh|mA/);
  });

  it('ignores requirements with no evaluator', () => {
    const colour = req({
      id: 'c', metric: 'enclosure_colour', value: 1, unit: 'enum',
      consumedBy: ['TEST_PLAN'],
    });
    expect(
      requirementUnsatisfiedRule.check(
        ctx(projectWith([...timing, capacity, colour], [mcu, battery])),
      ),
    ).toEqual([]);
  });

  it('degrades to WARNING when the computation rests on an assumption', () => {
    const runtime = req({
      id: 'rt', metric: 'battery_runtime', comparator: '>=',
      value: 600, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
    });
    // No timing requirements -> duty cycle is assumed always-on.
    const f = requirementUnsatisfiedRule.check(
      ctx(projectWith([capacity, runtime], [mcu, battery])),
    );
    expect(f[0]!.severity).toBe('WARNING');
    expect(f[0]!.message).toMatch(/assumed/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/computed-rules.test.ts`
Expected: FAIL — `powerBudgetRule` is not exported.

- [ ] **Step 3: Append the computed rules**

Add to `packages/project/src/architecture/rules.ts`:

```typescript
import type { ProjectContext } from '../requirements/rules.js';
import type { ComputedValue } from './power.js';
import { computePowerBudget, severityForComputed } from './power.js';
import { evaluateMetric } from './evaluators.js';

/** Names the assumed inputs so a finding can report its own weakest link. */
export function assumedInputSummary(inputs: ComputedValue<number>[]): string {
  const assumed = inputs.filter((i) => i.provenance === 'assumed');
  if (assumed.length === 0) return '';
  const names = [...new Set(assumed.map((a) => a.source))].join('; ');
  return ` Assumed inputs: ${names}. Confirm before trusting the margin.`;
}

function providedCurrentMa(ctx: ProjectContext): number {
  let total = 0;
  for (const block of ctx.project.architecture.blocks) {
    for (const iface of block.interfaces) {
      if (iface.direction === 'provides' && iface.kind === 'power') {
        total += iface.currentMa ?? 0;
      }
    }
  }
  return total;
}

export const powerBudgetRule: ProjectRule = {
  id: 'ARCH_POWER_BUDGET_EXCEEDED',
  severity: 'BLOCKER',
  check(ctx) {
    const provided = providedCurrentMa(ctx);
    if (provided <= 0) return [];       // nothing declares a budget yet

    const budget = computePowerBudget(ctx);
    if (budget.averageMa <= provided) return [];

    return [
      {
        ruleId: 'ARCH_POWER_BUDGET_EXCEEDED',
        severity: severityForComputed(budget.anyAssumed),
        message:
          `This architecture draws about ${budget.averageMa.toFixed(2)} mA on ` +
          `average, but the supply provides ${provided} mA.` +
          assumedInputSummary(budget.inputs),
        affected: {
          parts: ctx.project.architecture.blocks.map((b) => b.id),
        },
        suggestedFix:
          'Reduce duty cycle, pick lower-power parts, or choose a supply ' +
          'that can deliver the current.',
      },
    ];
  },
};

export const requirementUnsatisfiedRule: ProjectRule = {
  id: 'ARCH_REQUIREMENT_UNSATISFIED',
  severity: 'BLOCKER',
  check(ctx) {
    const out = [];
    for (const r of ctx.project.requirements) {
      const result = evaluateMetric(ctx, r.metric);
      if (!result) continue;            // not computable — see spec §3.2

      const ok =
        r.comparator === '>=' ? result.value >= r.value
        : r.comparator === '<=' ? result.value <= r.value
        : r.comparator === '==' ? result.value === r.value
        : result.value >= r.value && result.value <= (r.max ?? Infinity);
      if (ok) continue;

      const anyAssumed = result.inputs.some((i) => i.provenance === 'assumed');
      out.push({
        ruleId: 'ARCH_REQUIREMENT_UNSATISFIED',
        severity: severityForComputed(anyAssumed),
        message:
          `Requirement "${r.statement}" is not met by this architecture: ` +
          `${result.workings}, against a target of ${r.comparator} ${r.value} ` +
          `${r.unit}.` + assumedInputSummary(result.inputs),
        affected: { parts: [r.id] },
        suggestedFix:
          'Change the architecture, or revise the requirement — but do not ' +
          'leave them disagreeing.',
      });
    }
    return out;
  },
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/computed-rules.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/project/src/architecture/rules.ts packages/project/test/computed-rules.test.ts
git commit -m "feat(project): power budget and requirement satisfaction rules"
```

---

### Task 8: Pin count rule and the architecture registry

**Files:**
- Modify: `packages/project/src/architecture/rules.ts`
- Test: `packages/project/test/architecture-registry.test.ts`

**Interfaces:**
- Consumes: all rules from Tasks 6–7; `PartDefinition` from `@makerlord/parts`
- Produces:
  - `const pinCountRule: ProjectRule` — `ARCH_PIN_COUNT_EXCEEDED`
  - `const ARCHITECTURE_RULES: readonly ProjectRule[]` — five entries
  - `checkArchitecture(ctx: ProjectContext): Finding[]`
  - `architectureGateOpens(findings: Finding[]): boolean`

**Pin counting model:** a block declares **one** `gpio` interface with direction `provides`; each link into it consumes one pin. Available pins come from the block's `PartDefinition` — pins whose `role` is `io`.

- [ ] **Step 1: Write the failing test**

Create `packages/project/test/architecture-registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { PartDefinition } from '@makerlord/parts';
import {
  ARCHITECTURE_RULES, architectureGateOpens, checkArchitecture, pinCountRule,
} from '../src/architecture/rules.js';
import { makeProjectContext } from '../src/requirements/rules.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ESP32_PROFILE, AA_PROFILE, projectWith, req } from './fixtures.js';

const TINY_MCU: PartDefinition = {
  id: 'tiny', title: 'Tiny MCU', family: 'microcontroller board',
  properties: {},
  pins: [
    { id: 'c0', name: 'GND', role: 'gnd' },
    { id: 'c1', name: 'D0', role: 'io' },
    { id: 'c2', name: 'D1', role: 'io' },
  ],
  buses: [], views: {},
};

function ctxWithDefs(project: ReturnType<typeof projectWith>) {
  return makeProjectContext(
    project,
    new Map([['tiny', TINY_MCU]]),
    new Map([['esp32', ESP32_PROFILE], ['aa-2x', AA_PROFILE]]),
  );
}

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'tiny' },
  interfaces: [{ id: 'io', kind: 'gpio', direction: 'provides' }],
};

function sensor(id: string): Block {
  return {
    id, name: id,
    sourcing: { type: 'buy', partId: 'esp32' },
    interfaces: [{ id: 'sig', kind: 'gpio', direction: 'consumes' }],
  };
}

function wire(id: string): BlockLink {
  return {
    from: { blockId: id, interfaceId: 'sig' },
    to: { blockId: 'mcu', interfaceId: 'io' },
  };
}

describe('pinCountRule', () => {
  it('passes when demand fits the available io pins', () => {
    const p = projectWith([], [mcu, sensor('a'), sensor('b')], [wire('a'), wire('b')]);
    expect(pinCountRule.check(ctxWithDefs(p))).toEqual([]);
  });

  it('blocks when demand exceeds the available io pins', () => {
    const p = projectWith(
      [], [mcu, sensor('a'), sensor('b'), sensor('c')],
      [wire('a'), wire('b'), wire('c')],
    );
    const f = pinCountRule.check(ctxWithDefs(p));
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('ARCH_PIN_COUNT_EXCEEDED');
    expect(f[0]!.severity).toBe('BLOCKER');
  });

  it('reports demand and capacity', () => {
    const p = projectWith(
      [], [mcu, sensor('a'), sensor('b'), sensor('c')],
      [wire('a'), wire('b'), wire('c')],
    );
    expect(pinCountRule.check(ctxWithDefs(p))[0]!.message).toMatch(/3.*2|2.*3/);
  });

  it('stays quiet when the part definition is unknown', () => {
    const unknown: Block = { ...mcu, sourcing: { type: 'buy', partId: 'nope' } };
    const p = projectWith([], [unknown, sensor('a')], [wire('a')]);
    expect(pinCountRule.check(ctxWithDefs(p))).toEqual([]);
  });
});

describe('ARCHITECTURE_RULES', () => {
  it('registers all five architecture rules', () => {
    expect(ARCHITECTURE_RULES.map((r) => r.id).sort()).toEqual([
      'ARCH_INTERFACE_UNMET',
      'ARCH_PIN_COUNT_EXCEEDED',
      'ARCH_POWER_BUDGET_EXCEEDED',
      'ARCH_REQUIREMENT_UNSATISFIED',
      'ARCH_VOLTAGE_MISMATCH',
    ]);
  });

  it('has no duplicate ids', () => {
    const ids = ARCHITECTURE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('architectureGateOpens', () => {
  it('opens on a clean architecture', () => {
    const p = projectWith([], [mcu, sensor('a')], [wire('a')]);
    expect(architectureGateOpens(checkArchitecture(ctxWithDefs(p)))).toBe(true);
  });

  it('stays shut when a port is unlinked', () => {
    const p = projectWith([], [mcu, sensor('a')], []);
    expect(architectureGateOpens(checkArchitecture(ctxWithDefs(p)))).toBe(false);
  });

  it('opens despite a WARNING — a degraded check does not gate', () => {
    // An assumed input degrades the computed rules to WARNING, which by
    // spec §4 must not block progress.
    const p = projectWith(
      [req({ id: 'cap', metric: 'supply_capacity', value: 1, unit: 'mAh' }),
       req({ id: 'rt', metric: 'battery_runtime', value: 99999, unit: 'months' })],
      [mcu, sensor('a')], [wire('a')],
    );
    const findings = checkArchitecture(ctxWithDefs(p));
    expect(findings.some((f) => f.severity === 'WARNING')).toBe(true);
    expect(architectureGateOpens(findings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/architecture-registry.test.ts`
Expected: FAIL — `pinCountRule` is not exported.

- [ ] **Step 3: Append the rule and the registry**

Add to `packages/project/src/architecture/rules.ts`:

```typescript
export const pinCountRule: ProjectRule = {
  id: 'ARCH_PIN_COUNT_EXCEEDED',
  severity: 'BLOCKER',
  check(ctx) {
    const out = [];
    for (const block of ctx.project.architecture.blocks) {
      if (block.sourcing.type !== 'buy') continue;
      const def = ctx.defs.get(block.sourcing.partId);
      if (!def) continue;

      const available = def.pins.filter((p) => p.role === 'io').length;
      if (available === 0) continue;

      const gpioPorts = block.interfaces.filter(
        (i) => i.kind === 'gpio' && i.direction === 'provides',
      );
      let demand = 0;
      for (const port of gpioPorts) {
        demand += linksTouching(ctx, block.id, port.id).length;
      }
      if (demand <= available) continue;

      out.push({
        ruleId: 'ARCH_PIN_COUNT_EXCEEDED',
        severity: 'BLOCKER' as const,
        message:
          `"${block.name}" would need ${demand} I/O pins but ${def.title} ` +
          `has ${available}.`,
        affected: { parts: [block.id] },
        suggestedFix:
          'Pick a board with more I/O, move devices onto a shared bus like ' +
          'I²C, or add a port expander block.',
      });
    }
    return out;
  },
};

export const ARCHITECTURE_RULES: readonly ProjectRule[] = [
  interfaceUnmetRule,
  voltageMismatchRule,
  powerBudgetRule,
  requirementUnsatisfiedRule,
  pinCountRule,
];

export function checkArchitecture(ctx: ProjectContext): Finding[] {
  return ARCHITECTURE_RULES.flatMap((r) => r.check(ctx)).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/** Spec §5.3: advance_to_circuit refuses while any BLOCKER or REFUSE stands. */
export function architectureGateOpens(findings: readonly Finding[]): boolean {
  return !findings.some(
    (f) => f.severity === 'REFUSE' || f.severity === 'BLOCKER',
  );
}
```

Extend the existing `../requirements/rules.js` import at the top of the file to
also bring in `SEVERITY_ORDER` (defined in Task 3) — `ProjectContext` and
`ProjectRule` are already imported there:

```typescript
import { SEVERITY_ORDER } from '../requirements/rules.js';
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/architecture-registry.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/project/src/architecture/rules.ts packages/project/test/architecture-registry.test.ts
git commit -m "feat(project): pin count rule, architecture registry and gate"
```

---

### Task 9: Feasibility validation

**Files:**
- Create: `packages/project/src/feasibility/schema.ts`
- Test: `packages/project/test/feasibility.test.ts`

**Interfaces:**
- Consumes: `Feasibility`, `FeasibilityClaim`, `Grade` (Task 1)
- Produces:
  - `feasibilityClaimSchema`, `feasibilitySchema` (zod)
  - `parseFeasibilityClaim(input: unknown): FeasibilityClaim`
  - `parseFeasibility(input: unknown): Feasibility`

**Spec §2.3 / §3.5:** a `sourced` claim without `evidence.url` + `evidence.fetchedAt` is a **validation error**, not a finding. A `verified` claim needs `evidence.toolCall`. Hallucinated prior art cannot enter the model because the type will not hold it.

- [ ] **Step 1: Write the failing test**

Create `packages/project/test/feasibility.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  parseFeasibility, parseFeasibilityClaim,
} from '../src/feasibility/schema.js';

const SOURCED = {
  claim: 'three people have built a soil sensor on ESP32',
  grade: 'sourced',
  evidence: { url: 'https://example.com/build', fetchedAt: '2026-07-29T10:00:00Z' },
};

describe('parseFeasibilityClaim', () => {
  it('accepts a sourced claim with fetched evidence', () => {
    expect(parseFeasibilityClaim(SOURCED).grade).toBe('sourced');
  });

  it('REJECTS a sourced claim with no evidence at all', () => {
    const { evidence, ...noEvidence } = SOURCED;
    expect(() => parseFeasibilityClaim(noEvidence)).toThrow(/evidence/i);
  });

  it('REJECTS a sourced claim whose evidence lacks fetchedAt', () => {
    expect(() =>
      parseFeasibilityClaim({ ...SOURCED, evidence: { url: 'https://x.test' } }),
    ).toThrow();
  });

  it('REJECTS a sourced claim backed only by a tool call', () => {
    expect(() =>
      parseFeasibilityClaim({ ...SOURCED, evidence: { toolCall: 'search_parts' } }),
    ).toThrow(/evidence/i);
  });

  it('accepts a verified claim backed by a tool call', () => {
    const c = parseFeasibilityClaim({
      claim: 'the library has a profile for this sensor',
      grade: 'verified',
      evidence: { toolCall: 'search_parts' },
    });
    expect(c.grade).toBe('verified');
  });

  it('REJECTS a verified claim with no evidence', () => {
    expect(() =>
      parseFeasibilityClaim({ claim: 'x', grade: 'verified' }),
    ).toThrow(/evidence/i);
  });

  it('accepts an inferred claim with no evidence — that is what inferred means', () => {
    const c = parseFeasibilityClaim({
      claim: 'roughly a weekend of work',
      grade: 'inferred',
    });
    expect(c.evidence).toBeUndefined();
  });
});

describe('parseFeasibility', () => {
  it('accepts a complete verdict', () => {
    const f = parseFeasibility({
      verdict: 'buildable',
      claims: [SOURCED],
      priorArt: [{ title: 'Soil sensor', url: 'https://x.test', parts: ['esp32'] }],
      roughCost: { value: 28, currency: 'GBP', grade: 'inferred' },
    });
    expect(f.verdict).toBe('buildable');
  });

  it('rejects an unknown verdict', () => {
    expect(() =>
      parseFeasibility({ verdict: 'vibes', claims: [], priorArt: [] }),
    ).toThrow();
  });

  it('accepts buy-instead as a legitimate terminal verdict', () => {
    const f = parseFeasibility({
      verdict: 'buy-instead', claims: [], priorArt: [],
    });
    expect(f.verdict).toBe('buy-instead');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/feasibility.test.ts`
Expected: FAIL — cannot resolve `../src/feasibility/schema.js`.

- [ ] **Step 3: Write the schema**

Create `packages/project/src/feasibility/schema.ts`:

```typescript
import { z } from 'zod';
import type { Feasibility, FeasibilityClaim } from './types.js';

const fetchedEvidence = z.object({
  url: z.string().url(),
  fetchedAt: z.string().min(1),
});

const toolEvidence = z.object({ toolCall: z.string().min(1) });

export const feasibilityClaimSchema = z
  .object({
    claim: z.string().min(1),
    grade: z.enum(['verified', 'sourced', 'inferred']),
    evidence: z.union([fetchedEvidence, toolEvidence]).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.grade === 'sourced') {
      const ok =
        c.evidence !== undefined && fetchedEvidence.safeParse(c.evidence).success;
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidence'],
          message:
            'a sourced claim requires evidence with a fetched url and fetchedAt',
        });
      }
    }
    if (c.grade === 'verified') {
      const ok =
        c.evidence !== undefined && toolEvidence.safeParse(c.evidence).success;
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidence'],
          message: 'a verified claim requires evidence naming the tool call',
        });
      }
    }
  });

export const feasibilitySchema = z.object({
  verdict: z.enum([
    'buildable', 'buildable-with-caveats', 'buy-instead', 'out-of-envelope',
  ]),
  claims: z.array(feasibilityClaimSchema),
  priorArt: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
      parts: z.array(z.string()),
    }),
  ),
  roughCost: z
    .object({
      value: z.number().nonnegative(),
      currency: z.string().min(1),
      grade: z.enum(['verified', 'sourced', 'inferred']),
    })
    .optional(),
});

export function parseFeasibilityClaim(input: unknown): FeasibilityClaim {
  return feasibilityClaimSchema.parse(input) as FeasibilityClaim;
}

export function parseFeasibility(input: unknown): Feasibility {
  return feasibilitySchema.parse(input) as Feasibility;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/feasibility.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/project/src/feasibility/schema.ts packages/project/test/feasibility.test.ts
git commit -m "feat(project): feasibility evidence validation at the schema"
```

---

### Task 10: The archetype library

**Files:**
- Create: `packages/project/src/requirements/archetypes.ts`
- Test: `packages/project/test/archetypes.test.ts`

**Interfaces:**
- Consumes: `RequirementCategory`, `Comparator` (Task 1)
- Produces:
  - `interface RequirementSlot { metric; category; unit; comparator; consumedBy; prompt; default? }`
  - `const UNIVERSAL_SLOTS: readonly RequirementSlot[]`
  - `interface Archetype { id; name; matches: string[]; slots: RequirementSlot[] }`
  - `const ARCHETYPES: readonly Archetype[]` — eight entries
  - `suggestArchetype(intent: string): Archetype | undefined`
  - `slotsFor(archetypeId?: string): RequirementSlot[]`

**Spec §5.2:** archetypes are **hints, not gates**. An unusual project gets the universal core plus whatever conversation surfaces. `default` exists so an unanswered slot becomes an *assumed* requirement rather than a missing one.

- [ ] **Step 1: Write the failing test**

Create `packages/project/test/archetypes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, UNIVERSAL_SLOTS, slotsFor, suggestArchetype,
} from '../src/requirements/archetypes.js';

describe('UNIVERSAL_SLOTS', () => {
  it('covers the four always-asked categories', () => {
    const cats = new Set(UNIVERSAL_SLOTS.map((s) => s.category));
    expect(cats).toContain('power');
    expect(cats).toContain('environment');
    expect(cats).toContain('interface');
    expect(cats).toContain('physical');
  });

  it('gives every slot a consumer — no orphans by construction', () => {
    for (const s of UNIVERSAL_SLOTS) {
      expect(s.consumedBy.length).toBeGreaterThan(0);
    }
  });

  it('gives every slot a unit and a prompt', () => {
    for (const s of UNIVERSAL_SLOTS) {
      expect(s.unit.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });
});

describe('ARCHETYPES', () => {
  it('ships eight archetypes', () => {
    expect(ARCHETYPES).toHaveLength(8);
  });

  it('has unique ids', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the sensor node a sample interval, which the power budget reads', () => {
    const sensor = ARCHETYPES.find((a) => a.id === 'sensor-node')!;
    const slot = sensor.slots.find((s) => s.metric === 'sample_interval')!;
    expect(slot.consumedBy).toContain('CHECK_POWER_BUDGET');
  });
});

describe('suggestArchetype', () => {
  it('matches a soil sensor to the sensor node', () => {
    expect(suggestArchetype('a soil moisture sensor for Home Assistant')?.id)
      .toBe('sensor-node');
  });

  it('matches a robot to the robot archetype', () => {
    expect(suggestArchetype('a small robot that follows a line')?.id).toBe('robot');
  });

  it('returns undefined for something unmatched — hints, not gates', () => {
    expect(suggestArchetype('a device for reticulating splines')).toBeUndefined();
  });
});

describe('slotsFor', () => {
  it('returns the universal core when no archetype matches', () => {
    expect(slotsFor(undefined)).toEqual([...UNIVERSAL_SLOTS]);
  });

  it('appends archetype slots to the universal core', () => {
    const slots = slotsFor('sensor-node');
    expect(slots.length).toBeGreaterThan(UNIVERSAL_SLOTS.length);
    expect(slots.some((s) => s.metric === 'sample_interval')).toBe(true);
  });

  it('never returns duplicate metrics', () => {
    const metrics = slotsFor('sensor-node').map((s) => s.metric);
    expect(new Set(metrics).size).toBe(metrics.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/archetypes.test.ts`
Expected: FAIL — cannot resolve `../src/requirements/archetypes.js`.

- [ ] **Step 3: Write the library**

Create `packages/project/src/requirements/archetypes.ts`:

```typescript
import type { Comparator, RequirementCategory } from './types.js';

export interface RequirementSlot {
  metric: string;
  category: RequirementCategory;
  unit: string;
  comparator: Comparator;
  consumedBy: string[];
  prompt: string;
  /** Used when the maker declines to answer; the requirement is then assumed. */
  default?: number;
}

export const UNIVERSAL_SLOTS: readonly RequirementSlot[] = [
  {
    metric: 'supply_capacity', category: 'power', unit: 'mAh', comparator: '>=',
    consumedBy: ['CHECK_POWER_BUDGET'],
    prompt: 'What powers it — USB, a battery, or a wall adapter? If battery, which?',
  },
  {
    metric: 'operating_temperature', category: 'environment', unit: 'C',
    comparator: 'range', consumedBy: ['TEST_PLAN'], default: 0,
    prompt: 'Where does it live — indoors, outdoors, a fridge, a greenhouse?',
  },
  {
    metric: 'host_interface', category: 'interface', unit: 'enum',
    comparator: '==', consumedBy: ['CHECK_INTERFACE_COMPAT'],
    prompt: 'What does it talk to, and over what — WiFi, USB, Bluetooth, nothing?',
  },
  {
    metric: 'max_dimension', category: 'physical', unit: 'mm', comparator: '<=',
    consumedBy: ['CHECK_ENCLOSURE_FIT'],
    prompt: 'Does it have to fit anywhere in particular?',
  },
];

export interface Archetype {
  id: string;
  name: string;
  matches: string[];
  slots: RequirementSlot[];
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'sensor-node', name: 'Sensor node',
    matches: ['sensor', 'monitor', 'measure', 'soil', 'temperature', 'humidity'],
    slots: [
      {
        metric: 'sample_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How often should it take a reading?',
      },
      {
        metric: 'active_duration', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'], default: 3,
        prompt: 'Roughly how long is it awake per reading?',
      },
      {
        metric: 'battery_runtime', category: 'power', unit: 'months',
        comparator: '>=', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long should it run before you touch it again?',
      },
    ],
  },
  {
    id: 'actuator', name: 'Actuator / controller',
    matches: ['relay', 'motor', 'switch', 'valve', 'servo', 'control'],
    slots: [
      {
        metric: 'load_current', category: 'power', unit: 'mA', comparator: '<=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'What is it switching or driving, and how much current does that draw?',
      },
      {
        metric: 'switching_rate', category: 'performance', unit: 'Hz',
        comparator: '<=', consumedBy: ['TEST_PLAN'], default: 1,
        prompt: 'How often does it actuate?',
      },
    ],
  },
  {
    id: 'audio', name: 'Audio device',
    matches: ['audio', 'speaker', 'microphone', 'sound', 'music'],
    slots: [
      {
        metric: 'sample_rate', category: 'performance', unit: 'Hz',
        comparator: '>=', consumedBy: ['TEST_PLAN'], default: 16000,
        prompt: 'What audio quality do you need?',
      },
    ],
  },
  {
    id: 'wearable', name: 'Wearable',
    matches: ['wearable', 'watch', 'badge', 'wrist', 'pocket'],
    slots: [
      {
        metric: 'max_mass', category: 'physical', unit: 'g', comparator: '<=',
        consumedBy: ['CHECK_ENCLOSURE_FIT'],
        prompt: 'How heavy can it be before it stops being wearable?',
      },
      {
        metric: 'battery_runtime', category: 'power', unit: 'months',
        comparator: '>=', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long between charges?',
      },
    ],
  },
  {
    id: 'robot', name: 'Robot',
    matches: ['robot', 'rover', 'drive', 'wheels', 'line follower'],
    slots: [
      {
        metric: 'stall_current', category: 'power', unit: 'mA', comparator: '<=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'What motors, and what do they draw when stalled?',
      },
      {
        metric: 'runtime', category: 'power', unit: 'months', comparator: '>=',
        consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How long should it run on a charge?',
      },
    ],
  },
  {
    id: 'data-logger', name: 'Data logger',
    matches: ['logger', 'log', 'record', 'sd card', 'datalogger'],
    slots: [
      {
        metric: 'sample_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'],
        prompt: 'How often does it record?',
      },
      {
        metric: 'storage_duration', category: 'performance', unit: 'days',
        comparator: '>=', consumedBy: ['TEST_PLAN'],
        prompt: 'How much history must it hold before you collect it?',
      },
    ],
  },
  {
    id: 'display', name: 'Display device',
    matches: ['display', 'screen', 'e-ink', 'oled', 'lcd', 'dashboard'],
    slots: [
      {
        metric: 'refresh_interval', category: 'performance', unit: 's',
        comparator: '==', consumedBy: ['CHECK_POWER_BUDGET'], default: 60,
        prompt: 'How often does the display update?',
      },
    ],
  },
  {
    id: 'gateway', name: 'Gateway / bridge',
    matches: ['gateway', 'bridge', 'hub', 'router', 'relay station'],
    slots: [
      {
        metric: 'node_count', category: 'performance', unit: 'count',
        comparator: '<=', consumedBy: ['TEST_PLAN'],
        prompt: 'How many devices does it serve?',
      },
    ],
  },
];

export function suggestArchetype(intent: string): Archetype | undefined {
  const text = intent.toLowerCase();
  return ARCHETYPES.find((a) => a.matches.some((m) => text.includes(m)));
}

/** Universal core plus the archetype's slots, de-duplicated by metric. */
export function slotsFor(archetypeId?: string): RequirementSlot[] {
  const extra =
    ARCHETYPES.find((a) => a.id === archetypeId)?.slots ?? [];
  const seen = new Set<string>();
  const out: RequirementSlot[] = [];
  for (const slot of [...UNIVERSAL_SLOTS, ...extra]) {
    if (seen.has(slot.metric)) continue;
    seen.add(slot.metric);
    out.push(slot);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/project/test/archetypes.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/project/src/requirements/archetypes.ts packages/project/test/archetypes.test.ts
git commit -m "feat(project): archetype library with universal requirement core"
```

---

### Task 11: Block expansion — the handoff to stage ⑥

**Files:**
- Create: `packages/project/src/architecture/expand.ts`
- Modify: `packages/circuit/src/model.ts` — add `blockId?: string` to `PartInstance`
- Test: `packages/project/test/expand.test.ts`

**Interfaces:**
- Consumes: `Block`, `BlockLink` (Task 1); `Circuit`, `PartInstance`, `IntentNet` from `@makerlord/circuit`
- Produces:
  - `expandArchitecture(project: Project): Circuit`

**Spec §5.4:** `buy` becomes one `PartInstance`; `build` becomes several; `undecided` is **refused**. `BlockLink`s become `IntentNet`s. **Blocks are retained** — each `PartInstance` carries its `blockId`, which is how D27's hierarchical schematic knows its sheet.

- [ ] **Step 1: Add `blockId` to PartInstance**

In `packages/circuit/src/model.ts`, change:

```typescript
export interface PartInstance {
  ref: string;
  defId: string;
  placement?: Placement;
  /** Set when this part came from expanding an architecture block (front door
   *  spec §5.4). Carried through to the hierarchical schematic sheet (D27). */
  blockId?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/project/test/expand.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { expandArchitecture } from '../src/architecture/expand.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { projectWith } from './fixtures.js';

const supply: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [{ id: 'out', kind: 'power', direction: 'provides', voltageV: 3 }],
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3 }],
};

const link: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

describe('expandArchitecture', () => {
  it('turns a buy block into exactly one part instance', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts).toHaveLength(1);
    expect(c.parts[0]!.defId).toBe('aa-2x');
  });

  it('retains the block id on the part — D27 needs it for sheets', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts[0]!.blockId).toBe('supply');
  });

  it('turns a build block into one part per listed part', () => {
    const divider: Block = {
      id: 'divider', name: 'divider',
      sourcing: { type: 'build', partIds: ['res', 'res'] },
      interfaces: [],
    };
    const c = expandArchitecture(projectWith([], [divider], []));
    expect(c.parts).toHaveLength(2);
    expect(c.parts.every((p) => p.blockId === 'divider')).toBe(true);
  });

  it('gives every part a unique ref', () => {
    const divider: Block = {
      id: 'divider', name: 'divider',
      sourcing: { type: 'build', partIds: ['res', 'res'] },
      interfaces: [],
    };
    const c = expandArchitecture(projectWith([], [divider], []));
    const refs = c.parts.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('turns a block link into an intent net', () => {
    const c = expandArchitecture(projectWith([], [supply, mcu], [link]));
    expect(c.intent).toHaveLength(1);
    expect(c.intent[0]!.members).toHaveLength(2);
  });

  it('leaves parts unplaced — placement is the prototype stage', () => {
    const c = expandArchitecture(projectWith([], [supply], []));
    expect(c.parts[0]!.placement).toBeUndefined();
  });

  it('REFUSES an undecided block', () => {
    const undecided: Block = {
      id: 'x', name: 'x', sourcing: { type: 'undecided' }, interfaces: [],
    };
    expect(() => expandArchitecture(projectWith([], [undecided], []))).toThrow(
      /undecided/i,
    );
  });

  it('refuses a link naming a block that does not exist', () => {
    const dangling: BlockLink = {
      from: { blockId: 'ghost', interfaceId: 'out' },
      to: { blockId: 'mcu', interfaceId: 'vin' },
    };
    expect(() =>
      expandArchitecture(projectWith([], [mcu], [dangling])),
    ).toThrow(/ghost/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run packages/project/test/expand.test.ts`
Expected: FAIL — cannot resolve `../src/architecture/expand.js`.

- [ ] **Step 4: Write the expansion**

Create `packages/project/src/architecture/expand.ts`:

```typescript
import type { Circuit, IntentNet, PartInstance } from '@makerlord/circuit';
import type { Project } from '../model.js';

/**
 * Spec §5.4. Blocks are retained, not consumed: each PartInstance carries the
 * blockId it came from, which is how the hierarchical schematic (D27) knows
 * which sheet a part belongs on.
 */
export function expandArchitecture(project: Project): Circuit {
  const parts: PartInstance[] = [];
  const firstRefOf = new Map<string, string>();
  let n = 0;

  for (const block of project.architecture.blocks) {
    if (block.sourcing.type === 'undecided') {
      throw new Error(
        `expandArchitecture: block "${block.id}" is undecided — choose buy or ` +
          'build before expanding',
      );
    }
    const defIds =
      block.sourcing.type === 'buy'
        ? [block.sourcing.partId]
        : block.sourcing.partIds;

    for (const defId of defIds) {
      n += 1;
      const ref = `${block.id.toUpperCase()}${n}`;
      parts.push({ ref, defId, blockId: block.id });
      if (!firstRefOf.has(block.id)) firstRefOf.set(block.id, ref);
    }
  }

  const intent: IntentNet[] = project.architecture.links.map((link, i) => {
    const fromRef = firstRefOf.get(link.from.blockId);
    const toRef = firstRefOf.get(link.to.blockId);
    if (!fromRef) {
      throw new Error(
        `expandArchitecture: link references unknown block "${link.from.blockId}"`,
      );
    }
    if (!toRef) {
      throw new Error(
        `expandArchitecture: link references unknown block "${link.to.blockId}"`,
      );
    }
    return {
      name: `net_${i}_${link.from.interfaceId}`,
      members: [
        { ref: fromRef, pin: link.from.interfaceId },
        { ref: toRef, pin: link.to.interfaceId },
      ],
    };
  });

  return { boardId: 'half', parts, wires: [], intent };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/project/test/expand.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/project/src/architecture/expand.ts packages/circuit/src/model.ts packages/project/test/expand.test.ts
git commit -m "feat(project): expand architecture blocks into a circuit"
```

---

### Task 12: Front-door regression corpus and public surface

**Files:**
- Modify: `packages/project/src/index.ts`
- Test: `packages/project/test/front-door-corpus.test.ts`

**Interfaces:**
- Consumes: everything
- Produces: the package's public surface

**This is the front door's Tier 1.** Each case is an end-to-end project fixture that must produce the expected verdict. Spec §6.

- [ ] **Step 1: Write the corpus**

Create `packages/project/test/front-door-corpus.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { PartDefinition } from '@makerlord/parts';
import {
  architectureGateOpens, checkArchitecture,
} from '../src/architecture/rules.js';
import { checkRequirements, makeProjectContext } from '../src/requirements/rules.js';
import { expandArchitecture } from '../src/architecture/expand.js';
import { slotsFor, suggestArchetype } from '../src/requirements/archetypes.js';
import type { Block, BlockLink } from '../src/architecture/types.js';
import { ESP32_PROFILE, AA_PROFILE, projectWith, req } from './fixtures.js';

const ESP32_DEF: PartDefinition = {
  id: 'esp32', title: 'ESP32 DevKit', family: 'microcontroller board',
  properties: {},
  pins: [
    { id: 'c0', name: 'GND', role: 'gnd' },
    { id: 'c1', name: '3V3', role: 'supply' },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `io${i}`, name: `D${i}`, role: 'io' as const,
    })),
  ],
  buses: [], views: {},
};

function ctxOf(project: ReturnType<typeof projectWith>) {
  return makeProjectContext(
    project,
    new Map([['esp32', ESP32_DEF]]),
    new Map([['esp32', ESP32_PROFILE], ['aa-2x', AA_PROFILE]]),
  );
}

const battery: Block = {
  id: 'supply', name: 'power',
  sourcing: { type: 'buy', partId: 'aa-2x' },
  interfaces: [
    { id: 'out', kind: 'power', direction: 'provides', voltageV: 3.3, currentMa: 200 },
  ],
  power: { activeMa: 0, sleepMa: 0 },
};

const mcu: Block = {
  id: 'mcu', name: 'mcu',
  sourcing: { type: 'buy', partId: 'esp32' },
  interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes', voltageV: 3.3 }],
  power: { activeMa: 80, sleepMa: 0.01 },
};

const powered: BlockLink = {
  from: { blockId: 'supply', interfaceId: 'out' },
  to: { blockId: 'mcu', interfaceId: 'vin' },
};

const timing = [
  req({ id: 'si', metric: 'sample_interval', value: 3600, unit: 's' }),
  req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
  req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
];

const runtime6mo = req({
  id: 'rt', metric: 'battery_runtime', comparator: '>=',
  value: 6, unit: 'months', consumedBy: ['CHECK_POWER_BUDGET'],
});

describe('Front door — the good path', () => {
  it('an hourly soil sensor on 2×AA passes every architecture check', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], [powered]);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings).toEqual([]);
    expect(architectureGateOpens(findings)).toBe(true);
  });

  it('and expands into a circuit that keeps its block grouping', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], [powered]);
    const circuit = expandArchitecture(p);
    expect(circuit.parts.map((x) => x.blockId).sort()).toEqual(['mcu', 'supply']);
    expect(circuit.intent).toHaveLength(1);
  });
});

describe('Front door — cases that must be caught', () => {
  it('per-minute sampling cannot meet a 6-month runtime', () => {
    const perMinute = [
      req({ id: 'si', metric: 'sample_interval', value: 60, unit: 's' }),
      req({ id: 'ad', metric: 'active_duration', value: 3, unit: 's' }),
      req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
    ];
    const p = projectWith([...perMinute, runtime6mo], [battery, mcu], [powered]);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings.map((f) => f.ruleId)).toContain('ARCH_REQUIREMENT_UNSATISFIED');
    expect(architectureGateOpens(findings)).toBe(false);
  });

  it('an unpowered block is caught before anything is bought', () => {
    const p = projectWith([...timing, runtime6mo], [battery, mcu], []);
    const findings = checkArchitecture(ctxOf(p));
    expect(findings.map((f) => f.ruleId)).toContain('ARCH_INTERFACE_UNMET');
    expect(architectureGateOpens(findings)).toBe(false);
  });

  it('a 5 V supply into a 3V3 board is caught', () => {
    const wrong: Block = {
      ...battery,
      interfaces: [
        { id: 'out', kind: 'power', direction: 'provides', voltageV: 5, currentMa: 200 },
      ],
    };
    const p = projectWith([...timing, runtime6mo], [wrong, mcu], [powered]);
    expect(checkArchitecture(ctxOf(p)).map((f) => f.ruleId)).toContain(
      'ARCH_VOLTAGE_MISMATCH',
    );
  });

  it('a requirement with no unit blocks before architecture is reached', () => {
    const p = projectWith([req({ id: 'vague', unit: '' })], [], []);
    expect(checkRequirements(ctxOf(p)).map((f) => f.ruleId)).toContain(
      'REQ_NOT_MEASURABLE',
    );
  });

  it('an undecided block cannot be expanded', () => {
    const undecided: Block = {
      id: 'psu', name: 'psu', sourcing: { type: 'undecided' }, interfaces: [],
    };
    expect(() => expandArchitecture(projectWith([], [undecided], []))).toThrow();
  });
});

describe('Front door — provenance bounds severity (spec §4)', () => {
  it('an assumed duty cycle degrades the runtime finding to WARNING', () => {
    // No sample_interval/active_duration -> duty is assumed always-on.
    const p = projectWith(
      [req({ id: 'cap', metric: 'supply_capacity', value: 2800, unit: 'mAh' }),
       runtime6mo],
      [battery, mcu], [powered],
    );
    const findings = checkArchitecture(ctxOf(p));
    const rt = findings.find((f) => f.ruleId === 'ARCH_REQUIREMENT_UNSATISFIED')!;
    expect(rt.severity).toBe('WARNING');
    expect(rt.message).toMatch(/assumed/i);
    expect(architectureGateOpens(findings)).toBe(true);   // WARNING must not gate
  });
});

describe('Front door — elicitation', () => {
  it('a soil sensor intent suggests the sensor-node archetype', () => {
    const a = suggestArchetype('a soil moisture sensor for Home Assistant');
    expect(a?.id).toBe('sensor-node');
    expect(slotsFor(a?.id).some((s) => s.metric === 'battery_runtime')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/project/test/front-door-corpus.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 3: Export the public surface**

Replace `packages/project/src/index.ts`:

```typescript
export * from './model.js';

export * from './requirements/types.js';
export * from './requirements/schema.js';
export * from './requirements/rules.js';
export * from './requirements/archetypes.js';

export * from './architecture/types.js';
export * from './architecture/context.js';
export * from './architecture/power.js';
export * from './architecture/evaluators.js';
export * from './architecture/rules.js';
export * from './architecture/expand.js';

export * from './feasibility/types.js';
export * from './feasibility/schema.js';
```

- [ ] **Step 4: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: all tests PASS across all three packages; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/project/test/front-door-corpus.test.ts packages/project/src/index.ts
git commit -m "test(project): front-door regression corpus and public surface"
```

---

## Spec coverage

| Spec section | Tasks |
|---|---|
| §2 model — Project, inventory | 1 |
| §2.1 Requirement + measurability | 2 |
| §2.2 Block, Interface, Sourcing | 1, 6 |
| §2.3 Feasibility with graded evidence | 9 |
| §2.4 Inventory | 1 |
| §3.1 requirement rules | 3 |
| §3.2 architecture rules + severity degradation | 6, 7, 8 |
| §3.3 `ARCH_REQUIREMENT_UNSATISFIED` worked case | 4, 5, 7 |
| §3.4 provenance of computed inputs | 4, 7 |
| §3.5 feasibility validated at the boundary | 9 |
| §4 provenance bounds severity | 4 (`severityForComputed`), 12 |
| §5.2 universal core + archetypes | 10 |
| §5.4 block → circuit handoff | 11 |
| §6 testing | every task, plus 12 |
| §7 error handling — assumed defaults, orphans, undecided refusal | 3, 4, 7, 10, 11 |

**Deliberately not built here** (spec §8): the conversational surface and
artifact panel (UI slice), the MCP tool wrappers
([ai-implementation.md](../../ai-implementation.md) §2 — these functions are
what those tools will call), live pricing (Slice 2), and persona prose (D38).

`research_prior_art` is not a task: it is a thin wrapper over web search whose
only testable contract — *claims carry evidence* — is enforced by Task 9's
schema. Spec §6 records this as a deliberate gap.
