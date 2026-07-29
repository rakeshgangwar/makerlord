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

/** Server tools the agent may request; executed on Anthropic infra (§8). */
export const WEB_RESEARCH_TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
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

  constructor(private opts: AgentSessionOptions) {}

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
          const ctx: ToolCtx = { session: this.opts.toolSession, cwd: this.opts.cwd };
          result = await runTool(call.name ?? '', call.input, ctx);
        } catch (e) {
          result = {
            ok: false,
            refused: 'BLOCKERS_UNRESOLVED',
            findings: [],
            message: e instanceof Error ? e.message : String(e),
          } as ToolResult<unknown>;
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
