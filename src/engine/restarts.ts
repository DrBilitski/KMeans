import { InitMethod } from './init';
import { KState, Params, restart, solve } from './kmeans';

/**
 * Batch runs (Sections 9 and 10). Both use the same state machine as the main
 * view, just without stopping after each microstep.
 */

/** A fresh clustering of the same data with different parameters and seed. */
export function freshRun(s: KState, opts: { seed: number; k?: number; init?: InitMethod; maxIter?: number }): KState {
  const params: Params = {
    ...s.params,
    k: opts.k ?? s.params.k,
    init: opts.init ?? s.params.init,
    maxIter: opts.maxIter ?? s.params.maxIter,
  };
  return restart({ ...s, params, seed: opts.seed, rng: opts.seed, script: [], manualPreset: null, scenario: null });
}

export interface RestartRun {
  run: number;
  seed: number;
  final: KState;
  inertia: number;
  iterations: number;
  converged: boolean;
}

export const RESTART_COUNT = 10;

/** Run k-means to convergence with seeds seed, seed+1, … (same k and initialization method). */
export function runRestarts(s: KState, count = RESTART_COUNT): RestartRun[] {
  const runs: RestartRun[] = [];
  for (let i = 0; i < count; i++) {
    const seed = s.seed + i;
    const final = solve(freshRun(s, { seed }));
    runs.push({ run: i + 1, seed, final, inertia: final.inertia ?? 0, iterations: final.iteration, converged: final.status === 'converged' });
  }
  return runs;
}

export function bestRun(runs: RestartRun[]): number {
  let best = 0;
  runs.forEach((r, i) => {
    if (r.inertia < runs[best].inertia - 1e-12) best = i;
  });
  return best;
}
