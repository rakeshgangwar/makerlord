import type { SessionEvent } from '@makerlord/protocol';

export interface ApiContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface ApiMessage {
  content?: ApiContentBlock[];
  stop_reason?: string | null;
}

/**
 * Handle stop_reason BEFORE reading content (spec §3): a classifier refusal
 * arrives as HTTP 200 with empty or partial content, and code that indexes
 * content[0] breaks. An engine refusal is a ToolResult and never comes
 * through here — the two must not look alike.
 */
export function refusalEvent(message: ApiMessage): SessionEvent | null {
  if (message.stop_reason === 'refusal') {
    return {
      t: 'session.error',
      message:
        'the model declined to answer (classifier refusal). This is not an ' +
        'engine finding — rephrase, or if mains-adjacent, consider the tier ' +
        'opt-in path.',
    };
  }
  return null;
}

/** Non-tool content blocks → deltas. Tool blocks are the loop's business. */
export function contentEvents(message: ApiMessage): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const block of message.content ?? []) {
    if (block.type === 'text' && block.text) {
      out.push({ t: 'message.delta', text: block.text });
    } else if (block.type === 'thinking' && block.thinking) {
      out.push({ t: 'thought.delta', text: block.thinking });
    }
  }
  return out;
}
