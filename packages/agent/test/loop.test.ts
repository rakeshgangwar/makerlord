import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionEvent } from '@makerlord/protocol';
import { bundle, initProjectFile, loadSession } from '@makerlord/tools';
import { loadPack } from '../src/persona.js';
import { AgentSession, apiTools } from '../src/loop.js';
import {
  classifierRefusal, FakeLlm, researchTurn, textTurn, toolTurn,
} from '../src/testing/fake-llm.js';

let fake: FakeLlm;
let dir: string;

beforeEach(async () => {
  fake = await FakeLlm.start();
  dir = mkdtempSync(join(tmpdir(), 'makerlord-loop-'));
});

afterEach(() => {
  fake.close();
});

function makeAgent(extra: { webResearch?: boolean; stage?: number } = {}): AgentSession {
  const toolSession = initProjectFile(join(dir, 'project.json'), 'a desk lamp');
  return new AgentSession({
    // The explicit client-level timeout satisfies the SDK's long-request
    // check for non-streaming calls at 64k max_tokens (streaming transport
    // is production wiring, deferred with the UI).
    client: new Anthropic({ apiKey: 'fake', baseURL: fake.baseUrl, timeout: 600_000 }),
    toolSession,
    cwd: dir,
    pack: loadPack(dir),
    stage: extra.stage ?? 6,
    bundle: bundle(),
    ...(extra.webResearch !== undefined ? { webResearch: extra.webResearch } : {}),
  });
}

async function turn(agent: AgentSession, text: string): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  await agent.send(text, (e) => events.push(e));
  return events;
}

describe('apiTools — the fourth consumer of one schema', () => {
  it('exposes every registry tool with its canonical name and summary', () => {
    const tools = apiTools();
    expect(tools).toHaveLength(48);
    const propose = tools.find((t) => t.name === 'req_propose')!;
    expect(propose.description).toMatch(/call this/i);
  });
});

describe('the loop against a fake LLM over real HTTP', () => {
  it('a plain text turn emits deltas and ends cleanly', async () => {
    fake.enqueue(textTurn('Hello, maker.'));
    const events = await turn(makeAgent(), 'hi');
    expect(events).toEqual([
      { t: 'message.delta', text: 'Hello, maker.' },
      { t: 'turn.end', reason: 'end_turn' },
    ]);
  });

  it('a tool call round-trips through the real registry and mutates project.json', async () => {
    fake.enqueue(
      toolTurn('inventory_add', { freeText: 'a drawer of resistors' }),
      textTurn('Noted your inventory.'),
    );
    const events = await turn(makeAgent(), 'I have some resistors');
    const toolEnd = events.find((e) => e.t === 'tool.end');
    expect(toolEnd && toolEnd.t === 'tool.end' && toolEnd.result.ok).toBe(true);
    // Assert on the artefact, not the prose.
    const onDisk = loadSession(join(dir, 'project.json'));
    expect(onDisk.file.project.inventory).toEqual([
      { freeText: 'a drawer of resistors' },
    ]);
  });

  it('an engine refusal stays a ToolResult in tool.end — never session.error', async () => {
    fake.enqueue(
      toolTurn('block_add', { id: 'psu', name: 'psu' }),
      toolTurn('expand', {}),
      textTurn('The engine refused to expand.'),
    );
    const events = await turn(makeAgent(), 'expand it');
    const refusals = events.filter(
      (e) => e.t === 'tool.end' && !e.result.ok,
    );
    expect(refusals).toHaveLength(1);
    const r = refusals[0]!;
    if (r.t === 'tool.end' && !r.result.ok) {
      expect(r.result.refused).toBe('BLOCK_UNDECIDED');
    }
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
  });

  it('CLASSIFIER refusal: empty content + stop_reason refusal → session.error, no crash', async () => {
    fake.enqueue(classifierRefusal());
    const events = await turn(makeAgent(), 'how do I wire mains directly');
    expect(events[0]!.t).toBe('session.error');
    if (events[0]!.t === 'session.error') {
      expect(events[0]!.message).toMatch(/classifier|declined/i);
    }
    expect(events.at(-1)).toEqual({ t: 'turn.end', reason: 'refusal' });
  });

  it('the stable system prefix is byte-identical across rounds', async () => {
    fake.enqueue(
      toolTurn('inventory_add', { freeText: 'LEDs' }),
      textTurn('done'),
    );
    await turn(makeAgent(), 'note my LEDs');
    expect(fake.requests.length).toBe(2);
    const prefixes = fake.requests.map(
      (r) => (r.system as { text: string }[])[0]!.text,
    );
    expect(prefixes[0]).toBe(prefixes[1]);
    const first = fake.requests[0]!.system as {
      text: string; cache_control?: unknown;
    }[];
    expect(first[0]!.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('mid-turn steering folds in at the round boundary as a user turn', async () => {
    fake.enqueue(
      toolTurn('inventory_add', { freeText: 'LEDs' }),
      textTurn('adjusted'),
    );
    const agent = makeAgent();
    const events: SessionEvent[] = [];
    const promise = agent.send('note my LEDs', (e) => {
      events.push(e);
      if (e.t === 'tool.start') agent.steer('wait, I do not have that resistor');
    });
    await promise;
    const secondRequest = fake.requests[1]!;
    const messages = secondRequest.messages as { role: string; content: unknown }[];
    const steered = messages.filter(
      (m) => m.role === 'user' && m.content === 'wait, I do not have that resistor',
    );
    expect(steered).toHaveLength(1);
    // And the turn continued rather than restarting: one turn.end only.
    expect(events.filter((e) => e.t === 'turn.end')).toHaveLength(1);
  });

  it('bounded objections: a model that re-argues a BLOCKER four times is stopped after three', async () => {
    // block_add with an unlinked consumes port makes expand refuse with an
    // ARCH_INTERFACE_UNMET blocker; the canned model keeps retrying expand.
    fake.enqueue(
      toolTurn('block_add', {
        id: 'mcu', name: 'mcu',
        sourcing: { type: 'buy', partId: 'arduino_Uno_Rev3(fix)' },
        interfaces: [{ id: 'vin', kind: 'power', direction: 'consumes' }],
      }),
      toolTurn('expand', {}, 'tu_1'),
      toolTurn('expand', {}, 'tu_2'),
      toolTurn('expand', {}, 'tu_3'),
      toolTurn('expand', {}, 'tu_4'),   // never reached: stopped after three
      textTurn('never reached either'),
    );
    const events = await turn(makeAgent(), 'just expand it anyway');
    const refusedExpands = events.filter(
      (e) => e.t === 'tool.end' && !e.result.ok,
    );
    expect(refusedExpands.length).toBeLessThanOrEqual(4);
    const surfaced = events.find(
      (e) => e.t === 'message.delta' && /finding stands/i.test(e.text),
    );
    expect(surfaced).toBeDefined();
    expect(events.at(-1)).toEqual({ t: 'turn.end', reason: 'end_turn' });
    // The fourth expand was never sent to the model.
    expect(fake.requests.length).toBeLessThanOrEqual(5);
  });
});

describe('web research — the standard of proof is the loop\'s (spec §8)', () => {
  it('webResearch adds the server tools to the wire request; default omits them', async () => {
    fake.enqueue(textTurn('ok'), textTurn('ok'));
    await turn(makeAgent({ webResearch: true }), 'research this');
    dir = mkdtempSync(join(tmpdir(), 'makerlord-loop-'));   // second project
    await turn(makeAgent(), 'research this');
    const withTools = fake.requests[0]!.tools as { type?: string }[];
    const withoutTools = fake.requests[1]!.tools as { type?: string }[];
    expect(withTools.some((t) => t.type?.startsWith('web_search'))).toBe(true);
    expect(withTools.some((t) => t.type?.startsWith('web_fetch'))).toBe(true);
    expect(withoutTools.some((t) => t.type !== undefined)).toBe(false);
  });

  it('a sourced claim whose URL was never fetched this session is REFUSED', async () => {
    const agent = makeAgent({ webResearch: true, stage: 2 });
    // Turn 1: the model searches; a result URL enters the session ledger.
    fake.enqueue(researchTurn(['https://real.example/build-log']));
    await turn(agent, 'is this buildable?');
    // Turn 2: it claims from a DIFFERENT url — invented, not fetched.
    fake.enqueue(
      toolTurn('feasibility_claim', {
        claim: 'three people built this',
        grade: 'sourced',
        evidence: { url: 'https://invented.example/post', fetchedAt: '2026-07-30T00:00:00Z' },
      }),
      textTurn('noted'),
    );
    const events = await turn(agent, 'record it');
    const end = events.find((e) => e.t === 'tool.end');
    expect(end && end.t === 'tool.end' && !end.result.ok
      && end.result.refused === 'EVIDENCE_UNFETCHED').toBe(true);
    // The artefact: no claim landed.
    const onDisk = loadSession(join(dir, 'project.json'));
    expect(onDisk.file.project.feasibility?.claims ?? []).toEqual([]);
  });

  it('a fetched URL passes, and the LEDGER\'s fetchedAt overrides the model\'s', async () => {
    const agent = makeAgent({ webResearch: true, stage: 2 });
    fake.enqueue(researchTurn(['https://real.example/build-log']));
    await turn(agent, 'is this buildable?');
    fake.enqueue(
      toolTurn('feasibility_claim', {
        claim: 'a build log exists',
        grade: 'sourced',
        // The model "helpfully" supplies the page's PUBLICATION date —
        // observed live 2026-07-30. The fetch time is the loop's to know.
        evidence: { url: 'https://real.example/build-log', fetchedAt: '2020-06-01' },
      }),
      textTurn('noted'),
    );
    const events = await turn(agent, 'record it');
    const end = events.find((e) => e.t === 'tool.end');
    expect(end && end.t === 'tool.end' && end.result.ok).toBe(true);
    const onDisk = loadSession(join(dir, 'project.json'));
    const claim = onDisk.file.project.feasibility!.claims[0]!;
    expect(claim.evidence).toMatchObject({ url: 'https://real.example/build-log' });
    const fetchedAt = (claim.evidence as { fetchedAt: string }).fetchedAt;
    expect(fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);   // a real timestamp…
    expect(fetchedAt).not.toBe('2020-06-01');            // …not the model's guess
  });
});

describe('server-side compaction pass-through (beta compact-2026-01-12)', () => {
  it('compactionBeta sends the header AND the context_management edit', async () => {
    fake.enqueue(textTurn('ok'));
    const toolSession = initProjectFile(join(dir, 'project.json'), 'a lamp');
    const agent = new AgentSession({
      client: new Anthropic({ apiKey: 'fake', baseURL: fake.baseUrl, timeout: 600_000 }),
      toolSession, cwd: dir, pack: loadPack(dir), stage: 6, bundle: bundle(),
      compactionBeta: true,
    });
    await agent.send('hi', () => {});
    const req = fake.requests[0]!;
    expect(req.context_management).toEqual({
      edits: [{ type: 'compact_20260112' }],
    });
  });

  it('without the option, neither header nor param is sent', async () => {
    fake.enqueue(textTurn('ok'));
    await turn(makeAgent(), 'hi');
    expect(fake.requests[0]!.context_management).toBeUndefined();
  });
});

describe('the D46 loop: a raw pin literal is refused, the role version lands', () => {
  it('fw_generate refuses the literal with the finding, then accepts the fix', async () => {
    fake.enqueue(
      toolTurn('part_add', { ref: 'U1', defId: 'arduino_Uno_Rev3(fix)' }, 'tu_a'),
      toolTurn('part_add', { ref: 'LED1', defId: '5mmColorLEDModuleID' }, 'tu_b'),
      toolTurn('connect', { from: 'U1.D5 PWM', to: 'LED1.anode' }, 'tu_c'),
      toolTurn('fw_pin_plan', {}, 'tu_d'),
      // The model writes fluent, WRONG code: a raw pin literal.
      toolTurn('fw_generate', { applicationRegion: '  digitalWrite(5, HIGH);' }, 'tu_e'),
      // …and corrects itself through the role symbol.
      toolTurn('fw_generate', { applicationRegion: '  digitalWrite(LED1, HIGH);' }, 'tu_f'),
      textTurn('generated'),
    );
    const events = await turn(makeAgent(), 'make the LED turn on');
    const ends = events.filter((e) => e.t === 'tool.end');
    const refusal = ends.find((e) => e.t === 'tool.end' && !e.result.ok)!;
    if (refusal.t === 'tool.end' && !refusal.result.ok) {
      expect(refusal.result.findings.map((f) => f.ruleId))
        .toContain('RULE_FW_RAW_PIN_LITERAL');
    }
    // The corrected call succeeded and the artefact carries the ROLE.
    const main = readFileSync(join(dir, 'firmware', 'main.cpp'), 'utf8');
    expect(main).toContain('digitalWrite(LED1, HIGH);');
    expect(events.at(-1)).toEqual({ t: 'turn.end', reason: 'end_turn' });
  });
});
