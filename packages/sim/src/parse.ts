/**
 * Parsers for ngspice batch output. Unit-tested against canned fixtures;
 * ngspice itself appears only in the integration layer (spec §10).
 */

/** `.op` output via `print all`: lines of `v(node) = 1.234e+00`. */
export function parseOpOutput(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /^([\w().@#[\]]+)\s*=\s*([-+0-9.eE]+)/;
  for (const line of text.split('\n')) {
    const m = re.exec(line.trim());
    if (!m) continue;
    const value = Number(m[2]);
    if (Number.isFinite(value)) out.set(m[1]!.toLowerCase(), value);
  }
  return out;
}

export interface Trace {
  /** Column 0 is the sweep variable (time or frequency). */
  columns: number[][];
}

/** `wrdata` output: whitespace-separated numeric columns. */
export function parseWrdata(text: string): Trace {
  const rows = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('*'))
    .map((l) => l.split(/\s+/).map(Number))
    .filter((r) => r.every((n) => Number.isFinite(n)));
  if (rows.length === 0) return { columns: [] };
  const width = rows[0]!.length;
  const columns: number[][] = Array.from({ length: width }, () => []);
  for (const row of rows) {
    if (row.length !== width) continue;
    row.forEach((v, i) => columns[i]!.push(v));
  }
  return { columns };
}

/** Minimum of a value column over the sweep window. */
export function traceMin(trace: Trace, column = 1): number {
  return Math.min(...(trace.columns[column] ?? [Number.POSITIVE_INFINITY]));
}

/**
 * The −3 dB corner: first sweep point where magnitude falls 3 dB below the
 * passband (taken as the first point's magnitude).
 */
export function cornerFrequency(trace: Trace): number | undefined {
  const freq = trace.columns[0];
  const mag = trace.columns[1];
  if (!freq || !mag || freq.length === 0) return undefined;
  const passband = mag[0]!;
  const target = passband * Math.SQRT1_2;
  for (let i = 0; i < mag.length; i += 1) {
    if (mag[i]! <= target) {
      if (i === 0) return freq[0];
      // Log-linear interpolation between the straddling points.
      const f0 = Math.log10(freq[i - 1]!);
      const f1 = Math.log10(freq[i]!);
      const m0 = mag[i - 1]!;
      const m1 = mag[i]!;
      const frac = (m0 - target) / (m0 - m1);
      return 10 ** (f0 + frac * (f1 - f0));
    }
  }
  return undefined;
}

export function downsample(trace: Trace, maxPoints: number): Trace {
  const n = trace.columns[0]?.length ?? 0;
  if (n <= maxPoints) return trace;
  const step = Math.ceil(n / maxPoints);
  return {
    columns: trace.columns.map((col) => col.filter((_, i) => i % step === 0)),
  };
}
