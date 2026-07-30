import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { inferStage } from '$lib/postures.js';

/** localStorage can throw in sandboxed iframes (design previews, embeds) —
 *  degrade to memory-less rather than crash the bundle. */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sandboxed */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sandboxed */ } },
};

/**
 * The one store. Every surface reads and mutates this shared runes state;
 * components stay thin and the invariants stay in one place: ONE
 * SessionEvent consumer, findings only ever from engine data, stage follows
 * the project unless the maker pins it.
 */
export const app = $state({
  // shell
  stage: 1,
  stagePinned: false,
  // project + session
  projectId: browser ? store.get('makerlord.projectId') : null,
  sessionId: browser ? store.get('makerlord.sessionId') : null,
  intentDraft: '',
  promptDraft: '',
  turnActive: false,
  lastError: '',
  // conversation
  /** @type {{role: string, text: string}[]} */
  messages: [],
  streamingText: '',
  /** @type {{name: string, done: boolean, refused?: string}[]} */
  toolActivity: [],
  /** @type {{severity: string, ruleId: string, message: string, suggestedFix?: string}[]} */
  findings: [],
  /** @type {{projectId: string, intent: string, updatedAt: string}[]} */
  projectList: [],
  // projections + build
  renderTick: 0,
  /** @type {{steps: any[], currentStep: number, gateOpen: boolean, measurements: any[]} | null} */
  build: null,
  /** @type {any} */
  projectFile: null,
  // the gate (D15: number first, prediction after)
  measureName: 'rail-to-rail resistance',
  measureValue: '',
  measureUnit: 'Ω',
  /** @type {any} */
  prediction: null,
  // simulation (stage ⑤)
  /** @type {any} */
  simResult: null,
  simRunning: false,
  // firmware (stage ⑦)
  /** @type {{roles: any[], unbound: any[]} | null} */
  fwPlan: null,
  /** @type {{ok: boolean, log: string, bin?: string} | null} */
  fwCompile: null,
  fwCompiling: false,
  /** @type {{bin: string, fqbn: string, flash: {protocol: string, baud?: number}} | null} */
  fwManifest: null,
  flashState: 'idle',   // idle | flashing | done | error
  flashPercent: 0,
  flashChip: '',
  flashError: '',
  serialOpen: false,
  /** @type {import('./flash.js').SerialLine[]} */
  serialLines: [],
  // debug (stage ⑧)
  debugSymptomKind: 'element_dead',
  debugSymptomRef: '',
  debugReading: '',
  debugStarting: false,
  // right panel
  panelTab: 'bench',
  libraryQuery: '',
  libraryIncludeGeometry: false,
  /** @type {{id: string, title: string, family: string}[]} */
  libraryHits: [],
  /** @type {any} */
  libraryPart: null,
  /** @type {{partId: string, title: string, needed: number, owned: number}[]} */
  inventoryGap: [],
  /** @type {Record<string, string>} */
  partTitles: {},
  /** @type {{path: string, size: number}[]} */
  fileList: [],
  /** @type {{path: string, content: string} | null} */
  fileOpen: null,
  /** @type {{subject: string, date: string}[]} */
  commits: [],
  // the local brain (maker-bridge)
  bridgeStatus: 'off',   // off | pair | connecting | ready | error
  bridgePort: browser ? Number(store.get('makerlord.bridgePort') ?? 8790) : 8790,
  bridgeAgent: '',
  bridgeSessionReady: false,
  bridgeCodeDraft: '',
  bridgeError: '',
  // docked chat
  dockOpen: false,
});

/** @type {EventSource | null} */
let eventSource = null;
/** @type {WebSocket | null} */
let bridgeWs = null;

export async function api(path, body) {
  const res = await fetch(`/app-api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function openEvents() {
  if (!app.sessionId || eventSource) return;
  eventSource = new EventSource(`/app-api/sessions/${app.sessionId}/events`);
  eventSource.addEventListener('session', (e) => {
    consume(JSON.parse(e.data));
  });
}

/** The one SessionEvent consumer — findings only ever from engine data. */
export function consume(ev, replay = false) {
  if (ev.t === 'message.delta') {
    app.streamingText += ev.text;
  } else if (ev.t === 'tool.start') {
    app.toolActivity = [...app.toolActivity, { name: ev.name, done: false }];
  } else if (ev.t === 'tool.end') {
    const last = app.toolActivity.findLast((a) => a.name && !a.done);
    if (last) last.done = true;
    app.toolActivity = [...app.toolActivity];
    if (!ev.result.ok) {
      if (last) last.refused = ev.result.refused;
      app.findings = ev.result.findings.length ? ev.result.findings : app.findings;
    }
  } else if (ev.t === 'turn.end') {
    if (app.streamingText) {
      app.messages = [...app.messages, { role: 'agent', text: app.streamingText }];
    }
    app.streamingText = '';
    app.turnActive = false;
    if (!replay) refreshProjections();
  } else if (ev.t === 'session.error') {
    if (!replay) app.lastError = ev.message;
    app.turnActive = false;
  }
}

/** Rebuild the conversation from the persisted transcript. */
async function replayTranscript() {
  if (!app.projectId) return;
  const r = await api(`projects/${app.projectId}/transcript`);
  if (r.status !== 200) return;
  for (const record of r.data.records ?? []) {
    if (record.kind === 'maker') {
      app.messages = [...app.messages, { role: 'maker', text: record.text }];
      app.toolActivity = [];
    } else if (record.kind === 'event') {
      consume(record.event, true);
    }
  }
}

async function ensureSession(intent) {
  if (!app.projectId) {
    const p = await api('projects', { intent });
    app.projectId = p.data.projectId;
    store.set('makerlord.projectId', app.projectId);
  }
  if (!app.sessionId) {
    const s = await api('sessions', { projectId: app.projectId });
    app.sessionId = s.data.sessionId;
    store.set('makerlord.sessionId', app.sessionId);
  }
  openEvents();
}

export async function startProject() {
  if (!app.intentDraft.trim()) return;
  try {
    await ensureSession(app.intentDraft.trim());
    await sendPrompt(app.intentDraft.trim());
    app.intentDraft = '';
  } catch (e) {
    // A transient network failure must be visible and retryable, not an
    // unhandled rejection. State is resumable: retry picks up where it got to.
    app.lastError = `Could not start: ${e instanceof Error ? e.message : e}. Press Start again.`;
  }
}

export async function sendPrompt(text) {
  if (!text.trim() || !app.projectId) return;
  app.messages = [...app.messages, { role: 'maker', text }];
  app.toolActivity = [];
  app.turnActive = true;
  app.lastError = '';
  // The local brain drives when connected — same events, same consumer.
  if (app.bridgeStatus === 'ready' && app.bridgeSessionReady && bridgeWs) {
    bridgeWs.send(JSON.stringify({ t: 'prompt', text }));
    return;
  }
  try {
    // Sessions are in-memory server-side: a redeploy drops them. Resume by
    // minting a fresh one against the same project — the artefact persists.
    if (!app.sessionId) await ensureSession(text);
    let r = await api(`sessions/${app.sessionId}/prompt`, { text });
    if (r.status === 404) {
      app.sessionId = null;
      store.del('makerlord.sessionId');
      if (eventSource) { eventSource.close(); eventSource = null; }
      await ensureSession(text);
      r = await api(`sessions/${app.sessionId}/prompt`, { text });
    }
    if (r.status === 409) {
      await api(`sessions/${app.sessionId}/steer`, { text });
    }
  } catch (e) {
    app.turnActive = false;
    app.lastError = `Could not reach the agent: ${e instanceof Error ? e.message : e}. Try again.`;
  }
}

/** Stage changes are NAVIGATION: the stage lives in the URL, so refresh
 *  keeps your page, back/forward walks stages, and links deep-link. */
export function gotoStage(n) {
  app.stage = n;
  app.stagePinned = true;
  if (!browser) return;
  const params = new URLSearchParams(location.search);
  params.set('stage', String(n));
  if (app.projectId) params.set('p', app.projectId);
  goto(`/?${params}`, { noScroll: true, keepFocus: true });
}

/** Adopt a project named in the URL (?p=) — shareable links win over
 *  whatever this browser had open last. */
export function adoptUrlParams(url) {
  const p = url.searchParams.get('p');
  if (p && p !== app.projectId) {
    app.projectId = p;
    app.sessionId = null;
    store.set('makerlord.projectId', p);
    store.del('makerlord.sessionId');
  }
  const stage = Number(url.searchParams.get('stage'));
  if (Number.isFinite(stage) && stage >= 1 && stage <= 17) {
    app.stage = stage;
    app.stagePinned = true;
  }
}

export function newProject() {
  store.del('makerlord.projectId');
  store.del('makerlord.sessionId');
  location.reload();
}

export async function loadProjectList() {
  const r = await api('projects');
  if (r.status === 200) app.projectList = r.data.projects ?? [];
}

export function openProject(id) {
  store.set('makerlord.projectId', id);
  store.del('makerlord.sessionId');
  location.reload();
}

function followStage() {
  if (!app.stagePinned && app.projectFile) {
    app.stage = inferStage(app.projectFile.project);
  }
}

let projectionsInFlight = null;

export function refreshProjections() {
  // Coalesce: overlapping callers share one round-trip. A caller storm
  // (agent turn end + lens retry + user action) must cost one fetch set,
  // not N — the audit's 3,900-request loop is the cautionary tale.
  if (projectionsInFlight) return projectionsInFlight;
  projectionsInFlight = (async () => {
    app.renderTick += 1;
    if (app.projectId) {
      const r = await api(`projects/${app.projectId}/steps`);
      if (r.status === 200) app.build = r.data;
      await refreshProjectFile();
      followStage();
    }
  })().finally(() => { projectionsInFlight = null; });
  return projectionsInFlight;
}

async function refreshProjectFile() {
  if (!app.projectId) return;
  const r = await api(`projects/${app.projectId}`);
  if (r.status === 200) app.projectFile = r.data.file;
}

export async function runCheck(name) {
  if (!app.projectId) return;
  const r = await api(`projects/${app.projectId}/tool`, { name, input: {} });
  if (r.data.ok === false) app.findings = r.data.findings;
  else if (r.data.ok) app.findings = r.data.data.findings ?? [];
}

export async function recordMeasurement(name, rawValue, unit) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || !app.projectId) return;
  await api(`projects/${app.projectId}/tool`, {
    name: 'measure',
    input: { name, value, unit },
  });
  // Only AFTER the number is recorded does the prediction appear (D15).
  const r = await api(`projects/${app.projectId}/tool`, { name: 'predict_dc', input: {} });
  app.prediction = r.data.ok ? r.data.data.prediction : null;
  await refreshProjections();
}

/** The maker's own step control — the engine still owns the gate. */
export async function advanceStep(to) {
  if (!app.projectId) return;
  const r = await api(`projects/${app.projectId}/tool`, {
    name: 'advance_build_step', input: { to },
  });
  if (r.data.ok === false) {
    app.findings = r.data.findings?.length ? r.data.findings : app.findings;
    app.lastError = r.data.message ?? 'the engine refused the advance';
  } else {
    app.lastError = '';
  }
  await refreshProjections();
}

export async function runSimulation() {
  if (!app.projectId || app.simRunning) return;
  app.simRunning = true;
  try {
    const r = await api(`projects/${app.projectId}/tool`, {
      name: 'sim_run', input: { name: 'ui', analyses: ['op'] },
    });
    if (r.data.ok) {
      app.simResult = r.data.data;
      if (app.simResult.findings?.length) app.findings = app.simResult.findings;
    } else {
      app.lastError = r.data.error ?? 'simulation failed';
    }
  } finally {
    app.simRunning = false;
  }
}

// ── stage ⑦: the firmware loop. Same rule as everywhere: findings only
// ever from engine data; refusals land on the strip, never vanish. ──

async function fwTool(name, input = {}) {
  const r = await api(`projects/${app.projectId}/tool`, { name, input });
  if (r.data.ok === false) {
    app.findings = r.data.findings?.length ? r.data.findings : app.findings;
    app.lastError = r.data.message ?? `${name} refused`;
    return null;
  }
  app.lastError = '';
  return r.data.ok ? r.data.data : null;
}

export async function fwPinPlan() {
  const d = await fwTool('fw_pin_plan');
  if (d) app.fwPlan = d;
  await refreshProjections();
}

export async function fwCheck() {
  const d = await fwTool('check_firmware');
  if (d) app.findings = d.findings;
}

export async function fwGenerate() {
  const d = await fwTool('fw_generate');
  if (d) await refreshProjections();
  return d !== null;
}

export async function fwCompileRun() {
  if (app.fwCompiling) return;
  app.fwCompiling = true;
  try {
    const d = await fwTool('fw_compile');
    if (d) app.fwCompile = d;
    await refreshProjections();
  } finally {
    app.fwCompiling = false;
  }
}

/** The engine decides whether flashing is allowed (D47) — a refusal here
 *  is the gate speaking, and the panel renders it as the locked state. */
export async function fwManifestGet() {
  const d = await fwTool('fw_manifest');
  app.fwManifest = d;
  return d;
}

// ── stage ⑧: the guided search. The engine owns candidates and prunes;
// the UI records numbers and renders the tree. ──

export async function debugStart() {
  if (app.debugStarting) return;
  app.debugStarting = true;
  try {
    const input = { kind: app.debugSymptomKind };
    if (app.debugSymptomRef.trim()) input.ref = app.debugSymptomRef.trim();
    await fwTool('debug_start', input);
    await refreshProjections();
  } finally {
    app.debugStarting = false;
  }
}

export async function debugObserveVoltage(net, rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  await fwTool('debug_observe', { kind: 'voltage', net, value, unit: 'V' });
  app.debugReading = '';
  await refreshProjections();
}

/** SELFTEST lines from the shared monitor feed the search automatically. */
export async function debugObserveSelftest(role, okFlag) {
  await fwTool('debug_observe', { kind: 'selftest', role, ok: okFlag });
  await refreshProjections();
}

export async function debugClose() {
  await fwTool('debug_close');
  await refreshProjections();
}

export async function openGate() {
  const r = await api(`projects/${app.projectId}/tool`, { name: 'gate_open', input: {} });
  if (r.data.ok === false) {
    app.findings = r.data.findings.length ? r.data.findings : app.findings;
  }
  await refreshProjections();
}

export async function searchLibrary() {
  if (!app.projectId) return;
  // Empty query lists the WHOLE curated library — the collection is the
  // message; search narrows it.
  const r = await api(`projects/${app.projectId}/tool`, {
    name: 'parts_search',
    input: { query: app.libraryQuery.trim(), includeGeometry: app.libraryIncludeGeometry },
  });
  app.libraryHits = r.data.ok ? r.data.data.hits : [];
  for (const hit of app.libraryHits) {
    if (hit.id && hit.title) app.partTitles[hit.id] = hit.title;
  }
  app.libraryPart = null;
}

/** D49: the library is what EXISTS; the inventory is what the maker OWNS.
 *  "I own this" moves a part across that line; the gap is what the build
 *  still needs. */
export async function ownPart(partId) {
  await api(`projects/${app.projectId}/tool`, {
    name: 'inventory_add', input: { partId, quantity: 1 },
  });
  await Promise.all([refreshProjections(), loadInventoryGap()]);
}

export async function removeInventory(index) {
  await api(`projects/${app.projectId}/tool`, {
    name: 'inventory_remove', input: { index },
  });
  await Promise.all([refreshProjections(), loadInventoryGap()]);
}

/** Upload a datasheet PDF → content-hashed store → upload:sha256 ref. */
export async function uploadDatasheet(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  const r = await api('datasheets', { contentBase64: btoa(binary) });
  if (r.status !== 201) throw new Error(r.data.error ?? 'upload failed');
  return r.data.ref;
}

/** The geometry provision: both roads lead to profile_propose and the
 *  sourced tier — and only a human's `maker curate promote` goes further. */
export function researchPart(part, uploadRef) {
  const base = `Research the part "${part.definition.title}" (partId ${part.definition.id}, ` +
    `corpus file ${part.file ?? 'unknown'}).`;
  const ask = uploadRef
    ? `${base} I uploaded its datasheet as ${uploadRef} — read it with datasheet_read, ` +
      'then draft a safety profile and file it with profile_propose citing that ref.'
    : `${base} Find its datasheet on the web, then draft a safety profile and file ` +
      'it with profile_propose, citing the datasheet URLs you actually fetched.';
  sendPrompt(ask);
}

export async function loadInventoryGap() {
  if (!app.projectId) return;
  const r = await api(`projects/${app.projectId}/tool`, { name: 'inventory_gap', input: {} });
  if (r.data.ok) {
    app.inventoryGap = r.data.data.toAcquire;
    for (const row of [...r.data.data.toAcquire, ...(r.data.data.owned ?? [])]) {
      if (row.partId && row.title) app.partTitles[row.partId] = row.title;
    }
  }
}

/** Display title for a part id — filled by every list the app loads;
 *  a maker reads "Red LED - 5mm", machines keep the id. */
export function titleFor(partId) {
  if (!partId) return partId;
  return app.partTitles[partId] ?? partId;
}

export async function openPart(id) {
  const r = await api(`projects/${app.projectId}/tool`, {
    name: 'parts_get', input: { id },
  });
  app.libraryPart = r.data.ok ? r.data.data : null;
}

export async function loadFiles() {
  if (!app.projectId) return;
  // Fetched independently: a blip on one must not blank the other, and a
  // failed load just leaves the previous list for the next tab click.
  try {
    const f = await api(`projects/${app.projectId}/files`);
    if (f.status === 200) app.fileList = f.data.files;
  } catch { /* transient — retried on next open */ }
  try {
    const l = await api(`projects/${app.projectId}/log`);
    if (l.status === 200) app.commits = l.data.commits;
  } catch { /* transient — retried on next open */ }
}

export async function openFile(path) {
  const r = await api(`projects/${app.projectId}/file?path=${encodeURIComponent(path)}`);
  if (r.status === 200) app.fileOpen = r.data;
}

// ── the local brain: maker-bridge over paired localhost WS ────────────
// The maker's own Claude Code drives; tools execute on the hosted engine
// (maker-mcp remote mode), so project state and gates never leave the
// server. Same SessionEvent union, same consume() — one consumer.

export function bridgeConnect(quiet = false) {
  if (bridgeWs) { bridgeWs.close(); return; }
  app.bridgeStatus = 'connecting';
  app.bridgeError = '';
  const port = Number(app.bridgePort) || 8790;
  store.set('makerlord.bridgePort', String(port));
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  bridgeWs = ws;
  ws.onopen = () => {
    const token = store.get('makerlord.bridgeToken');
    if (token) ws.send(JSON.stringify({ t: 'auth', token }));
    else app.bridgeStatus = 'pair';
  };
  ws.onmessage = (m) => {
    const f = JSON.parse(m.data);
    if (f.t === 'paired') {
      store.set('makerlord.bridgeToken', f.token);
      ws.send(JSON.stringify({ t: 'auth', token: f.token }));
    } else if (f.t === 'ready') {
      app.bridgeStatus = 'ready';
      app.bridgeAgent = f.agent ?? '';
      app.bridgeError = '';
      if (app.projectId) ws.send(JSON.stringify({ t: 'session.new', projectId: app.projectId }));
    } else if (f.t === 'session.ready') {
      app.bridgeSessionReady = true;
    } else if (f.t === 'event') {
      consume(f.event);
    } else if (f.t === 'error') {
      app.bridgeError = f.message;
      if (/bad token/.test(f.message)) {
        store.del('makerlord.bridgeToken');
        app.bridgeStatus = 'pair';
      }
      app.turnActive = false;
    }
  };
  ws.onclose = () => {
    bridgeWs = null;
    // onerror fires first when there is no bridge; keep the error state so
    // the how-to-set-up help stays on screen.
    if (app.bridgeStatus !== 'error') app.bridgeStatus = 'off';
    app.bridgeSessionReady = false;
  };
  ws.onerror = () => {
    // A silent auto-reconnect attempt just goes back to off; only a
    // deliberate click earns the "run maker-bridge" hint.
    if (!quiet) {
      app.bridgeError = `no bridge on ws://127.0.0.1:${port} — run \`maker-bridge\` on this machine`;
      app.bridgeStatus = 'error';
    } else {
      app.bridgeStatus = 'off';
    }
  };
}

export function bridgePair() {
  bridgeWs?.send(JSON.stringify({ t: 'pair', code: app.bridgeCodeDraft.trim() }));
  app.bridgeCodeDraft = '';
}

/** Session boot — called once from the page's onMount. */
export async function boot() {
  // If this browser has paired before, quietly re-attach to the bridge.
  if (store.get('makerlord.bridgeToken')) bridgeConnect(true);
  if (app.sessionId) openEvents();
  await replayTranscript();
  if (app.projectId) refreshProjections();
  else loadProjectList();
}
