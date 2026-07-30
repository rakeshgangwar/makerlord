#!/usr/bin/env node
/**
 * The protected-tail eval (deferred-work §A): does a REAL server-side
 * compaction (beta compact-2026-01-12) preserve the facts our local
 * compaction guarantees verbatim — the current build step, the open
 * BLOCKER, the last measurements?
 *
 * Method: ~55k tokens of realistic bench chatter with three protected
 * facts planted ONCE, early — then a request over the 50k minimum trigger
 * that asks for them back. The compaction block must appear (proof the
 * path ran) and the answer shows what the summary kept.
 *
 *   set -a && . /opt/makerlord/.env && set +a && node scripts/eval-compaction.mjs
 *
 * Cost: one ~55k-input-token request.
 */
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('eval-compaction: ANTHROPIC_API_KEY is not set');
  process.exit(1);
}
const MODEL = process.env.MAKERLORD_MODEL ?? 'claude-opus-5';

// The three facts the local protected tail would carry verbatim.
const FACTS = {
  step: 'build step 7: seat the LD1117V33 regulator across G21-G23',
  blocker: 'OPEN BLOCKER RULE_LED_NO_CURRENT_LIMIT: LED1 anode reaches 5V with no series resistance',
  measurement: 'Measured supply_voltage: 5.02 V',
};

// Shape matters: hundreds of PREFILLED assistant turns read as synthetic
// and drew a classifier refusal twice (2026-07-30) — which returns an
// EMPTY compaction block. A long pasted bench journal in a few user turns
// is both realistic and acceptable.
const messages = [
  { role: 'user', content: 'We are prototyping. Current state: ' + Object.values(FACTS).join('. ') },
  { role: 'assistant', content: 'Noted — step 7, one open blocker, supply at 5.02 V.' },
];

// ~55k tokens of plausible bench back-and-forth (varied, not repetitive
// enough to be summarized down to nothing).
const topics = [
  'breadboard bus topology', 'decoupling placement', 'servo stall current',
  'DHT22 pull-up sizing', 'battery internal resistance', 'LED forward drop',
  'wire gauge for 800 mA', 'multimeter continuity mode', 'ngspice op analysis',
  'flyback diode orientation',
];
// Varied, organic filler — verbatim repetition reads as degenerate text
// and can draw a classifier refusal, which voids the whole eval.
const angles = [
  'datasheet absolute maximums', 'thermal derating', 'tolerance stacking',
  'transient behaviour at power-on', 'measurement technique', 'layout parasitics',
  'failure modes seen on real benches', 'cost/availability trade-offs',
];
// Padding calibration (2026-07-30, all on claude-opus-5): a synthetic
// numeric "journal" and mass-prefilled assistant turns both drew classifier
// refusals at scale; plain repeated filler in ONE user message compacted
// cleanly. The padding's job is bulk, not plausibility — keep it dumb.
messages.push(
  { role: 'user', content:
    'Archiving my raw bench-notes scratch file here so it is in the ' +
    'conversation record. It is mostly noise, no need to analyse it:\n\n' +
    'checked wiring rechecked meter probes swapped leads noted drift '.repeat(7000) },
  { role: 'assistant', content: 'Archived. I will ignore the noise.' },
);
messages.push({
  role: 'user',
  content:
    'Before we continue: state exactly (1) the current build step, (2) the ' +
    'open blocker rule id, (3) the measured supply_voltage value. Quote them.',
});

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'compact-2026-01-12',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 500,
    messages,
    context_management: {
      edits: [{ type: 'compact_20260112', trigger: { type: 'input_tokens', value: 50_000 } }],
    },
  }),
});
const msg = await res.json();
if (!res.ok) {
  console.error('request failed:', JSON.stringify(msg));
  process.exit(1);
}

const compaction = (msg.content ?? []).find((b) => b.type === 'compaction');
const text = (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
console.log(`model: ${MODEL}`);
console.log(`stop_reason: ${msg.stop_reason}`);
console.log(`blocks: ${(msg.content ?? []).map((b) => b.type).join(', ')}`);
console.log(`input tokens: ${msg.usage?.input_tokens}`);
console.log(`compaction block present: ${compaction ? 'YES' : 'NO'}`);
if (compaction) {
  console.log(`compaction summary length: ${String(compaction.content ?? '').length} chars`);
  for (const [name, fact] of Object.entries(FACTS)) {
    const inSummary = String(compaction.content ?? '').includes(
      name === 'blocker' ? 'RULE_LED_NO_CURRENT_LIMIT'
      : name === 'measurement' ? '5.02'
      : 'step 7');
    console.log(`  summary carries ${name}: ${inSummary ? 'yes' : 'NO'}`);
  }
}
console.log('\n--- model answer ---\n' + text + '\n--------------------');
const recalled = {
  step: /step 7/i.test(text),
  blocker: /RULE_LED_NO_CURRENT_LIMIT/.test(text),
  measurement: /5\.02/.test(text),
};
console.log('round-1 recall (may still see full context):', JSON.stringify(recalled));

if (!compaction) {
  console.log('\nVERDICT: NO-COMPACTION — trigger not reached or param ignored');
  process.exit(1);
}
console.log('compaction content typeof:', typeof compaction.content,
  '— raw:', JSON.stringify(compaction.content).slice(0, 200));

// ── round 2: THE test. Appending the response makes the API drop every
// block before the compaction block — the summary is now the only carrier
// of the early history. If the facts answer here, they truly survived.
messages.push(
  { role: 'assistant', content: msg.content },
  { role: 'user', content:
    'One more check of the record: state again exactly (1) the current ' +
    'build step, (2) the open blocker rule id, (3) the measured ' +
    'supply_voltage value.' },
);
const res2 = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'compact-2026-01-12',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 500,
    messages,
    context_management: {
      edits: [{ type: 'compact_20260112', trigger: { type: 'input_tokens', value: 50_000 } }],
    },
  }),
});
const msg2 = await res2.json();
if (!res2.ok) {
  console.error('round 2 failed:', JSON.stringify(msg2));
  process.exit(1);
}
const text2 = (msg2.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
console.log(`\nround-2 input tokens: ${msg2.usage?.input_tokens} (post-drop) · stop: ${msg2.stop_reason}`);
console.log('--- round-2 answer ---\n' + text2 + '\n----------------------');
const recalled2 = {
  step: /step 7/i.test(text2),
  blocker: /RULE_LED_NO_CURRENT_LIMIT/.test(text2),
  measurement: /5\.02/.test(text2),
};
console.log('recall from the summary alone:', JSON.stringify(recalled2));
console.log(Object.values(recalled2).every(Boolean)
  ? '\nVERDICT: PASS — the protected facts survive a real server-side compaction'
  : '\nVERDICT: PARTIAL — compaction ran but the summary lost a protected fact (local tail stays mandatory)');
