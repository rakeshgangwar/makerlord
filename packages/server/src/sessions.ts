import { randomBytes } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AgentSession } from '@makerlord/agent';
import { loadPack } from '@makerlord/agent';
import { commitAll, initProjectRepo, writeAllArtifacts } from '@makerlord/artifacts';
import type { SessionEvent } from '@makerlord/protocol';
import { bundle, initProjectFile, loadSession } from '@makerlord/tools';

export interface NumberedEvent {
  id: number;
  event: SessionEvent;
}

interface Hosted {
  projectDir: string;
  agent: AgentSession;
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
  listProjects(): { projectId: string; intent: string; updatedAt: string }[] {
    const root = resolve(this.opts.projectsRoot);
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

  createProject(intent: string): { projectId: string } {
    const projectId = randomBytes(8).toString('hex');
    const dir = join(resolve(this.opts.projectsRoot), projectId);
    mkdirSync(dir, { recursive: true });
    initProjectFile(join(dir, 'project.json'), intent);
    // D34: each project is a REAL git repo from its first breath.
    initProjectRepo(dir);
    return { projectId };
  }

  /** Project the per-stage files and commit whatever changed (D2 + D34). */
  projectArtifacts(projectDir: string, message: string): void {
    try {
      const session = loadSession(join(projectDir, 'project.json'));
      writeAllArtifacts(session);
      commitAll(projectDir, message);
    } catch {
      // Artifact projection must never break a turn; the model is the truth.
    }
  }

  createSession(projectId: string): { sessionId: string } {
    const projectDir = join(resolve(this.opts.projectsRoot), projectId);
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
    const sessionId = randomBytes(12).toString('hex');
    this.sessions.set(sessionId, {
      projectDir,
      agent: new AgentSession(agentOpts),
      events: [],
      listeners: new Set(),
      turnActive: false,
    });
    return { sessionId };
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

  /** The conversation survives reloads and redeploys: it lives with the
   *  project, not with the in-memory session. */
  readTranscript(projectId: string): unknown[] {
    const path = this.transcriptPath(
      join(resolve(this.opts.projectsRoot), projectId),
    );
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
      this.projectArtifacts(s.projectDir, text);
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

  projectDirOf(sessionId: string): string {
    return this.get(sessionId).projectDir;
  }

  projectPath(projectId: string): string {
    return join(resolve(this.opts.projectsRoot), projectId, 'project.json');
  }

  count(): number {
    return this.sessions.size;
  }
}
