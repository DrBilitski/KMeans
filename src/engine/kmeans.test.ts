import { describe, expect, it } from 'vitest';
import { DATASETS } from './datasets';
import { computeElbow } from './elbow';
import { fmt2, fmtInertia, fmtProb } from './format';
import { distanceCalc, voronoiCells } from './geometry';
import { pickWeighted, plusPlusTable } from './init';
import {
  KState,
  addPoint,
  advance,
  advanceIteration,
  advancePhase,
  createInitialState,
  loadDataset,
  placeManualCentroid,
  removePoint,
  restart,
  runToConvergence,
  setParams,
  solve,
} from './kmeans';
import { bestRun, freshRun, runRestarts } from './restarts';
import { SCENARIOS } from './scenarios';

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!.build();
const run = (s: KState, n: number) => {
  for (let i = 0; i < n; i++) s = advance(s);
  return s;
};
/** Advance until `pred` holds (at most 10 000 microsteps). */
const until = (s: KState, pred: (t: KState) => boolean) => {
  for (let i = 0; i < 10000 && !pred(s); i++) {
    const n = advance(s);
    if (n === s) break;
    s = n;
  }
  return s;
};
const label = (s: KState, i: number) => s.points[i].label;
const clusterOf = (s: KState, l: string) => s.assign[s.points.findIndex((p) => p.label === l)];

describe('Section 8 worked example (Scenario A)', () => {
  const start = scenario('worked');

  it('loads the Tiny dataset with manual centroids and per-point stepping', () => {
    expect(start.points.map((p) => p.label).join('')).toBe('ABCDEFG');
    expect(start.params.k).toBe(2);
    expect(start.params.init).toBe('manual');
    const placed = run(start, 2);
    expect(placed.centroids).toEqual([
      { x: 1, y: 1 },
      { x: 5, y: 7 },
    ]);
    // 2 placements, then Select / Measure / Choose for the first point
    expect(advance(placed).phase).toBe('selectPoint');
  });

  it('iteration 1: every distance, the tie at C, assignments and inertia 33.250', () => {
    let s = run(start, 2);
    const expected: Record<string, [string, string, number]> = {
      A: ['0.00', '7.21', 0],
      B: ['1.12', '6.10', 0],
      C: ['3.61', '3.61', 0],
      D: ['7.21', '0.00', 1],
      E: ['4.72', '2.50', 1],
      F: ['5.32', '2.06', 1],
      G: ['4.30', '2.92', 1],
    };
    for (let i = 0; i < 7; i++) {
      s = advance(s);
      expect(s.phase).toBe('selectPoint');
      s = advance(s);
      expect(s.phase).toBe('measure');
      const [d1, d2, cl] = expected[label(s, i)];
      expect(s.dist!.rows.map((r) => fmt2(r.d))).toEqual([d1, d2]);
      s = advance(s);
      expect(s.phase).toBe('choose');
      expect(s.assign[i]).toBe(cl);
      if (label(s, i) === 'C') {
        expect(s.dist!.tied).toEqual([0, 1]);
        expect(s.dist!.rows[0].d2).toBe(13);
        expect(s.explanation).toContain('Tie');
        expect(s.explanation).toContain('lower-numbered');
      } else {
        expect(s.dist!.tied).toHaveLength(1);
      }
    }
    expect(fmtInertia(s.inertia!)).toBe('33.250');
    expect(s.history).toEqual([{ iteration: 1, half: 'assign', value: 33.25 }]);
  });

  it('update 1: C1 = (1.83, 2.33), C2 = (4.13, 5.38), inertia 12.208', () => {
    let s = advancePhase(advancePhase(start)); // placement, assignment
    s = advance(s);
    expect(s.phase).toBe('gather');
    expect(s.mean!.members.map((i) => label(s, i))).toEqual(['A', 'B', 'C']);
    s = advance(s);
    expect(s.phase).toBe('computeMean');
    expect(fmtNum1(s.mean!.sumX)).toBe('5.5');
    expect(fmtNum1(s.mean!.sumY)).toBe('7.0');
    expect(s.mean!.n).toBe(3);
    s = advance(s);
    expect(s.phase).toBe('move');
    expect(s.centroids[0].x).toBeCloseTo(5.5 / 3, 12);
    expect(fmt2(s.centroids[0].x) + ',' + fmt2(s.centroids[0].y)).toBe('1.83,2.33');
    s = run(s, 3);
    expect(s.mean!.members.map((i) => label(s, i))).toEqual(['D', 'E', 'F', 'G']);
    expect(fmtNum1(s.mean!.sumX)).toBe('16.5');
    expect(fmtNum1(s.mean!.sumY)).toBe('21.5');
    expect(s.centroids[1]).toEqual({ x: 4.125, y: 5.375 });
    expect(fmt2(s.centroids[1].x) + ',' + fmt2(s.centroids[1].y)).toBe('4.13,5.38');
    expect(fmtInertia(s.inertia!)).toBe('12.208');
    s = advance(s);
    expect(s.phase).toBe('check');
    expect(s.check!.converged).toBe(false);
    expect(s.check!.changes).toHaveLength(7);
  });

  it('iteration 2: C switches to cluster 2; inertia 11.226 then 8.525', () => {
    let s = advanceIteration(start);
    expect(s.iteration).toBe(1);
    s = advancePhase(s);
    const ci = 2;
    expect(label(s, ci)).toBe('C');
    const dc = distanceCalc(ci, s.points[ci], [
      { x: 5.5 / 3, y: 7 / 3 },
      { x: 4.125, y: 5.375 },
    ]);
    expect(dc.rows.map((r) => fmt2(r.d))).toEqual(['2.03', '1.78']);
    expect(clusterOf(s, 'C')).toBe(1);
    expect(s.changes).toEqual([{ point: ci, from: 0, to: 1 }]);
    expect(fmtInertia(s.inertia!)).toBe('11.226');
    s = advancePhase(s);
    expect(s.centroids.map((c) => `${fmt2(c.x)},${fmt2(c.y)}`)).toEqual(['1.25,1.50', '3.90,5.10']);
    expect(fmtInertia(s.inertia!)).toBe('8.525');
    s = advance(s);
    expect(s.check).toMatchObject({ iteration: 2, converged: false });
    expect(s.status).toBe('running');
  });

  it('the moment C switches is called out', () => {
    let s = advanceIteration(start);
    s = until(s, (t) => t.phase === 'choose' && t.cursor === 2);
    expect(s.lastChange).toEqual({ point: 2, from: 0, to: 1 });
    expect(s.explanation).toContain('C moved from C1 to C2');
  });

  it('iteration 3: nothing changes, converged with inertia 8.525', () => {
    const s = runToConvergence(start);
    expect(s.status).toBe('converged');
    expect(s.iteration).toBe(3);
    expect(s.check!.changes).toHaveLength(0);
    expect(fmtInertia(s.inertia!)).toBe('8.525');
    expect(s.history.map((h) => fmtInertia(h.value))).toEqual(['33.250', '12.208', '11.226', '8.525', '8.525', '8.525']);
    expect(s.explanation).toContain('CONVERGED');
  });
});

const fmtNum1 = (n: number) => n.toFixed(1);

describe('Section 8 k-means++ worked example', () => {
  const tiny = loadDataset(createInitialState(), 'tiny');
  const { rows, total } = plusPlusTable(tiny.points, [{ x: 1, y: 1 }]);

  it('computes D(p)², probabilities and intervals', () => {
    expect(total).toBe(135.25);
    expect(rows.map((r) => r.d2)).toEqual([0, 1.25, 13, 52, 22.25, 28.25, 18.5]);
    expect(rows.map((r) => fmtProb(r.prob, 4))).toEqual(['0.0000', '0.0092', '0.0961', '0.3845', '0.1645', '0.2089', '0.1368']);
    expect(rows.slice(1).map((r) => `[${fmtProb(r.lo, 4)}, ${fmtProb(r.hi, 4)})`)).toEqual([
      '[0.0000, 0.0092)',
      '[0.0092, 0.1054)',
      '[0.1054, 0.4898)',
      '[0.4898, 0.6543)',
      '[0.6543, 0.8632)',
      '[0.8632, 1.0000)',
    ]);
  });

  it('0.400 falls in D’s interval; A (D² = 0) can never be chosen', () => {
    expect(tiny.points[pickWeighted(0.4, rows)].label).toBe('D');
    expect(tiny.points[pickWeighted(0, rows)].label).toBe('B');
    for (let r = 0; r < 1; r += 0.001) expect(pickWeighted(r, rows)).not.toBe(0);
  });

  it('runs through the state machine with predetermined numbers', () => {
    // first draw 0.0 picks A (uniform, slot 1 of 7); second draw 0.400 picks D
    let s = setParams(tiny, { k: 2, init: 'kmeans++' });
    s = { ...s, script: [0.0, 0.4] };
    s = advance(s);
    expect(s.phase).toBe('initPlace');
    expect(s.centroids).toEqual([{ x: 1, y: 1 }]);
    s = advance(s);
    expect(s.phase).toBe('initD2');
    expect(s.pendingInit!.total).toBe(135.25);
    s = advance(s);
    expect(s.phase).toBe('initDraw');
    expect(s.pendingInit!.random).toBe(0.4);
    expect(s.pendingInit!.scripted).toBe(true);
    expect(label(s, s.pendingInit!.pick!)).toBe('D');
    expect(s.centroids).toHaveLength(1); // not placed until the next microstep
    s = advance(s);
    expect(s.phase).toBe('initPlace');
    expect(s.centroids[1]).toEqual({ x: 5, y: 7 });
    expect(s.initDraws).toHaveLength(2);
  });
});

describe('algorithm properties', () => {
  it('inertia never increases across half-iterations, on every dataset and several seeds', () => {
    for (const ds of DATASETS) {
      for (const seed of [1, 7, 2024, 31337]) {
        for (const init of ['random', 'kmeans++'] as const) {
          let s = loadDataset(createInitialState(seed), ds.id);
          s = setParams(s, { k: ds.k + (seed % 3), init });
          const done = solve(s);
          const h = done.history.map((x) => x.value);
          for (let i = 1; i < h.length; i++) expect(h[i]).toBeLessThanOrEqual(h[i - 1] + 1e-9);
          expect(['converged', 'maxIter']).toContain(done.status);
        }
      }
    }
  });

  it('detects convergence exactly when no point changes cluster', () => {
    for (const ds of DATASETS) {
      let s = setParams(loadDataset(createInitialState(99), ds.id), { k: 3, maxIter: 100 });
      while (s.status !== 'converged') {
        s = advanceIteration(s);
        expect(s.phase).toBe('check');
        expect(s.check!.converged).toBe(s.check!.changes.length === 0);
        expect(s.status === 'converged').toBe(s.check!.changes.length === 0);
      }
    }
  });

  it('stops at the iteration cap and says it is a cutoff', () => {
    let s = setParams(loadDataset(createInitialState(3), 'thin'), { k: 3, init: 'random', maxIter: 1 });
    s = runToConvergence(s);
    expect(s.status).toBe('maxIter');
    expect(s.check!.cutoff).toBe(true);
    expect(s.explanation).toContain('CUTOFF');
    expect(advance(s)).toBe(s);
  });

  it('empty clusters keep their centroid in place (Scenario I)', () => {
    const s0 = scenario('empty');
    let s = run(s0, 3);
    expect(s.centroids[2]).toEqual({ x: 9, y: 1 });
    s = advancePhase(s); // assignment
    expect(s.assign.includes(2)).toBe(false);
    s = until(s, (t) => t.phase === 'computeMean' && t.cursor === 2);
    expect(s.mean!.empty).toBe(true);
    expect(s.explanation).toContain('C3 has no points, so it has no mean and does not move');
    s = advance(s);
    expect(s.centroids[2]).toEqual({ x: 9, y: 1 });
    const done = runToConvergence(s);
    expect(done.centroids[2]).toEqual({ x: 9, y: 1 });
    expect(done.status).toBe('converged');
  });

  it('ties go to the lowest-numbered centroid', () => {
    const p = { x: 5, y: 5 };
    const c = [
      { x: 9, y: 9 },
      { x: 1, y: 5 },
      { x: 5, y: 1 },
      { x: 9, y: 5 },
    ];
    const d = distanceCalc(0, p, c);
    expect(d.tied).toEqual([1, 2, 3]);
    expect(d.winner).toBe(1);
  });

  it('the same seed gives identical runs; a different seed is allowed to differ', () => {
    const a = runToConvergence(setParams(createInitialState(42), { init: 'random' }));
    const b = runToConvergence(setParams(createInitialState(42), { init: 'random' }));
    expect(a).toEqual(b);
  });

  it('nothing changes without an explicit advance (pause safety)', () => {
    const s = run(createInitialState(), 5);
    const copy = JSON.parse(JSON.stringify(s));
    // reading derived values must not mutate the state
    advance(s);
    advancePhase(s);
    solve(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(copy);
  });

  it('advance on a converged state returns the very same object', () => {
    const s = solve(createInitialState());
    expect(s.status).toBe('converged');
    expect(advance(s)).toBe(s);
  });

  it('restart keeps data and k, clears centroids, and continues the random stream', () => {
    const s = solve(createInitialState());
    const r = restart(s);
    expect(r.points).toBe(s.points);
    expect(r.params.k).toBe(3);
    expect(r.centroids).toHaveLength(0);
    expect(r.rng).toBe(s.rng);
    expect(r.assign.every((a) => a === null)).toBe(true);
  });

  it('editing data resets the clustering but keeps k and the initialization method', () => {
    let s = solve(setParams(createInitialState(), { k: 4, init: 'random' }));
    s = addPoint(s, { x: 3.14159, y: 2.71828 });
    expect(s.points[s.points.length - 1]).toMatchObject({ x: 3.1, y: 2.7, label: 'P31' });
    expect(s.centroids).toHaveLength(0);
    expect(s.params).toMatchObject({ k: 4, init: 'random' });
    s = removePoint(s, 0);
    expect(s.points[0].label).toBe('P2');
    expect(s.datasetId).toBeNull();
  });

  it('manual initialization waits for clicks, then places centroids where clicked', () => {
    let s = setParams(createInitialState(), { init: 'manual', k: 2 });
    expect(advance(s)).toBe(s);
    s = placeManualCentroid(s, { x: 2.04, y: 7.96 });
    expect(s.centroids).toEqual([{ x: 2, y: 8 }]);
    s = placeManualCentroid(s, { x: 8, y: 2 });
    expect(s.centroids).toHaveLength(2);
    expect(placeManualCentroid(s, { x: 5, y: 5 })).toBe(s);
    expect(advance(s).phase).toBe('assignAll');
  });

  it('Forgy picks k distinct data points', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = advancePhase(setParams(createInitialState(seed), { init: 'random', k: 8 }));
      expect(s.centroids).toHaveLength(8);
      const keys = new Set(s.centroids.map((c) => `${c.x},${c.y}`));
      expect(keys.size).toBe(8);
      for (const c of s.centroids) expect(s.points.some((p) => p.x === c.x && p.y === c.y)).toBe(true);
    }
  });

  it('Voronoi cells tile the square', () => {
    const cells = voronoiCells([
      { x: 2, y: 2 },
      { x: 8, y: 3 },
      { x: 5, y: 8 },
    ]);
    const area = (poly: { x: number; y: number }[]) =>
      Math.abs(poly.reduce((a, p, i) => a + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0)) / 2;
    expect(cells.reduce((a, c) => a + area(c), 0)).toBeCloseTo(100, 9);
  });
});

describe('scenarios, elbow and restarts', () => {
  it('every scenario loads and runs to convergence', () => {
    for (const sc of SCENARIOS) {
      const s = sc.build();
      expect(s.scenario?.letter).toBe(sc.letter);
      const done = runToConvergence(s);
      expect(done.status).toBe('converged');
      for (const a of sc.actions ?? []) if (a.apply) expect(solve(a.apply(s)).status).toBe('converged');
    }
  });

  it('Scenario C converges to a worse local minimum than Scenario B', () => {
    const good = solve(scenario('good'));
    const bad = solve(scenario('bad'));
    expect(bad.inertia!).toBeGreaterThan(good.inertia! * 2);
    expect(good.centroids.map((_, j) => good.assign.filter((a) => a === j).length)).toEqual([10, 10, 10]);
  });

  it('Scenario D shows a weighted draw for every centroid after the first', () => {
    const s = advancePhase(scenario('plusplus'));
    expect(s.initDraws.map((d) => d.kind)).toEqual(['uniform', 'weighted', 'weighted']);
  });

  it('elbow inertia decreases with k', () => {
    const e = computeElbow(createInitialState());
    expect(e.points.map((p) => p.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 1; i < e.points.length; i++) expect(e.points[i].inertia).toBeLessThanOrEqual(e.points[i - 1].inertia + 1e-9);
  });

  it('10 restarts use different seeds and the best has the lowest inertia', () => {
    const s = loadDataset(createInitialState(), 'outlier');
    const runs = runRestarts(s);
    expect(new Set(runs.map((r) => r.seed)).size).toBe(10);
    const b = bestRun(runs);
    for (const r of runs) expect(runs[b].inertia).toBeLessThanOrEqual(r.inertia);
    expect(runs[0].final.inertia).toBe(solve(freshRun(s, { seed: s.seed })).inertia);
  });
});
