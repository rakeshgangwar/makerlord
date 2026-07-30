declare global {
  namespace App {
    interface Locals {
      /** Set by hooks.server.ts when the session cookie resolves (D53). */
      userId: string | null;
      handle: string | null;
    }
  }
}

export {};
