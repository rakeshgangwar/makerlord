import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The uploaded-datasheet store (curation spec §3.5): content-hashed,
 * immutable, deduped. A stored PDF is citable as `upload:sha256:<hash>`
 * beside URLs — and the reviewing human at promotion opens the exact
 * same bytes the agent drafted from.
 */

export const UPLOAD_REF_RE = /^upload:sha256:([0-9a-f]{64})$/;

export function datasheetsDir(): string {
  return resolve(process.env.MAKERLORD_DATASHEETS_PATH ?? './data/datasheets');
}

export function isUploadRef(citation: string): boolean {
  return UPLOAD_REF_RE.test(citation);
}

export function saveDatasheet(bytes: Buffer): { ref: string; path: string } {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const dir = datasheetsDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${hash}.pdf`);
  if (!existsSync(path)) writeFileSync(path, bytes);   // dedupe by content
  return { ref: `upload:sha256:${hash}`, path };
}

/** The stored path for a citation ref, or null if it was never uploaded. */
export function datasheetPath(ref: string): string | null {
  const m = UPLOAD_REF_RE.exec(ref);
  if (!m) return null;
  const path = join(datasheetsDir(), `${m[1]}.pdf`);
  return existsSync(path) ? path : null;
}
