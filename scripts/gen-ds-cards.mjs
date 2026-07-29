#!/usr/bin/env node
/**
 * Generate components/<group>/<Name>/{.html,.d.ts,.prompt.md} for the
 * design-sync bundle. Sample props are real shapes from the app — the same
 * data the engine emits — so cards show the component doing its job.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('ds-bundle/components');

const FINDINGS = [
  { severity: 'BLOCKER', ruleId: 'RULE_LED_NO_CURRENT_LIMIT', message: 'LED1 has no series resistor between anode and the supply rail.', suggestedFix: 'Add ~220Ω in series with the LED.' },
  { severity: 'NOTE', ruleId: 'SIM_MODEL_MISSING', message: 'SUPPLY1 has no SPICE model — it was stubbed; results involving it are indicative only.' },
];
const MESSAGES = [
  { role: 'maker', text: 'Can the 9V battery drive four LEDs for a week of commutes?' },
  { role: 'agent', text: 'Yes, with ~6× margin: ~23mA total against ~500mAh is ~22 hours, and a week of 30-minute commutes needs 3.5.\n\nThe topology is two branches of two LEDs with 440Ω ballast each.' },
];
const BUILD = {
  currentStep: 1, gateOpen: false, measurements: [],
  steps: [
    { kind: 'POWER_OFF', instruction: 'Disconnect all power — unplug USB and remove any battery.' },
    { kind: 'GATE', instruction: 'Probe the supply rails before anything is energised.' },
    { kind: 'PLACE_PASSIVE', instruction: 'Place BRANCH_A2 at A3.' },
  ],
};
const PROJECT_FILE = {
  project: {
    requirements: [
      { metric: 'runtime', comparator: '>=', value: 3.5, unit: 'h', provenance: 'stated' },
      { metric: 'led_forward_current', comparator: '<=', value: 20, unit: 'mA', provenance: 'assumed' },
    ],
    architecture: { blocks: [
      { name: '9V battery block', sourcing: { type: 'buy', partId: '9v-battery' } },
      { name: 'LED branch A', sourcing: { type: 'build' } },
    ] },
    inventory: [{ freeText: 'Resistor assortment' }, { freeText: 'Solderless breadboard' }],
  },
};
const TOOLS = [
  { name: 'check_circuit', done: true },
  { name: 'sim_run', done: true },
  { name: 'gate_open', done: true, refused: 'BLOCKERS_UNRESOLVED' },
  { name: 'predict_dc', done: false },
];
const PROJECTS = [
  { projectId: 'bfbc67f82ea7e8ec', intent: 'a bright red rear light for my bicycle', updatedAt: '2026-07-29T12:00:00Z' },
  { projectId: '5444f646900a1200', intent: 'a soil moisture sensor for Home Assistant', updatedAt: '2026-07-29T09:00:00Z' },
];
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80" fill="#fff"/><polyline points="10,40 40,40 46,30 58,50 70,30 82,50 90,40 120,40" fill="none" stroke="#111" stroke-width="1.5"/><polygon points="130,32 130,48 145,40" fill="#111"/><line x1="145" y1="32" x2="145" y2="48" stroke="#111" stroke-width="1.5"/><line x1="145" y1="40" x2="180" y2="40" stroke="#111" stroke-width="1.5"/><polyline data-net="mid" points="120,40 130,40" fill="none" stroke="#0a7d33" stroke-width="1.5"/></svg>`;

const SPECS = [
  { name: 'StageRail', group: 'Shell', props: { stage: 5 }, w: 260, h: 620,
    dts: 'interface StageRailProps { /** 1–17; highlights that stage */ stage?: number }',
    doc: 'The 17-stage journey rail with resistor-colour phase bands. Pass `stage` to highlight where the maker is. Place it as the left column of every MakerLord screen.' },
  { name: 'FindingStrip', group: 'Shell', props: { findings: FINDINGS }, w: 900, h: 220,
    dts: `interface Finding { severity: 'REFUSE'|'BLOCKER'|'WARNING'|'NOTE'; ruleId: string; message: string; suggestedFix?: string }\ninterface FindingStripProps { findings?: Finding[] }`,
    doc: 'The safety instrument: a dark meter-face strip pinned to the BOTTOM of every screen. Empty array → "READY · no open findings". Findings render as cards with icon + label + colour — never add a dismiss/close control, and never hide the strip at any breakpoint.' },
  { name: 'BenchView', group: 'Views', props: { build: BUILD }, w: 700, h: 420,
    dts: `interface BuildStep { kind: string; instruction: string }\ninterface BenchViewProps { build?: { steps: BuildStep[]; currentStep: number; gateOpen: boolean; measurements: unknown[] } }`,
    doc: 'Build steps at arm\'s-length size: ONE current step large with a solder-mask border, the rest dimmed but visible. A GATE step at currentStep shows the measurement entry (the number comes before the prediction — never add a confirm/skip).' },
  { name: 'ChatDock', group: 'Shell', props: { messages: MESSAGES, open: true }, w: 700, h: 420,
    dts: `interface ChatMessage { role: 'maker'|'agent'; text: string }\ninterface ChatDockProps { messages?: ChatMessage[]; streaming?: string; open?: boolean }`,
    doc: 'The docked conversation used on inspect/bench/decide screens: sticky bottom bar with an expandable log. Pass `open` to show the log in a design.' },
  { name: 'ArtifactsPanel', group: 'Shell', props: { projectFile: PROJECT_FILE, tab: 'bench' }, w: 300, h: 480,
    dts: `interface ArtifactsPanelProps { projectFile?: { project: { requirements: any[]; architecture: { blocks: any[] }; inventory: any[] } }; tab?: 'bench'|'library'|'files' }`,
    doc: 'The right-hand panel: what\'s settled on the bench (requirements with provenance badges, blocks, inventory), the parts library, and the project files. Sits as the right column at ≥1100px.' },
  { name: 'Conversation', group: 'Conversation', props: { messages: MESSAGES }, w: 700, h: 460,
    dts: `interface ConversationProps { messages?: { role: 'maker'|'agent'; text: string }[]; streaming?: string }`,
    doc: 'The full-page chat for converse-posture screens (idea, feasibility, requirements): maker bubbles right in pale green, agent bubbles left on white, composer at the bottom.' },
  { name: 'ConverseStart', group: 'Conversation', props: { projects: PROJECTS }, w: 700, h: 560,
    dts: `interface ConverseStartProps { projects?: { projectId: string; intent: string; updatedAt: string }[] }`,
    doc: 'The front door: "What do you want to make?" hero with the intent box and the on-the-bench project list. This is the first screen of the app.' },
  { name: 'MessageList', group: 'Conversation', props: { list: MESSAGES, streaming: 'Checking the library for a red LED…' }, w: 640, h: 380,
    dts: `interface MessageListProps { list: { role: 'maker'|'agent'; text: string }[]; streaming?: string; cursor?: boolean }`,
    doc: 'Chat bubbles only — no composer. Agent markdown renders; a `streaming` string shows a live partial message.' },
  { name: 'ToolTrail', group: 'Conversation', props: { activity: TOOLS }, w: 640, h: 80,
    dts: `interface ToolTrailProps { activity?: { name: string; done: boolean; refused?: string }[] }`,
    doc: 'The mono chips showing which engine tools a turn ran: ✓ done, · running (copper), ⛔ refused (probe red, with the refusal code). Place under a message list.' },
  { name: 'Composer', group: 'Conversation', props: {}, w: 640, h: 90,
    dts: `interface ComposerProps { /** idle placeholder text */ idle?: string }`,
    doc: 'The reply input + Send button. Standalone control; in the app it switches to "Steer" mid-turn.' },
  { name: 'SvgViewer', group: 'Views', props: { content: SAMPLE_SVG, alt: 'schematic' }, w: 520, h: 260,
    dts: `interface SvgViewerProps { content?: string; url?: string; alt?: string; emptyNote?: string }`,
    doc: 'Interactive SVG canvas: wheel zoom about the cursor, drag pan, double-click reset, hover readout of data-part/net/wire/hole. Wrap schematics/breadboards in it; give the wrapper a fixed height.' },
];

for (const spec of SPECS) {
  const dir = resolve(out, spec.group, spec.name);
  mkdirSync(dir, { recursive: true });

  writeFileSync(resolve(dir, `${spec.name}.html`),
`<!-- @dsCard group="${spec.group}" -->
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="../../../styles.css" />
<script src="../../../_vendor/react.production.min.js"></script>
<script src="../../../_vendor/react-dom.production.min.js"></script>
<script src="../../../_ds_bundle.js"></script>
<style>body { padding: 12px; } #root { min-height: ${spec.h - 40}px; }</style>
</head>
<body>
<div id="root"></div>
<script>
ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(window.MakerLord.${spec.name}, ${JSON.stringify(spec.props)})
);
</script>
</body>
</html>
`);

  writeFileSync(resolve(dir, `${spec.name}.d.ts`),
`${spec.dts}
declare const ${spec.name}: import('react').FC<${spec.name}Props>;
export default ${spec.name};
`);

  writeFileSync(resolve(dir, `${spec.name}.prompt.md`),
`# ${spec.name}

${spec.doc}

These are compiled Svelte components in React wrappers: use them via
\`window.MakerLord.${spec.name}\` as normal React elements with the props
above. They render their own markup and styles (tokens from styles.css);
do not pass children. Omitted props fall back to sensible empty state.

\`\`\`jsx
<window.MakerLord.${spec.name} {...${JSON.stringify(spec.props).slice(0, 400)}} />
\`\`\`
`);
}
console.log('cards generated:', SPECS.length);
