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
    expect(tools).toHaveLength(50);
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

describe('profile_propose citations face the fetched-URL ledger too', () => {
  it('an uncited-in-session URL is refused; a fetched one passes', async () => {
    // Guard: if adjudication ever regresses and the tool executes, the
    // proposal must land in a scratch dir, never the repo's real queue.
    process.env.MAKERLORD_PROPOSALS_PATH = mkdtempSync(join(tmpdir(), 'makerlord-prop-'));
    const agent = makeAgent({ webResearch: true, stage: 2 });
    fake.enqueue(researchTurn(['https://real.example/buzzer.pdf']));
    await turn(agent, 'research the buzzer');
    fake.enqueue(
      toolTurn('profile_propose', {
        file: 'core/Buzzer-v15.fzp',
        partId: 'Buzzer-v15',
        profile: {
          partId: 'Buzzer-v15',
          footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
          absMaxVoltageV: 5.0,
          hazardClass: 'none',
        },
        citations: { absMaxVoltageV: 'https://invented.example/nope.pdf' },
      }, 'tu_bad'),
      textTurn('hm'),
    );
    const events = await turn(agent, 'file it');
    const end = events.find((e) => e.t === 'tool.end');
    expect(end && end.t === 'tool.end' && !end.result.ok
      && end.result.refused === 'EVIDENCE_UNFETCHED').toBe(true);
    delete process.env.MAKERLORD_PROPOSALS_PATH;
  });
});

describe('upload citations face the READ ledger (curation spec §3.5)', () => {
  it('unread upload → EVIDENCE_UNFETCHED; after datasheet_read it passes', async () => {
    const { saveDatasheet } = await import('@makerlord/parts');
    process.env.MAKERLORD_DATASHEETS_PATH = mkdtempSync(join(tmpdir(), 'makerlord-updl-'));
    process.env.MAKERLORD_PROPOSALS_PATH = mkdtempSync(join(tmpdir(), 'makerlord-updp-'));
    try {
      const { ref } = saveDatasheet(readFileSync(
        new URL('../../tools/test/fixtures/mini-datasheet.pdf', import.meta.url)) as Buffer);
      const propose = (id: string) => toolTurn('profile_propose', {
        file: 'core/Buzzer-v15.fzp',
        partId: 'Buzzer-v15',
        profile: {
          partId: 'Buzzer-v15',
          footprint: { pins: { '+': [0, 0], '-': [0, 1] } },
          absMaxVoltageV: 5.0,
          hazardClass: 'none',
        },
        citations: { absMaxVoltageV: ref },
      }, id);

      const agent = makeAgent();
      // Cite WITHOUT reading: refused by the loop's ledger.
      fake.enqueue(propose('tu_unread'), textTurn('hm'));
      const first = await turn(agent, 'file it blind');
      const refusal = first.find((e) => e.t === 'tool.end');
      expect(refusal && refusal.t === 'tool.end' && !refusal.result.ok
        && refusal.result.refused === 'EVIDENCE_UNFETCHED').toBe(true);

      // Read, then cite: the ledger has it; the proposal lands.
      fake.enqueue(
        toolTurn('datasheet_read', { ref }, 'tu_read'),
        propose('tu_cited'),
        textTurn('filed'),
      );
      const second = await turn(agent, 'read it properly, then file');
      const ends = second.filter((e) => e.t === 'tool.end');
      expect(ends.every((e) => e.t === 'tool.end' && e.result.ok)).toBe(true);
    } finally {
      delete process.env.MAKERLORD_DATASHEETS_PATH;
      delete process.env.MAKERLORD_PROPOSALS_PATH;
    }
  });
});

describe('code-execution containers — the API runs it unasked (Opus 5)', () => {
  it('the container id echoes on the next request', async () => {
    fake.enqueue(
      {
        content: [
          { type: 'server_tool_use', id: 'ce_1', name: 'code_execution', input: {} },
          { type: 'code_execution_tool_result', tool_use_id: 'ce_1', content: { type: 'code_execution_result', stdout: 'ok' } },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
        container: { id: 'cont_abc123' },
      },
      textTurn('done'),
    );
    await turn(makeAgent(), 'note my LEDs after computing something');
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]!.container).toBe('cont_abc123');
    expect(fake.requests[0]!.container).toBeUndefined();
  });

  it('a container 400 self-heals: pending code-exec blocks stripped, retried', async () => {
    fake.enqueue(
      // A poisoned shape: code-exec tool_use WITHOUT its result, plus a
      // client tool call — and no container captured (restart amnesia).
      {
        content: [
          { type: 'server_tool_use', id: 'ce_9', name: 'code_execution', input: {} },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      { content: [], stop_reason: 'end_turn',
        apiError: { status: 400, message: 'container_id is required when there are pending tool uses generated by code execution with tools.' } },
      textTurn('recovered'),
    );
    const events = await turn(makeAgent(), 'note my LEDs');
    // No session.error: the loop healed and finished the turn.
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
    expect(events.at(-1)).toEqual({ t: 'turn.end', reason: 'end_turn' });
    // The retried request no longer carries the pending code-exec block.
    const last = fake.requests.at(-1)!;
    const history = JSON.stringify(last.messages);
    expect(history).not.toContain('code_execution');
  });
});

describe('pending code-exec without a captured container never reaches the wire', () => {
  it('proactive strip: no container in the response → the block is dropped at push time', async () => {
    fake.enqueue(
      // The live failure shape: pending code-exec + a client tool, and the
      // response carries NO container id we can resume with.
      {
        content: [
          { type: 'server_tool_use', id: 'ce_x', name: 'code_execution', input: {} },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      textTurn('done'),
    );
    const events = await turn(makeAgent(), 'note my LEDs');
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
    // The follow-up request went out WITHOUT the unresumable block.
    const second = fake.requests[1]!;
    expect(JSON.stringify(second.messages)).not.toContain('code_execution');
    expect(second.container).toBeUndefined();
  });

  it('resolved code-exec (result in the same message) is kept — only PENDING strips', async () => {
    fake.enqueue(
      {
        content: [
          { type: 'server_tool_use', id: 'ce_ok', name: 'code_execution', input: {} },
          { type: 'code_execution_tool_result', tool_use_id: 'ce_ok', content: { stdout: '42' } },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      textTurn('done'),
    );
    const events = await turn(makeAgent(), 'note my LEDs');
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
    const second = fake.requests[1]!;
    expect(JSON.stringify(second.messages)).toContain('ce_ok');   // pair intact
  });
});

describe('the live lessons: sub-tool names and giant blocks', () => {
  it('ANY pending server_tool_use strips, whatever its name', async () => {
    fake.enqueue(
      {
        content: [
          { type: 'server_tool_use', id: 'ce_b', name: 'bash_code_execution', input: {} },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      textTurn('done'),
    );
    const events = await turn(makeAgent(), 'note my LEDs');
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
    expect(JSON.stringify(fake.requests[1]!.messages)).not.toContain('bash_code_execution');
  });

  it('a resolved server pair stays, matched by tool_use_id not name', async () => {
    fake.enqueue(
      {
        content: [
          { type: 'server_tool_use', id: 'ce_c', name: 'bash_code_execution', input: {} },
          { type: 'bash_code_execution_tool_result', tool_use_id: 'ce_c', content: { stdout: 'hi' } },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      textTurn('done'),
    );
    await turn(makeAgent(), 'note my LEDs');
    expect(JSON.stringify(fake.requests[1]!.messages)).toContain('ce_c');
  });

  it('a giant fetched block is clipped at push — the 413 never forms', async () => {
    const giant = 'z'.repeat(1_500_000);
    fake.enqueue(
      {
        content: [
          { type: 'server_tool_use', id: 'wf_1', name: 'web_fetch', input: {} },
          { type: 'web_fetch_tool_result', tool_use_id: 'wf_1',
            content: { url: 'https://x.example/big.pdf', content: { text: giant } } },
          { type: 'tool_use', id: 'tu_inv', name: 'inventory_add', input: { freeText: 'LEDs' } },
        ],
        stop_reason: 'tool_use',
      },
      textTurn('done'),
    );
    const events = await turn(makeAgent(), 'note my LEDs');
    expect(events.some((e) => e.t === 'session.error')).toBe(false);
    const wire = JSON.stringify(fake.requests[1]!.messages);
    expect(wire.length).toBeLessThan(600_000);
    expect(wire).toContain('clipped');
  });
});
