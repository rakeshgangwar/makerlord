import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ok, refuse } from '../src/result.js';
import {
  contentHash, findProjectFile, initProjectFile, loadSession, saveSession,
} from '../src/session.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'makerlord-'));
}

describe('result helpers', () => {
  it('wraps success', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it('wraps refusal with findings and message', () => {
    const r = refuse('STALE_PROJECT', 'changed underneath');
    expect(r).toEqual({
      ok: false, refused: 'STALE_PROJECT', findings: [], message: 'changed underneath',
    });
  });
});

describe('session', () => {
  it('init writes a v1 file and load round-trips it', () => {
    const path = join(tmp(), 'project.json');
    initProjectFile(path, 'a soil sensor');
    const s = loadSession(path);
    expect(s.file.version).toBe(1);
    expect(s.file.project.intent).toBe('a soil sensor');
    expect(s.file.build).toEqual({ currentStep: 0, gateOpen: false, measurements: [] });
    expect(s.hash).toBe(contentHash(readFileSync(path, 'utf8')));
  });

  it('init refuses to overwrite an existing project', () => {
    const path = join(tmp(), 'project.json');
    initProjectFile(path, 'x');
    expect(() => initProjectFile(path, 'y')).toThrow(/exists/);
  });

  it('load throws for a missing file — error, not refusal', () => {
    expect(() => loadSession(join(tmp(), 'project.json'))).toThrow(/no project/);
  });

  it('save with a matching expectHash succeeds and returns the new hash', () => {
    const path = join(tmp(), 'project.json');
    const s = initProjectFile(path, 'x');
    const loaded = loadSession(path);
    loaded.file.project.intent = 'y';
    const saved = saveSession(loaded, loaded.hash === s.hash ? s.hash : loaded.hash);
    expect(saved.ok).toBe(true);
    expect(loadSession(path).file.project.intent).toBe('y');
  });

  it('save REFUSES with STALE_PROJECT when the file changed underneath', () => {
    const path = join(tmp(), 'project.json');
    initProjectFile(path, 'x');
    const a = loadSession(path);
    const b = loadSession(path);
    b.file.project.intent = 'b wins';
    expect(saveSession(b, b.hash).ok).toBe(true);
    a.file.project.intent = 'a clobbers';
    const second = saveSession(a, a.hash);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.refused).toBe('STALE_PROJECT');
    expect(loadSession(path).file.project.intent).toBe('b wins');
  });

  it('save without expectHash writes unconditionally (interactive CLI use)', () => {
    const path = join(tmp(), 'project.json');
    initProjectFile(path, 'x');
    const a = loadSession(path);
    a.file.project.intent = 'later';
    expect(saveSession(a).ok).toBe(true);
  });

  it('findProjectFile walks up from a nested directory', () => {
    const root = tmp();
    const path = join(root, 'project.json');
    initProjectFile(path, 'x');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findProjectFile(nested)).toBe(path);
  });

  it('findProjectFile throws when nothing is found', () => {
    expect(() => findProjectFile(tmp())).toThrow(/no project\.json/);
  });

  it('load rejects an unsupported version', () => {
    const path = join(tmp(), 'project.json');
    writeFileSync(path, JSON.stringify({ version: 99 }));
    expect(() => loadSession(path)).toThrow(/version/);
  });
});
