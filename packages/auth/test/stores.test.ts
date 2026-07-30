import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  burnInvite, createInvite, createSession, createUser, findUserByHandle,
  getSession, listInvites, mintToken, resolveToken, storeCredential,
  credentialsForUser, allCredentials, touchSession, deleteSession, listUsers,
  addProviderConfig, getProviderConfig, listProviderConfigs,
  removeProviderConfig, setActiveProvider,
} from '../src/stores.js';

/**
 * The auth stores (auth spec §3): flat files, atomic writes, honest
 * about scale. No passwords anywhere — the schema has no field to put
 * one in.
 */

beforeEach(() => {
  process.env.MAKERLORD_USERS_PATH = mkdtempSync(join(tmpdir(), 'makerlord-auth-'));
});

describe('invites — human-minted, single-use, expiring (D52)', () => {
  it('mints, validates, burns exactly once', () => {
    const code = createInvite('for the neighbour');
    expect(code).toMatch(/^[a-z0-9-]{12,}$/);
    expect(listInvites().find((i) => i.code === code)?.note).toBe('for the neighbour');
    const user = createUser('sam');
    expect(burnInvite(code, user.id)).toBe(true);
    expect(burnInvite(code, user.id)).toBe(false);   // single-use
  });

  it('an expired invite refuses to burn', () => {
    const code = createInvite('old', -1);   // expired a day ago
    expect(burnInvite(code, 'u1')).toBe(false);
  });
});

describe('users + credentials', () => {
  it('creates users with unique handles and stores passkeys', () => {
    const u = createUser('rakesh');
    expect(u.id).toMatch(/^u_[a-f0-9]+$/);
    expect(() => createUser('rakesh')).toThrow(/handle/i);
    expect(findUserByHandle('rakesh')?.id).toBe(u.id);

    storeCredential(u.id, {
      credentialId: 'cred-abc', publicKey: 'b64-cose-key',
      signCount: 0, transports: ['internal'],
    });
    expect(credentialsForUser(u.id)).toHaveLength(1);
    // Usernameless login needs the full credential → user mapping.
    expect(allCredentials().find((c) => c.credentialId === 'cred-abc')?.userId).toBe(u.id);
    expect(listUsers()).toHaveLength(1);
  });
});

describe('sessions — sliding 30 days', () => {
  it('creates, resolves, touches and deletes', () => {
    const u = createUser('sam');
    const sid = createSession(u.id);
    expect(getSession(sid)?.userId).toBe(u.id);
    const before = getSession(sid)!.expiresAt;
    touchSession(sid);
    expect(getSession(sid)!.expiresAt >= before).toBe(true);
    deleteSession(sid);
    expect(getSession(sid)).toBeNull();
  });

  it('an expired session resolves to null', () => {
    const u = createUser('sam');
    const sid = createSession(u.id, -1);
    expect(getSession(sid)).toBeNull();
  });
});

describe('tokens — shown once, stored hashed', () => {
  it('mints and resolves; the store never holds the clear token', () => {
    const u = createUser('sam');
    const clear = mintToken(u.id, 'bridge on the shop laptop');
    expect(clear).toMatch(/^mlt_[a-f0-9]{48}$/);
    expect(resolveToken(clear)).toBe(u.id);
    expect(resolveToken('mlt_' + '0'.repeat(48))).toBeNull();
    const raw = readFileSync(
      join(process.env.MAKERLORD_USERS_PATH!, 'tokens.json'), 'utf8');
    expect(raw).not.toContain(clear.slice(4));
  });
});

describe('BYOK provider books — many providers, one active, keys sealed', () => {
  it('adds, lists masked, switches active, removes; clear key never lands on disk', () => {
    const u = createUser('keyed');
    const a = addProviderConfig(u.id, {
      provider: 'openrouter', model: 'meta-llama/llama-4', apiKey: 'sk-or-secret-tail9',
    });
    const b = addProviderConfig(u.id, {
      provider: 'openai', model: 'gpt-5.2', apiKey: 'sk-oa-secret-zz42',
    });
    // First added is active; the active config decrypts for sessions.
    expect(getProviderConfig(u.id)?.apiKey).toBe('sk-or-secret-tail9');
    const listed = listProviderConfigs(u.id);
    expect(listed).toHaveLength(2);
    expect(listed.find((x) => x.id === a)?.active).toBe(true);
    expect(listed.find((x) => x.id === b)?.keyTail).toBe('zz42');

    expect(setActiveProvider(u.id, b)).toBe(true);
    expect(getProviderConfig(u.id)?.provider).toBe('openai');

    const raw = readFileSync(
      join(process.env.MAKERLORD_USERS_PATH!, 'providers.json'), 'utf8');
    expect(raw).not.toContain('sk-or-secret');
    expect(raw).not.toContain('sk-oa-secret');

    removeProviderConfig(u.id, b);
    expect(getProviderConfig(u.id)?.provider).toBe('openrouter');   // active falls back
    removeProviderConfig(u.id, a);
    expect(getProviderConfig(u.id)).toBeNull();
  });
});
