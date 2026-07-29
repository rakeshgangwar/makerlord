import type { Trace } from '@makerlord/sim';
import { downsample } from '@makerlord/sim';

/**
 * Waveform points from simulation CSV, client-side and zoomable (UI spec
 * §6). Pure projection: the canvas element draws what this returns.
 */
export interface WaveformView {
  points: { x: number; y: number }[];
  xRange: [number, number];
  yRange: [number, number];
}

export function waveformView(
  trace: Trace,
  widthPx: number,
  heightPx: number,
  maxPoints = 2000,
): WaveformView {
  const t = downsample(trace, maxPoints);
  const xs = t.columns[0] ?? [];
  const ys = t.columns[1] ?? [];
  if (xs.length === 0) {
    return { points: [], xRange: [0, 1], yRange: [0, 1] };
  }
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  return {
    points: xs.map((x, i) => ({
      x: ((x - xMin) / xSpan) * widthPx,
      y: heightPx - ((ys[i]! - yMin) / ySpan) * heightPx,
    })),
    xRange: [xMin, xMax],
    yRange: [yMin, yMax],
  };
}
