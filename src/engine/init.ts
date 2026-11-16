import { fmtProb } from './format';
import { DataPoint, Pt, dist2, samePt } from './geometry';

/**
 * Centroid initialization: random points (Forgy), k-means++, and manual.
 * Every random choice is recorded in an InitDraw so the Initialization panel
 * can show the number drawn and exactly how it selected a point.
 */

export type InitMethod = 'random' | 'kmeans++' | 'manual';

export const INIT_NAMES: Record<InitMethod, string> = {
  random: 'Random points (Forgy)',
  'kmeans++': 'K-means++',
  manual: 'Manual (click to place)',
};

/** One row of the k-means++ probability table / one segment of the bar. */
export interface PlusPlusRow {
  point: number;
  /** D(p)²: squared distance to the nearest centroid chosen so far. */
  d2: number;
  /** Which existing centroid is nearest (lowest index on ties). */
  nearest: number;
  prob: number;
  /** Interval [lo, hi) on the 0–1 bar. Zero width when D(p)² = 0. */
  lo: number;
  hi: number;
}

export interface InitDraw {
  /** Index of the centroid this draw places (0 = C1). */
  centroid: number;
  kind: 'uniform' | 'weighted' | 'manual';
  /** The random number in [0, 1), quantised to 3 decimals (null for manual). */
  random: number | null;
  /** True when the number came from a scenario's predetermined list. */
  scripted: boolean;
  /** Uniform draws: the eligible points, in order. */
  candidates: number[];
  /** Weighted (k-means++) draws: the D(p)² table. */
  rows: PlusPlusRow[] | null;
  total: number;
  /** The chosen data point (null for manual placement). */
  pick: number | null;
  /** Position the centroid will be placed at (known once chosen). */
  position: Pt | null;
}

/**
 * Points eligible for a uniform pick: not already a centroid position, and
 * only the first of any duplicate positions, so the k centroids are distinct.
 */
export function uniformCandidates(points: Pt[], centroids: Pt[]): number[] {
  const out: number[] = [];
  points.forEach((p, i) => {
    if (centroids.some((c) => samePt(c, p))) return;
    if (out.some((j) => samePt(points[j], p))) return;
    out.push(i);
  });
  return out;
}

/** Number of distinct positions in the data (k-means can't place more distinct centroids). */
export function distinctCount(points: Pt[]): number {
  return uniformCandidates(points, []).length;
}

/** index = floor(r × number of candidates). */
export function pickUniform(r: number, candidates: number[]): { slot: number; pick: number } {
  const slot = Math.min(candidates.length - 1, Math.floor(r * candidates.length));
  return { slot, pick: candidates[slot] };
}

/** The k-means++ D(p)² table for the next centroid. */
export function plusPlusTable(points: Pt[], centroids: Pt[]): { rows: PlusPlusRow[]; total: number } {
  const base = points.map((p, i) => {
    let best = Infinity;
    let nearest = 0;
    centroids.forEach((c, j) => {
      const d = dist2(p, c);
      if (d < best) {
        best = d;
        nearest = j;
      }
    });
    return { point: i, d2: best, nearest };
  });
  const total = base.reduce((s, r) => s + r.d2, 0);
  let cum = 0;
  const rows = base.map((r) => {
    const lo = total > 0 ? cum / total : 0;
    cum += r.d2;
    const hi = total > 0 ? cum / total : 0;
    return { ...r, prob: total > 0 ? r.d2 / total : 0, lo, hi };
  });
  return { rows, total };
}

/** The row whose interval [lo, hi) contains r. Zero-width rows can never be picked. */
export function pickWeighted(r: number, rows: PlusPlusRow[]): number {
  const live = rows.filter((row) => row.d2 > 0);
  const hit = live.find((row) => r >= row.lo && r < row.hi);
  return (hit ?? live[live.length - 1]).point;
}

/** Plain-English description of how a draw selected its point. */
export function describeDraw(d: InitDraw, points: DataPoint[]): string {
  const name = `C${d.centroid + 1}`;
  if (d.kind === 'manual' || d.position === null) return `${name} was placed by hand.`;
  const r = d.random !== null ? fmtProb(d.random) : '?';
  if (d.kind === 'uniform' && d.pick !== null) {
    const n = d.candidates.length;
    const slot = d.candidates.indexOf(d.pick);
    return `${r} × ${n} points = ${fmtProb((d.random ?? 0) * n, 2)} → slot ${slot + 1} of ${n} → ${points[d.pick].label}`;
  }
  if (d.kind === 'weighted' && d.pick !== null && d.rows) {
    const row = d.rows.find((x) => x.point === d.pick)!;
    return `${r} falls in ${points[d.pick].label}'s interval [${fmtProb(row.lo, 4)}, ${fmtProb(row.hi, 4)})`;
  }
  return '';
}
