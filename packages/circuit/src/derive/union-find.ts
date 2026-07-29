export class DisjointSet {
  private parent = new Map<string, string>();

  add(x: string): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) throw new Error(`DisjointSet: unknown element ${x}`);
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups(): string[][] {
    const byRoot = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      const g = byRoot.get(root);
      if (g) g.push(x);
      else byRoot.set(root, [x]);
    }
    return [...byRoot.values()];
  }
}
