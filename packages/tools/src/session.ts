import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Project } from '@makerlord/project';
import { emptyProject } from '@makerlord/project';
import type { ToolResult } from './result.js';
import { ok, refuse } from './result.js';

export interface BuildState {
  currentStep: number;
  gateOpen: boolean;
  measurements: { name: string; value: number; unit: string }[];
}

export interface ProjectFile {
  version: 1;
  project: Project;
  build: BuildState;
}

/** A loaded project plus the hash of the bytes it was read from. */
export interface Session {
  path: string;
  file: ProjectFile;
  /** sha256 of the file content at load time — the optimistic-lock token. */
  hash: string;
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function emptyProjectFile(intent: string): ProjectFile {
  return {
    version: 1,
    project: emptyProject(intent),
    build: { currentStep: 0, gateOpen: false, measurements: [] },
  };
}

export function loadSession(path: string): Session {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`session: no project.json at ${abs}`);
  }
  const text = readFileSync(abs, 'utf8');
  const file = JSON.parse(text) as ProjectFile;
  if (file.version !== 1) {
    throw new Error(`session: unsupported project version ${String(file.version)}`);
  }
  return { path: abs, file, hash: contentHash(text) };
}

/**
 * Spec §4: writes go to a temp file in the same directory, then rename().
 * When expectHash is supplied and the file changed underneath, the save
 * REFUSES rather than clobbering — D34 means two writers.
 */
export function saveSession(
  session: Session,
  expectHash?: string,
): ToolResult<{ hash: string }> {
  const onDisk = existsSync(session.path)
    ? contentHash(readFileSync(session.path, 'utf8'))
    : undefined;

  if (expectHash !== undefined && onDisk !== undefined && onDisk !== expectHash) {
    return refuse(
      'STALE_PROJECT',
      'project changed since read; re-read and retry',
    );
  }

  const text = `${JSON.stringify(session.file, null, 2)}\n`;
  const tmp = join(dirname(session.path), `.project.json.tmp-${process.pid}`);
  writeFileSync(tmp, text);
  renameSync(tmp, session.path);
  const hash = contentHash(text);
  session.hash = hash;
  return ok({ hash });
}

/** Walk up from cwd looking for project.json, git-style. Error when absent. */
export function findProjectFile(cwd: string): string {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, 'project.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `session: no project.json found from ${resolve(cwd)} up to the root`,
      );
    }
    dir = parent;
  }
}

/**
 * project_init is the exception: it requires the ABSENCE of a project and
 * errors if one exists rather than silently overwriting it.
 */
export function initProjectFile(path: string, intent: string): Session {
  const abs = resolve(path);
  if (existsSync(abs)) {
    throw new Error(`session: ${abs} already exists — refusing to overwrite`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  const session: Session = { path: abs, file: emptyProjectFile(intent), hash: '' };
  const saved = saveSession(session);
  if (!saved.ok) throw new Error('session: initial save failed');
  return session;
}
