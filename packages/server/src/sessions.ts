import { randomBytes } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AgentSession } from '@makerlord/agent';
import { loadPack } from '@makerlord/agent';
import {
  commitAll, initProjectRepo, logDetailed, writeAllArtifacts,
} from '@makerlord/artifacts';
import { AcpAgent } from '@makerlord/bridge';
import type { SessionEvent } from '@makerlord/protocol';
import { bundle, initProjectFile, loadSession } from '@makerlord/tools';

export interface NumberedEvent {
  id: number;
  event: SessionEvent;
}

/** What a hosted turn needs from a brain — ours or a spawned ACP agent. */
interface AgentLike {
  send(text: string, onEvent: (event: SessionEvent) => void): Promise<void>;
  steer(text: string): void;
}

interface Hosted {
  projectDir: string;
  agent: AgentLike;
  events: NumberedEvent[];
  listeners: Set<(e: NumberedEvent) => void>;
  turnActive: boolean;
}

export interface HostOptions {
  projectsRoot: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  stage?: number;
  /** 'sdk' (default): our agent loop on the Anthropic API key.
   *  'acp': spawn an ACP agent (e.g. Claude Code) that sees the project
   *  through maker-mcp — the maker's subscription pays, not the API key. */
  backend?: 'sdk' | 'acp';
  acpCommand?: string;
  acpArgs?: string[];
  /** Path to maker-mcp's entry; the ACP agent gets it as an MCP server. */
  mcpPath?: string;
  /** Adds the web_search/web_fetch server tools to the SDK agent (§8). */
  webResearch?: boolean;
  /** Server-side compaction (beta compact-2026-01-12). Defaults ON for the
   *  hosted agent: the protected-tail eval passed live 2026-07-30
   *  (scripts/eval-compaction.mjs — 154k→579 tokens, all facts survived). */
  compactionBeta?: boolean;
}

/**
 * The hosted surface: one project per session, in-memory event log with
 * monotonic ids so SSE clients replay from Last-Event-ID (UI spec §10).
 */
export class HostedSessions {
  private sessions = new Map<string, Hosted>();

  constructor(private opts: HostOptions) {
    mkdirSync(resolve(opts.projectsRoot), { recursive: true });
  }

  /** Every project on the bench, newest first. */
  /** D54: projects are per-user — the layout IS the ownership model. */
  userRoot(userId: string): string {
    if (!/^u_[a-f0-9]+$/.test(userId)) throw new Error('bad user id');
    return join(resolve(this.opts.projectsRoot), userId);
  }

  listProjects(userId: string): { projectId: string; intent: string; updatedAt: string }[] {
    const root = this.userRoot(userId);
    if (!existsSync(root)) return [];
    const out: { projectId: string; intent: string; updatedAt: string }[] = [];
    for (const entry of readdirSync(root)) {
      const path = join(root, entry, 'project.json');
      if (!existsSync(path)) continue;
      try {
        const session = loadSession(path);
        out.push({
          projectId: entry,
          intent: session.file.project.intent,
          updatedAt: statSync(path).mtime.toISOString(),
        });
      } catch {
        // an unreadable project is skipped, not fatal
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createProject(userId: string, intent: string): { projectId: string } {
    const projectId = randomBytes(8).toString('hex');
    const dir = join(this.userRoot(userId), projectId);
    mkdirSync(dir, { recursive: true });
    initProjectFile(join(dir, 'project.json'), intent);
    // D34: each project is a REAL git repo from its first breath.
    initProjectRepo(dir);
    return { projectId };
  }

  /** Project the per-stage files and commit whatever changed (D2 + D34). */
  async projectArtifacts(projectDir: string, message: string): Promise<void> {
    try {
      const session = loadSession(join(projectDir, 'project.json'));
      await writeAllArtifacts(session);
      commitAll(projectDir, message);
    } catch {
      // Artifact projection must never break a turn; the model is the truth.
    }
  }

  async createSession(userId: string, projectId: string): Promise<{ sessionId: string }> {
    const projectDir = this.projectDir(userId, projectId);
    const agent = this.opts.backend === 'acp'
      ? await this.acpAgent(projectDir)
      : this.sdkAgent(projectDir);
    const sessionId = randomBytes(12).toString('hex');
    this.sessions.set(sessionId, {
      projectDir,
      agent,
      events: [],
      listeners: new Set(),
      turnActive: false,
    });
    return { sessionId };
  }

  /** Spawn the ACP agent once per session; it holds its own conversation. */
  private async acpAgent(projectDir: string): Promise<AgentLike> {
    const started = await AcpAgent.start({
      command: this.opts.acpCommand ?? 'claude-code-acp',
      args: this.opts.acpArgs ?? [],
      cwd: projectDir,
      stripEnv: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'],
    });
    if (!started.ok) {
      throw new Error(`ACP agent failed to start (${started.reason}): ${started.message}`);
    }
    const agent = started.agent;
    // Auto-answer permission asks with the most durable "allow" on offer.
    // This is safe BY DESIGN, not by trust: the gates live in the engine
    // (D3/D4) and the cross-brain assertion proves the BYO path is equally
    // gated — an allowed tool still refuses while a BLOCKER is live.
    agent.onPermissionAsk = (_askId, _title, options) => {
      const pick =
        options.find((o) => o.kind === 'allow_always') ??
        options.find((o) => o.kind.startsWith('allow')) ??
        options[0];
      return Promise.resolve(pick?.id ?? '');
    };
    const mcpPath =
      this.opts.mcpPath ?? join(process.cwd(), 'packages/mcp/dist/main.js');
    const acpSessionId = await agent.newSession(projectDir, [{
      name: 'makerlord',
      command: process.execPath,
      args: [mcpPath],
      env: {
        MAKERLORD_PROJECT: join(projectDir, 'project.json'),
        ...Object.fromEntries(
          Object.entries(process.env).filter(([k]) =>
            k.startsWith('MAKERLORD_'),
          ) as [string, string][],
        ),
      },
    }]);
    return {
      send: (text, onEvent) => agent.prompt(acpSessionId, text, onEvent),
      steer: () => {
        throw new Error('steering is not supported on the ACP backend yet');
      },
    };
  }

  private sdkAgent(projectDir: string): AgentLike {
    const toolSession = loadSession(join(projectDir, 'project.json'));
    const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
      apiKey: this.opts.apiKey,
      timeout: 600_000,
    };
    if (this.opts.baseURL) clientConfig.baseURL = this.opts.baseURL;
    const agentOpts: ConstructorParameters<typeof AgentSession>[0] = {
      client: new Anthropic(clientConfig),
      toolSession,
      cwd: projectDir,
      pack: loadPack(projectDir),
      stage: this.opts.stage ?? 1,
      bundle: bundle(),
    };
    if (this.opts.model) agentOpts.model = this.opts.model;
    if (this.opts.webResearch) agentOpts.webResearch = true;
    agentOpts.compactionBeta = this.opts.compactionBeta ?? true;
    return new AgentSession(agentOpts);
  }

  private get(sessionId: string): Hosted {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`no session "${sessionId}"`);
    return s;
  }

  private transcriptPath(projectDir: string): string {
    return join(projectDir, 'transcript.jsonl');
  }

  private appendTranscript(projectDir: string, record: unknown): void {
    appendFileSync(this.transcriptPath(projectDir), `${JSON.stringify(record)}\n`);
  }

  /** Bridge turns happen off-server (the maker's own agent); the bridge
   *  flushes them here after each turn so a reload replays ONE history —
   *  the transcript belongs to the project, not to whichever brain drove. */
  appendTranscriptRecords(userId: string, projectId: string, records: unknown[]): void {
    const dir = this.projectDir(userId, projectId);
    for (const record of records) {
      const kind = (record as { kind?: string }).kind;
      if (kind !== 'maker' && kind !== 'event') {
        throw new Error('records must be {kind: "maker"|"event", ...}');
      }
      this.appendTranscript(dir, record);
    }
  }

  /** The conversation survives reloads and redeploys: it lives with the
   *  project, not with the in-memory session. */
  readTranscript(userId: string, projectId: string): unknown[] {
    const path = this.transcriptPath(this.projectDir(userId, projectId));
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as unknown);
  }

  /** One prompt at a time per session; events flow to the log + listeners. */
  async prompt(sessionId: string, text: string): Promise<void> {
    const s = this.get(sessionId);
    if (s.turnActive) throw new Error('a turn is already active on this session');
    s.turnActive = true;
    this.appendTranscript(s.projectDir, { kind: 'maker', text });
    try {
      await s.agent.send(text, (event) => {
        const numbered: NumberedEvent = { id: s.events.length + 1, event };
        s.events.push(numbered);
        this.appendTranscript(s.projectDir, { kind: 'event', event });
        for (const l of s.listeners) l(numbered);
      });
    } finally {
      s.turnActive = false;
      await this.projectArtifacts(s.projectDir, text);
    }
  }

  steer(sessionId: string, text: string): void {
    this.get(sessionId).agent.steer(text);
  }

  isTurnActive(sessionId: string): boolean {
    return this.get(sessionId).turnActive;
  }

  /** Replay everything after lastEventId, then live events. */
  subscribe(
    sessionId: string,
    lastEventId: number,
    listener: (e: NumberedEvent) => void,
  ): () => void {
    const s = this.get(sessionId);
    for (const e of s.events) {
      if (e.id > lastEventId) listener(e);
    }
    s.listeners.add(listener);
    return () => s.listeners.delete(listener);
  }

  private projectDir(userId: string, projectId: string): string {
    // Cross-user access dies HERE, as not-found: existence is private
    // too (auth spec §8).
    const dir = join(this.userRoot(userId), projectId);
    if (!existsSync(join(dir, 'project.json'))) {
      throw new Error(`no project "${projectId}"`);
    }
    return dir;
  }

  /** The artifact tree, .git excluded — the repo made visible, read-only. */
  listFiles(userId: string, projectId: string): { path: string; size: number }[] {
    const dir = this.projectDir(userId, projectId);
    const out: { path: string; size: number }[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d)) {
        if (entry === '.git') continue;
        const full = join(d, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else out.push({ path: relative(dir, full).split(sep).join('/'), size: stat.size });
      }
    };
    walk(dir);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Read one artifact file. Refuses any path that escapes the project. */
  readFile(userId: string, projectId: string, relPath: string, encoding: 'utf8' | 'base64' = 'utf8'): string {
    const dir = this.projectDir(userId, projectId);
    const full = resolve(dir, relPath);
    const rel = relative(dir, full);
    if (rel.startsWith('..') || rel.split(sep).includes('.git')) {
      throw new Error(`no file "${relPath}"`);
    }
    if (!existsSync(full) || !statSync(full).isFile()) {
      throw new Error(`no file "${relPath}"`);
    }
    // base64 is how firmware.bin reaches the browser flasher — bytes
    // would mangle through utf8.
    return readFileSync(full).toString(encoding);
  }

  gitLog(userId: string, projectId: string): { subject: string; date: string }[] {
    return logDetailed(this.projectDir(userId, projectId));
  }

  projectDirOf(sessionId: string): string {
    return this.get(sessionId).projectDir;
  }

  projectPath(userId: string, projectId: string): string {
    return join(this.userRoot(userId), projectId, 'project.json');
  }

  count(): number {
    return this.sessions.size;
  }
}
