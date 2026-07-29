/**
 * The agent cannot argue with a BLOCKER indefinitely (spec §10). After three
 * attempts to re-justify, it stops and surfaces the finding plainly. The
 * counter resets on the next user message — new information deserves a fresh
 * hearing; an agent talking itself in circles does not.
 */
export const MAX_OBJECTIONS = 3;

export class ObjectionCounter {
  private counts = new Map<string, number>();

  /** Returns true while the agent may keep arguing about this finding. */
  recordObjection(ruleId: string): boolean {
    const next = (this.counts.get(ruleId) ?? 0) + 1;
    this.counts.set(ruleId, next);
    return next <= MAX_OBJECTIONS;
  }

  exhausted(ruleId: string): boolean {
    return (this.counts.get(ruleId) ?? 0) >= MAX_OBJECTIONS;
  }

  /** A new user message resets every counter. */
  resetOnUserMessage(): void {
    this.counts.clear();
  }
}
