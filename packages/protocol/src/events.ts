import type { ToolResult } from '@makerlord/tools';

/** Why a turn stopped. Normalised across brains. */
export type StopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'cancelled'
  | 'refusal'
  | 'error';

export interface PermissionOption {
  id: string;
  label: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

export interface PlanStep {
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * The one union the UI renders (ACP host spec §5). The bridge translates ACP
 * session updates into this; the agent runtime emits it directly. Neither the
 * UI nor the tests contain a branch on which agent produced an event.
 */
export type SessionEvent =
  | { t: 'message.delta'; text: string }
  | { t: 'thought.delta'; text: string }
  | { t: 'tool.start'; callId: string; name: string; input: unknown }
  | { t: 'tool.end'; callId: string; result: ToolResult<unknown> }
  | { t: 'permission.ask'; askId: string; title: string; options: PermissionOption[] }
  | { t: 'plan'; steps: PlanStep[] }
  | { t: 'turn.end'; reason: StopReason }
  | { t: 'session.error'; message: string; detail?: string };

export const SESSION_EVENT_TYPES = [
  'message.delta', 'thought.delta', 'tool.start', 'tool.end',
  'permission.ask', 'plan', 'turn.end', 'session.error',
] as const;

export function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { t?: unknown }).t === 'string' &&
    (SESSION_EVENT_TYPES as readonly string[]).includes((value as { t: string }).t)
  );
}
