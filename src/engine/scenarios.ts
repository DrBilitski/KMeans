import { fmtInertia } from './format';
import { Pt } from './geometry';
import { InitMethod } from './init';
import { KState, ScenarioInfo, StepMode, createInitialState, loadDataset, restart, setParams, solve } from './kmeans';

/**
 * Guided demonstration scenarios (Section 11).
 *
 * Each scenario is an ordinary KState run by the same engine: it only chooses
 * the dataset, k, initialization method, seed and (where needed) manual
 * centroids. Every number on screen is computed live.
 */

export interface ScenarioAction {
  label: string;
  /** 'apply' changes the state; 'elbow' / 'restarts' trigger the instructor panels. */
  kind: 'apply' | 'elbow' | 'restarts';
  apply?: (s: KState) => KState;
}

export interface ScenarioDef extends ScenarioInfo {
  summary: string;
  build: () => KState;
  actions?: ScenarioAction[];
}

interface Setup {
  dataset: string;
  k: number;
  init: InitMethod;
  seed?: number;
  manual?: Pt[];
  stepPoints?: StepMode;
  explanation?: string;
}

function scenarioState(info: ScenarioInfo, o: Setup): KState {
  let s = loadDataset(createInitialState(o.seed), o.dataset);
  s = setParams(s, { k: o.k, init: o.init, stepPoints: o.stepPoints ?? 'auto', stepCentroids: true });
  s = { ...s, manualPreset: o.manual ?? null, scenario: { id: info.id, letter: info.letter, title: info.title, description: info.description } };
  return restart(s, o.explanation);
}

const info = (letter: string, id: string, title: string, description: string): ScenarioInfo => ({ id, letter, title, description });

/** Scenario C's bad start: two centroids in the bottom blob, one between the top two. */
export const BAD_INIT: Pt[] = [
  { x: 4.5, y: 2.5 },
  { x: 5.5, y: 2.5 },
  { x: 5.0, y: 7.3 },
];

/** Scenario I: C3 sits far from every point, so its cluster stays empty. */
export const EMPTY_INIT: Pt[] = [
  { x: 1, y: 1 },
  { x: 5, y: 7 },
  { x: 9, y: 1 },
];

const keepScenario = (s: KState, next: KState): KState => ({ ...next, scenario: s.scenario });

export const SCENARIOS: ScenarioDef[] = [
  {
    ...info(
      'A',
      'worked',
      'The Worked Example',
      'Tiny dataset (A–G), k = 2, manual centroids at (1, 1) and (5, 7). Step through every point: watch the tie at C, and C switching clusters in iteration 2. Final inertia 8.525.',
    ),
    summary: 'Every number checkable by hand',
    build() {
      return scenarioState(this, {
        dataset: 'tiny',
        k: 2,
        init: 'manual',
        manual: [
          { x: 1, y: 1 },
          { x: 5, y: 7 },
        ],
        stepPoints: 'on',
        explanation: 'Scenario A. 7 points, k = 2. The two starting centroids have been chosen by hand: C1 at (1, 1) and C2 at (5, 7). Press Next Step to place them.',
      });
    },
  },
  {
    ...info('B', 'good', 'Good Clustering', 'Three Clear Blobs, k = 3, k-means++. It converges in a couple of iterations to the obvious three groups. Note the final inertia to compare with Scenario C.'),
    summary: 'K-means++ finds the obvious answer',
    build() {
      return scenarioState(this, { dataset: 'threeBlobs', k: 3, init: 'kmeans++', seed: 2024 });
    },
  },
  {
    ...info(
      'C',
      'bad',
      'Bad Initialization',
      `Same data, but two centroids start inside the bottom blob and one between the top two. K-means converges anyway, to a clearly wrong local minimum.`,
    ),
    summary: 'Same data, worse answer',
    build() {
      const s = scenarioState(this, { dataset: 'threeBlobs', k: 3, init: 'manual', manual: BAD_INIT });
      const bad = solve(s).inertia ?? 0;
      const good = solve(SCENARIOS[1].build()).inertia ?? 0;
      const description = `Same data as B, but two centroids start inside the bottom blob and one between the top two. It converges to a clearly wrong local minimum: inertia ${fmtInertia(bad)}, versus ${fmtInertia(good)} in Scenario B. Inertia never increases, so k-means can't climb out.`;
      return { ...s, scenario: { ...s.scenario!, description } };
    },
  },
  {
    ...info(
      'D',
      'plusplus',
      'K-Means++ in Action',
      'Three Clear Blobs. Watch the Initialization panel: for each new centroid, D(p)² is computed, a random number is drawn, and it lands in one point’s slice of the probability bar.',
    ),
    summary: 'The probability bar and random draws',
    build() {
      return scenarioState(this, { dataset: 'threeBlobs', k: 3, init: 'kmeans++', seed: 2027 });
    },
  },
  {
    ...info('E', 'wrongk', 'Wrong k', 'Four Blobs with k = 2: k-means always returns exactly k clusters, even when that is wrong. Then try k = 6, and look at the elbow chart.'),
    summary: 'Always exactly k clusters',
    build() {
      return scenarioState(this, { dataset: 'fourBlobs', k: 2, init: 'kmeans++', seed: 2026 });
    },
    actions: [
      { label: 'Try k = 2', kind: 'apply', apply: (s) => setParams(s, { k: 2 }) },
      { label: 'Try k = 6', kind: 'apply', apply: (s) => setParams(s, { k: 6 }) },
      { label: 'Compute elbow chart', kind: 'elbow' },
    ],
  },
  {
    ...info(
      'F',
      'fails',
      'Where K-Means Fails',
      'Two Moons, k = 2. K-means cuts the data into two round-ish regions instead of following the curved shapes. It assumes clusters are compact, roughly round and of similar size.',
    ),
    summary: 'Moons and long thin clusters',
    build() {
      return scenarioState(this, { dataset: 'moons', k: 2, init: 'kmeans++', seed: 2024 });
    },
    actions: [
      { label: 'Two Moons (k = 2)', kind: 'apply', apply: (s) => keepScenario(s, setParams(loadDataset(s, 'moons'), { k: 2 })) },
      { label: 'Long Thin Clusters (k = 3)', kind: 'apply', apply: (s) => keepScenario(s, setParams(loadDataset(s, 'thin'), { k: 3 })) },
    ],
  },
  {
    ...info(
      'G',
      'outlier',
      'The Outlier',
      'Blobs + Outlier, k = 3. The lone point at (9.5, 0.6) drags one centroid away from its blob. Means are sensitive to outliers. Run 10 restarts: sometimes a whole centroid is wasted on the outlier instead.',
    ),
    summary: 'One far point drags a centroid',
    build() {
      return scenarioState(this, { dataset: 'outlier', k: 3, init: 'kmeans++', seed: 2025 });
    },
    actions: [{ label: 'Run 10 restarts', kind: 'restarts' }],
  },
  {
    ...info(
      'H',
      'noclusters',
      'No Real Clusters',
      'Uniform Random data, k = 3. K-means still produces 3 clean-looking groups. Clustering always produces an answer; whether it means anything is up to the analyst.',
    ),
    summary: 'K-means always finds k groups',
    build() {
      return scenarioState(this, { dataset: 'uniform', k: 3, init: 'kmeans++', seed: 2024 });
    },
    actions: [{ label: 'Compute elbow chart', kind: 'elbow' }],
  },
  {
    ...info(
      'I',
      'empty',
      'Empty Cluster',
      'Tiny dataset, k = 3, with C3 placed by hand at (9, 1), far from every point. No point chooses C3, so it has no mean and stays where it is (the empty-cluster rule).',
    ),
    summary: 'A centroid with no points',
    build() {
      return scenarioState(this, {
        dataset: 'tiny',
        k: 3,
        init: 'manual',
        manual: EMPTY_INIT,
        stepPoints: 'on',
        explanation: 'Scenario I. Centroids were chosen by hand: C1 (1, 1), C2 (5, 7) and C3 (9, 1). Press Next Step to place them.',
      });
    },
  },
];
