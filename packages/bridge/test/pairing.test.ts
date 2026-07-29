import { describe, expect, it } from 'vitest';
import { PairingStore } from '../src/pairing.js';
import { SessionStore } from '../src/sessions.js';

const APP = 'https://makerlord.io';

describe('pairing and origin pinning', () => {
  it('rejects connections from unknown origins', () => {
    const store = new PairingStore([APP]);
    expect(store.verifyOrigin('https://evil.example')).toBe(false);
    expect(store.verifyOrigin(undefined)).toBe(false);
    expect(store.verifyOrigin(APP)).toBe(true);
  });

  it('exchanges the printed code for a per-origin token, once', () => {
    const store = new PairingStore([APP]);
    const code = store.issuePairingCode();
    expect(code).toMatch(/^\d{6}$/);
    const token = store.redeem(APP, code);
    expect(token).toBeDefined();
    // The code burns on first use.
    expect(store.redeem(APP, code)).toBeUndefined();
    expect(store.verifyToken(APP, token)).toBe(true);
  });

  it('never redeems for a disallowed origin, even with the right code', () => {
    const store = new PairingStore([APP]);
    const code = store.issuePairingCode();
    expect(store.redeem('https://evil.example', code)).toBeUndefined();
  });

  it('rejects a wrong or missing token', () => {
    const store = new PairingStore([APP]);
    store.redeem(APP, store.issuePairingCode());
    expect(store.verifyToken(APP, 'wrong')).toBe(false);
    expect(store.verifyToken(APP, undefined)).toBe(false);
  });
});

describe('session scoping', () => {
  it('mints opaque ids bound to exactly one project', () => {
    const sessions = new SessionStore();
    const id = sessions.mint('/home/maker/lamp/project.json');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(sessions.projectFor(id)).toBe('/home/maker/lamp/project.json');
    sessions.revoke(id);
    expect(sessions.projectFor(id)).toBeUndefined();
  });

  it('hands the agent only the scoped command — no tokens, no paths', () => {
    const sessions = new SessionStore();
    const id = sessions.mint('/secret/location/project.json');
    const spec = sessions.mcpServerFor(id);
    expect(spec.command).toBe('maker-bridge');
    expect(spec.args).toEqual(['mcp', '--session', id]);
    expect(JSON.stringify(spec)).not.toContain('/secret/location');
  });
});
