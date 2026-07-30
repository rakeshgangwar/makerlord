import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { SessionEvent } from '@makerlord/protocol';
import type { Session, ToolCtx, ToolResult } from '@makerlord/tools';
import { ALL_TOOLS, runTool } from '@makerlord/tools';
import type { Bundle } from '@makerlord/parts';
import type { CountableMessage } from './context.js';
import type { ProtectedState } from './compaction.js';
import { compact } from './compaction.js';
import { ObjectionCounter } from './objections.js';
import type { PersonaPack } from './persona.js';
import { effortFor } from './persona.js';
import { assemblePrompt } from './prompt.js';
import { contentEvents, refusalEvent, type ApiMessage } from './events.js';

const DEFAULT_PRESSURE_LIMIT = 600 * 1024;
const MAX_ROUNDS = 50;

export interface AgentSessionOptions {
  /** Construct with an explicit `timeout` — the SDK's long-request check
   *  rejects non-streaming 64k-token calls from a default-configured client. */
  client: Anthropic;
  toolSession: Session;
  cwd: string;
  pack: PersonaPack;
  stage: number;
  bundle: Bundle;
  model?: string;
  maxTokens?: number;
  pressureLimitBytes?: number;
  /** Streaming is the default transport; deltas arrive as they are produced. */
  stream?: boolean;
  /** Adds the server-side compaction beta header (needs the live API). */
  compactionBeta?: boolean;
  /** Adds the web_search/web_fetch server tools (needs the live API). */
  webResearch?: boolean;
}

/** Server tools the agent may request; executed on Anthropic infra (§8).
 *  Type strings VERIFIED LIVE 2026-07-30 (scripts/verify-live-api.mjs):
 *  the 20260209 versions are GA — no beta header — and the search result
 *  shape is [{type:'web_search_result', url, title}]. */
export const WEB_RESEARCH_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
] as const;

export const COMPACTION_BETA = 'compact-2026-01-12';

/** Tools come from the registry, unchanged — the fourth consumer (spec §2). */
export function apiTools(): { name: string; description: string; input_schema: unknown }[] {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.summary,
    input_schema: zodToJsonSchema(t.input),
  }));
}

export class AgentSession {
  private messages: CountableMessage[] = [];
  private steeringQueue: string[] = [];
  private objections = new ObjectionCounter();
  /** URLs the server tools ACTUALLY returned this session → fetchedAt.
   *  Spec §8: the fetching is the agent's; the standard of proof is not. */
  private fetchedUrls = new Map<string, string>();
  /** Upload refs ACTUALLY read via datasheet_read this session — the
   *  symmetric ledger for upload citations (curation spec §3.5). */
  private readUploads = new Set<string>();

  constructor(private opts: AgentSessionOptions) {}

  /** Harvest every URL a web_search/web_fetch result block carried. */
  private recordFetches(content: { type?: string; content?: unknown }[]): void {
    const stamp = new Date().toISOString();
    for (const block of content) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const item of block.content as { url?: string }[]) {
          if (typeof item.url === 'string' && !this.fetchedUrls.has(item.url)) {
            this.fetchedUrls.set(item.url, stamp);
          }
        }
      } else if (block.type === 'web_fetch_tool_result') {
        const url = (block.content as { url?: string } | undefined)?.url;
        if (typeof url === 'string' && !this.fetchedUrls.has(url)) {
          this.fetchedUrls.set(url, stamp);
        }
      }
    }
  }

  /**
   * Session-level adjudication of sourced claims (spec §8): a URL the
   * server tools never returned is refused before the engine ever sees it;
   * a fetched URL missing its timestamp gets the ledger's — the loop knows
   * when, the model guesses. Returns the refusal, or null to proceed with
   * (possibly repaired) input.
   */
  private adjudicateSourcedClaim(
    input: unknown,
  ): ToolResult<never> | null {
    const claim = input as {
      grade?: string;
      evidence?: { url?: string; fetchedAt?: string };
    };
    if (claim.grade !== 'sourced' || typeof claim.evidence?.url !== 'string') {
      return null;   // the engine's structural check owns every other case
    }
    const fetchedAt = this.fetchedUrls.get(claim.evidence.url);
    if (fetchedAt === undefined) {
      return {
        ok: false,
        refused: 'EVIDENCE_UNFETCHED',
        findings: [],
        message:
          `sourced claim rejected: ${claim.evidence.url} was not fetched ` +
          'this session — search or fetch it first, then cite it',
      };
    }
    // Always the ledger's stamp: the model supplies publication dates and
    // guesses here (observed live) — the loop is the only party that knows
    // when the fetch actually happened.
    claim.evidence.fetchedAt = fetchedAt;
    return null;
  }

  /** Curation citations face the same ledger (curation spec §4): every
   *  cited datasheet URL must have been ACTUALLY fetched this session. */
  private adjudicateProposalCitations(input: unknown): ToolResult<never> | null {
    const citations = (input as { citations?: Record<string, string> }).citations;
    for (const [field, citation] of Object.entries(citations ?? {})) {
      const isUpload = citation.startsWith('upload:');
      const seen = isUpload
        ? this.readUploads.has(citation)
        : this.fetchedUrls.has(citation);
      if (!seen) {
        return {
          ok: false,
          refused: 'EVIDENCE_UNFETCHED',
          findings: [],
          message:
            `citation for "${field}" (${citation}) was not ` +
            `${isUpload ? 'read (datasheet_read)' : 'fetched'} this session — ` +
            'read the datasheet first, then cite what you read',
        };
      }
    }
    return null;
  }

  /** Mid-turn steering (spec §10): folded in at the next round boundary. */
  steer(text: string): void {
    this.steeringQueue.push(text);
  }

  private protectedState(): ProtectedState {
    const build = this.opts.toolSession.file.build;
    return {
      openFindings: [],
      measurements: build.measurements,
    };
  }

  private projectSummary(): string {
    const p = this.opts.toolSession.file.project;
    return (
      `Intent: ${p.intent}. Requirements: ${p.requirements.length}. ` +
      `Blocks: ${p.architecture.blocks.length}. ` +
      `Circuit parts: ${p.circuit?.parts.length ?? 0}.`
    );
  }

  async send(userText: string, onEvent: (e: SessionEvent) => void): Promise<void> {
    this.objections.resetOnUserMessage();
    this.messages.push({ role: 'user', content: userText });

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const limit = this.opts.pressureLimitBytes ?? DEFAULT_PRESSURE_LIMIT;
      const compacted = compact(this.messages, this.protectedState(), limit);
      this.messages = compacted.messages;

      const system = assemblePrompt({
        pack: this.opts.pack,
        stage: this.opts.stage,
        bundle: this.opts.bundle,
        projectSummary: this.projectSummary(),
        openFindings: [],
      });

      const useStream = this.opts.stream !== false;
      const tools: unknown[] = [...apiTools()];
      if (this.opts.webResearch) tools.push(...WEB_RESEARCH_TOOLS);
      // The SDK's types may trail the live parameter surface (adaptive
      // thinking, effort); the boundary cast is deliberate and local.
      const params = {
        model: this.opts.model ?? 'claude-opus-5',
        max_tokens: this.opts.maxTokens ?? 64_000,
        system,
        messages: this.messages,
        tools,
        thinking: { type: 'adaptive' },
        output_config: { effort: effortFor(this.opts.stage, this.opts.pack) },
        // Header alone does nothing: the edit is what turns compaction on.
        // Default trigger (150k input tokens); compaction blocks round-trip
        // because response.content is appended whole (spec §5).
        ...(this.opts.compactionBeta
          ? { context_management: { edits: [{ type: 'compact_20260112' }] } }
          : {}),
      } as never;
      const requestOptions: { timeout: number; headers?: Record<string, string> } = {
        timeout: 10 * 60 * 1000,
      };
      if (this.opts.compactionBeta) {
        requestOptions.headers = { 'anthropic-beta': COMPACTION_BETA };
      }

      let response: ApiMessage;
      let deltasAlreadyEmitted = false;
      try {
        if (useStream) {
          // Streaming is transport, not semantics: the same union, earlier.
          const stream = this.opts.client.messages.stream(params, requestOptions);
          for await (const ev of stream) {
            const anyEv = ev as {
              type: string;
              delta?: { type?: string; text?: string; thinking?: string };
            };
            if (anyEv.type === 'content_block_delta') {
              if (anyEv.delta?.type === 'text_delta' && anyEv.delta.text) {
                onEvent({ t: 'message.delta', text: anyEv.delta.text });
                deltasAlreadyEmitted = true;
              } else if (anyEv.delta?.type === 'thinking_delta' && anyEv.delta.thinking) {
                onEvent({ t: 'thought.delta', text: anyEv.delta.thinking });
                deltasAlreadyEmitted = true;
              }
            }
          }
          response = (await stream.finalMessage()) as ApiMessage;
        } else {
          response = (await this.opts.client.messages.create(
            params,
            requestOptions,
          )) as ApiMessage;
        }
      } catch (e) {
        onEvent({
          t: 'session.error',
          message: e instanceof Error ? e.message : String(e),
        });
        return;
      }

      // stop_reason before content — a classifier refusal may have no blocks.
      const refusal = refusalEvent(response);
      if (refusal) {
        onEvent(refusal);
        onEvent({ t: 'turn.end', reason: 'refusal' });
        return;
      }

      if (!deltasAlreadyEmitted) {
        for (const event of contentEvents(response)) onEvent(event);
      }

      // Append response.content back into messages WHOLE — compaction blocks
      // and tool_use blocks must survive the round trip (spec §5).
      this.messages.push({
        role: 'assistant',
        content: (response.content ?? []) as never,
      });
      this.recordFetches((response.content ?? []) as never);

      const toolUses = (response.content ?? []).filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0) {
        onEvent({ t: 'turn.end', reason: 'end_turn' });
        return;
      }

      const results: unknown[] = [];
      let surfacedExhaustion = false;
      for (const call of toolUses) {
        onEvent({
          t: 'tool.start',
          callId: call.id ?? '',
          name: call.name ?? '',
          input: call.input,
        });
        let result: ToolResult<unknown>;
        try {
          const refusal = call.name === 'feasibility_claim'
            ? this.adjudicateSourcedClaim(call.input)
            : call.name === 'profile_propose'
              ? this.adjudicateProposalCitations(call.input)
              : null;
          const ctx: ToolCtx = { session: this.opts.toolSession, cwd: this.opts.cwd };
          result = refusal ?? await runTool(call.name ?? '', call.input, ctx);
        } catch (e) {
          result = {
            ok: false,
            refused: 'BLOCKERS_UNRESOLVED',
            findings: [],
            message: e instanceof Error ? e.message : String(e),
          } as ToolResult<unknown>;
        }
        if (call.name === 'datasheet_read' && result.ok) {
          const ref = (call.input as { ref?: string } | undefined)?.ref;
          if (ref !== undefined) this.readUploads.add(ref);
        }
        onEvent({ t: 'tool.end', callId: call.id ?? '', result });
        results.push({
          type: 'tool_result',
          tool_use_id: call.id ?? '',
          content: JSON.stringify(result),
        });

        // Bounded objections: a refused gated call re-attempted is an
        // objection against the blocking finding.
        if (!result.ok && result.findings.length > 0) {
          const ruleId = result.findings[0]!.ruleId;
          if (!this.objections.recordObjection(ruleId)) {
            const finding = result.findings[0]!;
            onEvent({
              t: 'message.delta',
              text:
                `I will stop arguing with this ${finding.severity}. ` +
                `The engine finding stands: ${finding.message}` +
                (finding.suggestedFix ? ` Fix: ${finding.suggestedFix}` : ''),
            });
            surfacedExhaustion = true;
          }
        }
      }

      this.messages.push({ role: 'user', content: results as never });

      if (surfacedExhaustion) {
        onEvent({ t: 'turn.end', reason: 'end_turn' });
        return;
      }

      // Fold steering messages in at the round boundary as user turns —
      // the turn continues rather than restarting (spec §10).
      while (this.steeringQueue.length > 0) {
        this.messages.push({ role: 'user', content: this.steeringQueue.shift()! });
      }
    }

    onEvent({ t: 'session.error', message: `turn exceeded ${MAX_ROUNDS} rounds` });
  }
}
