import { randomBytes, createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The auth stores (auth spec §3): flat files under MAKERLORD_USERS_PATH,
 * atomic-rename writes — the project.json durability posture, honest
 * about scale (tens of users, not millions). No passwords anywhere:
 * there is no field to put one in.
 */

export function usersPath(): string {
  return resolve(process.env.MAKERLORD_USERS_PATH ?? './users');
}

function readStore<T>(file: string, empty: T): T {
  const path = join(usersPath(), file);
  if (!existsSync(path)) return empty;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeStore(file: string, data: unknown): void {
  const dir = usersPath();
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${file}.tmp-${process.pid}`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, join(dir, file));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── invites (D52: human-minted, single-use, expiring) ─────────────────

export interface Invite {
  code: string;
  note?: string;
  createdAt: string;
  expiresAt: number;
  usedBy?: string;
}

export function createInvite(note?: string, ttlDays = 7): string {
  const invites = readStore<Invite[]>('invites.json', []);
  const code = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x');
  const invite: Invite = {
    code,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlDays * DAY_MS,
  };
  if (note !== undefined) invite.note = note;
  invites.push(invite);
  writeStore('invites.json', invites);
  return code;
}

export function listInvites(): Invite[] {
  return readStore<Invite[]>('invites.json', []);
}

/** True exactly once per valid code — burning is the admission. */
export function burnInvite(code: string, userId: string): boolean {
  const invites = readStore<Invite[]>('invites.json', []);
  const invite = invites.find((i) => i.code === code);
  if (!invite || invite.usedBy !== undefined || invite.expiresAt < Date.now()) {
    return false;
  }
  invite.usedBy = userId;
  writeStore('invites.json', invites);
  return true;
}

// ── users + passkey credentials ───────────────────────────────────────

export interface User {
  id: string;
  handle: string;
  createdAt: string;
}

export function createUser(handle: string): User {
  const users = readStore<User[]>('users.json', []);
  if (users.some((u) => u.handle.toLowerCase() === handle.toLowerCase())) {
    throw new Error(`handle "${handle}" is taken`);
  }
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(handle)) {
    throw new Error('handle must be 2–32 chars of letters, digits, - or _');
  }
  const user: User = {
    id: `u_${randomBytes(8).toString('hex')}`,
    handle,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeStore('users.json', users);
  return user;
}

export function listUsers(): User[] {
  return readStore<User[]>('users.json', []);
}

export function findUserByHandle(handle: string): User | null {
  return listUsers().find(
    (u) => u.handle.toLowerCase() === handle.toLowerCase()) ?? null;
}

export function findUserById(id: string): User | null {
  return listUsers().find((u) => u.id === id) ?? null;
}

export interface StoredCredential {
  userId: string;
  credentialId: string;
  publicKey: string;      // base64url COSE
  signCount: number;
  transports?: string[];
}

export function storeCredential(
  userId: string,
  cred: Omit<StoredCredential, 'userId'>,
): void {
  const all = readStore<StoredCredential[]>('credentials.json', []);
  all.push({ userId, ...cred });
  writeStore('credentials.json', all);
}

export function updateSignCount(credentialId: string, signCount: number): void {
  const all = readStore<StoredCredential[]>('credentials.json', []);
  const cred = all.find((c) => c.credentialId === credentialId);
  if (cred) {
    cred.signCount = signCount;
    writeStore('credentials.json', all);
  }
}

export function credentialsForUser(userId: string): StoredCredential[] {
  return readStore<StoredCredential[]>('credentials.json', [])
    .filter((c) => c.userId === userId);
}

export function allCredentials(): StoredCredential[] {
  return readStore<StoredCredential[]>('credentials.json', []);
}

// ── sessions (sliding 30 days) ────────────────────────────────────────

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

export function createSession(userId: string, ttlDays = 30): string {
  const sessions = readStore<Record<string, SessionRecord>>('sessions.json', {});
  const sid = `s_${randomBytes(24).toString('hex')}`;
  sessions[sid] = { userId, expiresAt: Date.now() + ttlDays * DAY_MS };
  writeStore('sessions.json', sessions);
  return sid;
}

export function getSession(sid: string): SessionRecord | null {
  const s = readStore<Record<string, SessionRecord>>('sessions.json', {})[sid];
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}

export function touchSession(sid: string, ttlDays = 30): void {
  const sessions = readStore<Record<string, SessionRecord>>('sessions.json', {});
  const s = sessions[sid];
  if (s && s.expiresAt >= Date.now()) {
    s.expiresAt = Date.now() + ttlDays * DAY_MS;
    writeStore('sessions.json', sessions);
  }
}

export function deleteSession(sid: string): void {
  const sessions = readStore<Record<string, SessionRecord>>('sessions.json', {});
  delete sessions[sid];
  writeStore('sessions.json', sessions);
}

// ── per-user API tokens (the bridge's credential) ─────────────────────

interface TokenRecord {
  userId: string;
  label: string;
  createdAt: string;
}

/** Returns the clear token ONCE; only its sha256 is stored. */
export function mintToken(userId: string, label: string): string {
  const clear = `mlt_${randomBytes(24).toString('hex')}`;
  const tokens = readStore<Record<string, TokenRecord>>('tokens.json', {});
  tokens[createHash('sha256').update(clear).digest('hex')] = {
    userId, label, createdAt: new Date().toISOString(),
  };
  writeStore('tokens.json', tokens);
  return clear;
}

export function resolveToken(clear: string): string | null {
  const tokens = readStore<Record<string, TokenRecord>>('tokens.json', {});
  return tokens[createHash('sha256').update(clear).digest('hex')]?.userId ?? null;
}
