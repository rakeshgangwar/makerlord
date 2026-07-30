import { jsonSchema, streamText, tool } from 'ai';
import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { SessionEvent } from '@makerlord/protocol';
import { ALL_TOOLS, runTool, type Session, type ToolCtx } from '@makerlord/tools';
import type { Bundle } from '@makerlord/parts';
import { assemblePrompt } from './prompt.js';
import type { PersonaPack } from './persona.js';
import { clipOversized } from './loop.js';

/**
 * The BYOK loop (2026-07-31): the maker's own provider drives the SAME
 * engine through the SAME gates — D3/D4 make the model swappable
 * because safety never lived in the model. The Vercel AI SDK is the
 * model layer only; the loop, the events, and the adjudication stay
 * ours. The Anthropic-native loop (loop.ts) keeps its extras (server
 * web research, thinking, compaction); this one is the standard tool
 * loop every other provider gets.
 */

export interface ProviderConfig {
  provider:
    | 'openai' | 'google' | 'mistral' | 'groq'
    | 'openrouter' | 'deepseek' | 'xai' | 'ollama' | 'custom';
  model: string;
  apiKey: string;
  /** openai-compatible endpoints only (ollama, custom gateways). */
  baseURL?: string;
}

const COMPAT_BASES: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  ollama: 'http://127.0.0.1:11434/v1',
};

export function resolveModel(cfg: ProviderConfig): LanguageModel {
  switch (cfg.provider) {
    case 'openai':
      return createOpenAI({ apiKey: cfg.apiKey })(cfg.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.model);
    case 'mistral':
      return createMistral({ apiKey: cfg.apiKey })(cfg.model);
    case 'groq':
      return createGroq({ apiKey: cfg.apiKey })(cfg.model);
    default: {
      const baseURL = cfg.baseURL ?? COMPAT_BASES[cfg.provider];
      if (!baseURL) throw new Error(`provider "${cfg.provider}" needs a baseURL`);
      return createOpenAICompatible({
        name: cfg.provider, apiKey: cfg.apiKey, baseURL,
      })(cfg.model);
    }
  }
}

export interface AiSdkSessionOptions {
  model: LanguageModel;
  toolSession: Session;
  cwd: string;
  pack: PersonaPack;
  stage: number;
  bundle: Bundle;
}

const MAX_ROUNDS = 40;

export class AiSdkSession {
  private messages: ModelMessage[] = [];
  private steeringQueue: string[] = [];

  constructor(private opts: AiSdkSessionOptions) {}

  steer(text: string): void {
    this.steeringQueue.push(text);
  }

  /** Draft-07 emits tuple schemas as `items: [a, b]` and stamps $schema
   *  keys; several providers (Moonshot, observed live 2026-07-31) refuse
   *  both. Loosening a tuple to `items: {anyOf}` costs nothing: the
   *  ENGINE re-validates every input with the real zod schema at
   *  execution — the wire schema only guides the model. */
  private static portable(node: unknown): unknown {
    if (Array.isArray(node)) return node.map((n) => AiSdkSession.portable(n));
    if (typeof node !== 'object' || node === null) return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema') continue;
      if (k === 'items' && Array.isArray(v)) {
        out[k] = { anyOf: v.map((m) => AiSdkSession.portable(m)) };
      } else {
        out[k] = AiSdkSession.portable(v);
      }
    }
    return out;
  }

  private registryTools(): ToolSet {
    return Object.fromEntries(
      ALL_TOOLS.map((t) => [
        t.name,
        // No execute: the loop runs tools itself — results flow through
        // the same runTool the CLI/MCP/tests use, findings unsoftened.
        tool({
          description: t.summary,
          // $refStrategy none: inline schemas — Moonshot et al refuse
          // '#/definitions/' refs (observed live 2026-07-31).
          inputSchema: jsonSchema(
            AiSdkSession.portable(
              zodToJsonSchema(t.input, { $refStrategy: 'none' }),
            ) as Record<string, unknown>,
          ),
        }),
      ]),
    );
  }

  async send(text: string, onEvent: (event: SessionEvent) => void): Promise<void> {
    this.messages.push({ role: 'user', content: text });
    const p = this.opts.toolSession.file.project;
    const system = assemblePrompt({
      pack: this.opts.pack,
      stage: this.opts.stage,
      bundle: this.opts.bundle,
      projectSummary:
        `Intent: ${p.intent}. Requirements: ${p.requirements.length}. ` +
        `Blocks: ${p.architecture.blocks.length}. ` +
        `Circuit parts: ${p.circuit?.parts.length ?? 0}.`,
      openFindings: [],
    }).map((b) => b.text).join('\n\n');
    const tools = this.registryTools();

    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const result = streamText({
          model: this.opts.model,
          system,
          messages: this.messages,
          tools,
        });

        // Pre-attach a rejection handler: throwing out of the stream
        // otherwise leaves result.response rejected and unhandled — a
        // process crash that eats the session.error (observed live).
        void result.response.then(() => undefined, () => undefined);

        const calls: { toolCallId: string; toolName: string; input: unknown }[] = [];
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            onEvent({ t: 'message.delta', text: (part as unknown as { text: string }).text });
          } else if (part.type === 'tool-call') {
            calls.push(part as (typeof calls)[number]);
            onEvent({
              t: 'tool.start',
              callId: part.toolCallId,
              name: (part as { toolName: string }).toolName,
              input: (part as { input: unknown }).input,
            });
          } else if (part.type === 'error') {
            throw part.error instanceof Error ? part.error : new Error(String(part.error));
          }
        }

        const response = await result.response;
        this.messages.push(...response.messages);

        if (calls.length === 0) break;

        const results = [];
        for (const call of calls) {
          const ctx: ToolCtx = { session: this.opts.toolSession, cwd: this.opts.cwd };
          const toolResult = await runTool(call.toolName, call.input, ctx);
          onEvent({ t: 'tool.end', callId: call.toolCallId, result: toolResult });
          results.push({
            type: 'tool-result' as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
            output: {
              type: 'json' as const,
              value: clipOversized([toolResult])[0] as Record<string, unknown>,
            },
            dynamic: true as const,
          });
        }
        this.messages.push({ role: 'tool', content: results } as ModelMessage);

        while (this.steeringQueue.length > 0) {
          this.messages.push({
            role: 'user',
            content: `[The maker interjects mid-turn]: ${this.steeringQueue.shift()}`,
          });
        }
      }
      onEvent({ t: 'turn.end', reason: 'end_turn' });
    } catch (e) {
      onEvent({
        t: 'session.error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
