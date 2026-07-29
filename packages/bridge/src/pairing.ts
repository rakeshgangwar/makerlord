import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Spec §7: the bridge binds 127.0.0.1 only, accepts WebSocket connections
 * only from the configured app origin, and requires a one-time pairing code
 * on first connection. A drive-by page cannot claim the bridge.
 */
export class PairingStore {
  private tokensByOrigin = new Map<string, string>();
  private activeCode: string | undefined;

  constructor(private allowedOrigins: string[]) {}

  verifyOrigin(origin: string | undefined): boolean {
    return origin !== undefined && this.allowedOrigins.includes(origin);
  }

  /** Printed to the bridge's own console; entered once in the app. */
  issuePairingCode(): string {
    this.activeCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    return this.activeCode;
  }

  /** Exchange the code for a per-origin token. One shot — the code burns. */
  redeem(origin: string, code: string): string | undefined {
    if (!this.verifyOrigin(origin)) return undefined;
    if (this.activeCode === undefined || code !== this.activeCode) return undefined;
    this.activeCode = undefined;
    const token = randomBytes(24).toString('hex');
    this.tokensByOrigin.set(origin, token);
    return token;
  }

  verifyToken(origin: string | undefined, token: string | undefined): boolean {
    if (!this.verifyOrigin(origin) || token === undefined) return false;
    const stored = this.tokensByOrigin.get(origin!);
    if (stored === undefined || stored.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(stored), Buffer.from(token));
  }
}
