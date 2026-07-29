/**
 * Selection is model-level, not view-level (UI spec §6). Clicking R3 selects
 * a model entity; every open view highlights it. A view added later inherits
 * linkage for free because it reads the same store.
 */
export type ModelEntity =
  | { kind: 'part'; ref: string }
  | { kind: 'net'; name: string }
  | { kind: 'block'; id: string }
  | { kind: 'requirement'; id: string };

export class SelectionStore {
  private current: ModelEntity | null = null;
  private listeners = new Set<(e: ModelEntity | null) => void>();

  select(entity: ModelEntity | null): void {
    this.current = entity;
    for (const l of this.listeners) l(entity);
  }

  selected(): ModelEntity | null {
    return this.current;
  }

  subscribe(listener: (e: ModelEntity | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  isSelected(entity: ModelEntity): boolean {
    if (!this.current) return false;
    return JSON.stringify(this.current) === JSON.stringify(entity);
  }
}
