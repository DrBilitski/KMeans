import { distinctCount } from './init';
import { KState, MAX_K, solve } from './kmeans';
import { freshRun } from './restarts';

/**
 * The elbow chart (Section 9): for k = 1 … 8, run k-means++ to convergence
 * several times with seeded restarts and keep the lowest final inertia.
 */

export interface ElbowPoint {
  k: number;
  inertia: number;
  /** Seed of the best restart. */
  seed: number;
}

export interface ElbowResult {
  seed: number;
  restarts: number;
  points: ElbowPoint[];
  pointCount: number;
}

export const ELBOW_RESTARTS = 5;

export function computeElbow(s: KState, restarts = ELBOW_RESTARTS): ElbowResult {
  const maxK = Math.min(MAX_K, distinctCount(s.points));
  const points: ElbowPoint[] = [];
  for (let k = 1; k <= maxK; k++) {
    let best: ElbowPoint | null = null;
    for (let r = 0; r < restarts; r++) {
      const seed = s.seed + 1000 * k + r;
      const final = solve(freshRun(s, { seed, k, init: 'kmeans++', maxIter: 100 }));
      const v = final.inertia ?? 0;
      if (!best || v < best.inertia - 1e-12) best = { k, inertia: v, seed };
    }
    points.push(best!);
  }
  return { seed: s.seed, restarts, points, pointCount: s.points.length };
}
