import { randomBytes } from 'node:crypto';

/**
 * Spec §4.2: the session id is opaque, short-lived, and bound to exactly one
 * project. The agent receives the id and nothing else — no tokens, no paths.
 */
export class SessionStore {
  private byId = new Map<string, { projectPath: string; createdAt: number }>();

  mint(projectPath: string): string {
    const id = randomBytes(16).toString('hex');
    this.byId.set(id, { projectPath, createdAt: Date.now() });
    return id;
  }

  projectFor(sessionId: string): string | undefined {
    return this.byId.get(sessionId)?.projectPath;
  }

  revoke(sessionId: string): void {
    this.byId.delete(sessionId);
  }

  /** The mcpServers entry handed to the agent at session/new. */
  mcpServerFor(sessionId: string): {
    name: string;
    command: string;
    args: string[];
  } {
    return {
      name: 'maker',
      command: 'maker-bridge',
      args: ['mcp', '--session', sessionId],
    };
  }
}
