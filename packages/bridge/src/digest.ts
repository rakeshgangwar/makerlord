/**
 * Condense a hosted transcript into a prompt preamble for a fresh bridge
 * session. A new local agent knows nothing of the conversation so far; this
 * hands it the dialogue — newest turns kept whole, oldest dropped first —
 * so it continues the project instead of re-introducing itself. Prose only:
 * findings and project state stay authoritative behind the tools.
 */

interface TranscriptRecord {
  kind?: string;
  text?: string;
  event?: { t?: string; text?: string; name?: string };
}

interface Turn {
  maker: string;
  agent: string;
  tools: string[];
}

/** One turn's agent prose is capped so a single long monologue cannot
 *  evict every other turn from the window — breadth beats depth here. */
const AGENT_CHARS_PER_TURN = 1500;

export function digestTranscript(records: unknown[], maxChars = 24_000): string {
  const turns: Turn[] = [];
  for (const raw of records) {
    const r = raw as TranscriptRecord;
    if (r.kind === 'maker' && typeof r.text === 'string') {
      turns.push({ maker: r.text, agent: '', tools: [] });
    } else if (r.kind === 'event' && r.event && turns.length > 0) {
      const turn = turns[turns.length - 1]!;
      if (r.event.t === 'message.delta' && typeof r.event.text === 'string') {
        turn.agent += r.event.text;
      } else if (r.event.t === 'tool.start' && typeof r.event.name === 'string') {
        turn.tools.push(r.event.name);
      }
    }
  }
  if (turns.length === 0) return '';

  const rendered = turns.map((t) => {
    const tools = t.tools.length ? `\n(tools used: ${t.tools.join(', ')})` : '';
    const agent = t.agent.trim();
    const clipped =
      agent.length > AGENT_CHARS_PER_TURN
        ? `${agent.slice(0, AGENT_CHARS_PER_TURN)} […truncated]`
        : agent;
    return `MAKER: ${t.maker}\nAGENT: ${clipped}${tools}`;
  });

  // Keep the most recent turns whole; drop from the front until it fits.
  const kept: string[] = [];
  let size = 0;
  for (let i = rendered.length - 1; i >= 0; i -= 1) {
    const piece = rendered[i]!;
    if (size + piece.length > maxChars && kept.length > 0) break;
    kept.unshift(piece.length > maxChars ? piece.slice(0, maxChars) : piece);
    size += piece.length;
  }
  const dropped = rendered.length - kept.length;

  return [
    'The conversation on this project so far (from the hosted transcript' +
      (dropped > 0 ? `; ${dropped} earlier turn${dropped === 1 ? '' : 's'} omitted` : '') +
      '). Continue it naturally — do not re-introduce yourself or redo completed work; project state is always available through the tools.',
    '',
    kept.join('\n\n'),
    '',
    "The maker's next message follows.",
    '---',
  ].join('\n');
}
