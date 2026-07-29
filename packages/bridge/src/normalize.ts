import type { SessionEvent, StopReason } from '@makerlord/protocol';
import type { ToolResult } from '@makerlord/tools';

/**
 * The load-bearing piece (spec §5): ACP session updates in, the one
 * SessionEvent union out. When the published ACP shape drifts, this file is
 * where the drift is absorbed — the UI never sees it.
 */
export interface AcpUpdate {
  sessionUpdate: string;
  [key: string]: unknown;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  const content = value as { text?: string } | undefined;
  return content?.text ?? '';
}

export function normalizeUpdate(update: AcpUpdate): SessionEvent | null {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      return { t: 'message.delta', text: text(update.content) };
    case 'agent_thought_chunk':
      return { t: 'thought.delta', text: text(update.content) };
    case 'tool_call':
      return {
        t: 'tool.start',
        callId: String(update.toolCallId ?? ''),
        name: String(update.title ?? update.name ?? ''),
        input: update.rawInput ?? null,
      };
    case 'tool_call_update': {
      if (update.status !== 'completed' && update.status !== 'failed') return null;
      // A refusal stays a refusal all the way to the renderer.
      const raw = update.rawOutput as ToolResult<unknown> | undefined;
      const result: ToolResult<unknown> =
        raw && typeof raw === 'object' && 'ok' in raw
          ? raw
          : { ok: true, data: update.rawOutput ?? null };
      return {
        t: 'tool.end',
        callId: String(update.toolCallId ?? ''),
        result,
      };
    }
    case 'plan':
      return {
        t: 'plan',
        steps: ((update.entries ?? update.steps ?? []) as {
          content?: string; title?: string; status?: string;
        }[]).map((e) => ({
          title: e.title ?? e.content ?? '',
          status:
            e.status === 'completed' ? 'completed'
            : e.status === 'in_progress' ? 'in_progress'
            : 'pending',
        })),
      };
    default:
      return null; // unknown updates are dropped, not crashed on
  }
}

export function normalizeStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'endTurn':
      return 'end_turn';
    case 'max_tokens':
    case 'maxTokens':
      return 'max_tokens';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'refusal':
      return 'refusal';
    default:
      return 'error';
  }
}
