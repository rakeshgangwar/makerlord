/**
 * Two size measures, not one (spec §4, inherited from buzz's types.rs).
 * estimatedBytes is the true wire size and guards request-body truncation;
 * contextPressureBytes is the token-equivalent and gates compaction.
 *
 * An image charges a FLAT 16 KiB of pressure — providers bill visual tiles
 * (~2K tokens), not string length. Buzz's recorded failure: a single 3.1 MB
 * image tripped their handoff gate on a fresh context, over-counting ~1500×.
 */
export const IMAGE_PRESSURE_BYTES = 16 * 1024;

export interface ContentPiece {
  type: string;
  text?: string;
  source?: { type: string; data?: string };
  [key: string]: unknown;
}

export interface CountableMessage {
  role: string;
  content: string | ContentPiece[];
}

function isImage(piece: ContentPiece): boolean {
  return piece.type === 'image';
}

function pieceBytes(piece: ContentPiece): number {
  if (isImage(piece)) return Buffer.byteLength(piece.source?.data ?? '', 'utf8');
  if (typeof piece.text === 'string') return Buffer.byteLength(piece.text, 'utf8');
  return Buffer.byteLength(JSON.stringify(piece), 'utf8');
}

export function estimatedBytes(msg: CountableMessage): number {
  if (typeof msg.content === 'string') {
    return Buffer.byteLength(msg.content, 'utf8');
  }
  return msg.content.reduce((sum, piece) => sum + pieceBytes(piece), 0);
}

export function contextPressureBytes(msg: CountableMessage): number {
  if (typeof msg.content === 'string') {
    return Buffer.byteLength(msg.content, 'utf8');
  }
  return msg.content.reduce(
    (sum, piece) => sum + (isImage(piece) ? IMAGE_PRESSURE_BYTES : pieceBytes(piece)),
    0,
  );
}

export function totalPressure(messages: CountableMessage[]): number {
  return messages.reduce((sum, m) => sum + contextPressureBytes(m), 0);
}
