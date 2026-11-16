import { DEFAULT_DATASET, LabelStyle, datasetPoints, getDataset, makeLabel } from './datasets';
import { cName, fmt2, fmtCentroid, fmtInertia, fmtPoint, fmtProb } from './format';
import { DataPoint, DistanceCalc, MeanCalc, Pt, distanceCalc, inertia, meanCalc } from './geometry';
import { InitDraw, InitMethod, describeDraw, distinctCount, pickUniform, pickWeighted, plusPlusTable, uniformCandidates } from './init';
import { quantise, rngNext } from './rng';

/**
 * The k-means state machine (Lloyd's algorithm).
 *
 * `advance(state)` performs exactly ONE microstep and returns a new state.
 * Every random number, assignment and centroid move happens inside advance()
 * (or an explicit instructor command), never anywhere else, so a paused
 * simulation cannot change. All intermediate values (each distance, each sum,
 * each random draw) are recorded in the state for the panels to display.
 */

export type Phase =
  | 'ready'
  | 'initD2'
  | 'initDraw'
  | 'initPlace'
  | 'selectPoint'
  | 'measure'
  | 'choose'
  | 'assignAll'
  | 'gather'
  | 'computeMean'
  | 'move'
  | 'updateAll'
  | 'check';

export type Status = 'init' | 'running' | 'converged' | 'maxIter';

/** Which half of the algorithm a phase belongs to (for the top bar and Next Phase). */
export type Half = 'init' | 'assign' | 'update' | 'check';
export const HALF_OF: Record<Phase, Half> = {
  ready: 'init',
  initD2: 'init',
  initDraw: 'init',
  initPlace: 'init',
  selectPoint: 'assign',
  measure: 'assign',
  choose: 'assign',
  assignAll: 'assign',
  gather: 'update',
  computeMean: 'update',
  move: 'update',
  updateAll: 'update',
  check: 'check',
};

/** The stepper shown in the explanation panel. */
export const MICROSTEPS: { id: string; label: string; phases: Phase[] }[] = [
  { id: 'init', label: 'Place Centroids', phases: ['initD2', 'initDraw', 'initPlace'] },
  { id: 'select', label: 'Select Point', phases: ['selectPoint', 'assignAll'] },
  { id: 'measure', label: 'Measure Distances', phases: ['measure', 'assignAll'] },
  { id: 'choose', label: 'Choose Nearest', phases: ['choose', 'assignAll'] },
  { id: 'gather', label: 'Gather Members', phases: ['gather', 'updateAll'] },
  { id: 'mean', label: 'Compute Mean', phases: ['computeMean', 'updateAll'] },
  { id: 'move', label: 'Move Centroid', phases: ['move', 'updateAll'] },
  { id: 'check', label: 'Check Convergence', phases: ['check'] },
];

export type StepMode = 'auto' | 'on' | 'off';

export interface Params {
  k: number;
  init: InitMethod;
  maxIter: number;
  /** Step through each point during the assignment step ('auto': only for small data). */
  stepPoints: StepMode;
  /** Step through each centroid during the update step. */
  stepCentroids: boolean;
}

export const DEFAULT_PARAMS: Params = { k: 3, init: 'kmeans++', maxIter: 20, stepPoints: 'auto', stepCentroids: true };
export const DEFAULT_SEED = 2024;
export const MAX_K = 8;
/** 'auto' steps through each point when the data has at most this many points. */
export const AUTO_STEP_LIMIT = 12;

export interface Change {
  point: number;
  from: number | null;
  to: number;
}

export interface InertiaRecord {
  iteration: number;
  half: 'assign' | 'update';
  value: number;
}

export interface CheckRecord {
  iteration: number;
  changes: Change[];
  /** Inertia at the end of the previous iteration (or after this iteration's assignment, in iteration 1). */
  before: number;
  after: number;
  converged: boolean;
  cutoff: boolean;
}

export interface ScenarioInfo {
  id: string;
  letter: string;
  title: string;
  description: string;
}

export interface KState {
  points: DataPoint[];
  labelStyle: LabelStyle;
  /** Counter for the next new point's label, so labels stay stable after deletions. */
  nextLabel: number;
  /** Prepared dataset id, or null once the data has been edited. */
  datasetId: string | null;
  params: Params;
  seed: number;
  rng: number;
  /** Predetermined random numbers (scenarios), used before the seeded RNG. */
  script: number[];

  centroids: Pt[];
  trails: Pt[][];
  /** Current cluster of each point (null = unassigned). */
  assign: (number | null)[];
  /** Assignments at the start of the current iteration's assignment step. */
  startAssign: (number | null)[];
  iteration: number;
  phase: Phase;
  /** Point index (assignment) or centroid index (update) of the current microstep. */
  cursor: number;
  status: Status;

  manualQueue: Pt[];
  /** Manual centroids a scenario provides; Restart places them again. */
  manualPreset: Pt[] | null;
  initDraws: InitDraw[];
  /** The k-means++ draw being prepared (D² computed, random drawn), not placed yet. */
  pendingInit: InitDraw | null;

  dist: DistanceCalc | null;
  lastChange: Change | null;
  changes: Change[];
  mean: MeanCalc | null;
  /** All mean calculations of the current update step. */
  means: MeanCalc[];

  inertia: number | null;
  perCluster: number[];
  history: InertiaRecord[];
  check: CheckRecord | null;

  explanation: string;
  tick: number;
  scenario: ScenarioInfo | null;
}

// ---------------------------------------------------------------- helpers

export const stepsEachPoint = (s: KState): boolean =>
  s.params.stepPoints === 'on' || (s.params.stepPoints === 'auto' && s.points.length <= AUTO_STEP_LIMIT);

export const isDone = (s: KState) => s.status === 'converged' || s.status === 'maxIter';

/** Why the algorithm can't advance right now (null if it can). */
export function waitingReason(s: KState): string | null {
  if (isDone(s)) return null;
  if (s.points.length === 0) return 'There are no points. Click the plot to add some, or choose a dataset.';
  if (s.status !== 'init' || s.centroids.length >= s.params.k) return null;
  if (s.params.init === 'manual') {
    if (s.manualQueue.length > 0) return null;
    return `Manual initialization: click the plot to place ${cName(s.centroids.length)} (${s.centroids.length} of ${s.params.k} placed).`;
  }
  if (distinctCount(s.points) < s.params.k) return `k = ${s.params.k} needs at least ${s.params.k} distinct points to start from. Add points or lower k.`;
  return null;
}

function draw(s: KState): { r: number; scripted: boolean; rng: number; script: number[] } {
  if (s.script.length > 0) return { r: s.script[0], scripted: true, rng: s.rng, script: s.script.slice(1) };
  const [raw, rng] = rngNext(s.rng);
  return { r: quantise(raw), scripted: false, rng, script: s.script };
}

const lbl = (s: KState, i: number) => s.points[i].label;

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function inertiaOf(s: KState) {
  return inertia(s.points, s.centroids, s.assign);
}

// ---------------------------------------------------------------- creation

function blankClustering(s: Omit<KState, 'centroids'> & { centroids?: Pt[] }): KState {
  return {
    ...(s as KState),
    centroids: [],
    trails: [],
    assign: s.points.map(() => null),
    startAssign: s.points.map(() => null),
    iteration: 0,
    phase: 'ready',
    cursor: 0,
    status: 'init',
    manualQueue: s.manualPreset ? s.manualPreset.map((p) => ({ ...p })) : [],
    initDraws: [],
    pendingInit: null,
    dist: null,
    lastChange: null,
    changes: [],
    mean: null,
    means: [],
    inertia: null,
    perCluster: [],
    history: [],
    check: null,
  };
}

function readyExplanation(s: KState): string {
  const reason = waitingReason(s);
  if (reason) return reason;
  const how =
    s.params.init === 'kmeans++'
      ? 'K-means++ picks the first centroid uniformly at random, then favours points far from the centroids already chosen.'
      : s.params.init === 'random'
        ? `Random points (Forgy) picks ${s.params.k} distinct data points at random as the starting centroids.`
        : `The ${s.params.k} centroids were placed by hand.`;
  return `Ready to cluster ${s.points.length} points into k = ${s.params.k} groups. First, place the starting centroids. ${how} Press Next Step.`;
}

export function createInitialState(seed = DEFAULT_SEED): KState {
  const ds = getDataset(DEFAULT_DATASET);
  const base = blankClustering({
    points: datasetPoints(ds),
    labelStyle: ds.labelStyle,
    nextLabel: ds.coords.length,
    datasetId: ds.id,
    params: { ...DEFAULT_PARAMS },
    seed,
    rng: seed,
    script: [],
    manualPreset: null,
    explanation: '',
    tick: 0,
    scenario: null,
  } as unknown as KState);
  return { ...base, explanation: readyExplanation(base) };
}

/** Clear the centroids and start initialization again; data, k and the RNG stream are kept. */
export function restart(s: KState, explanation?: string): KState {
  const t = blankClustering({ ...s, tick: s.tick + 1 });
  return { ...t, explanation: explanation ?? readyExplanation(t) };
}

/** Back to the default dataset, parameters and seed. */
export function reset(seed = DEFAULT_SEED): KState {
  return createInitialState(seed);
}

/** Change parameters. k or the initialization method restarts the clustering. */
export function setParams(s: KState, p: Partial<Params>): KState {
  const params = { ...s.params, ...p };
  if (p.k !== undefined) params.k = Math.max(1, Math.min(MAX_K, Math.round(p.k)));
  if (p.maxIter !== undefined) params.maxIter = Math.max(1, Math.round(p.maxIter));
  const restartNeeded = params.k !== s.params.k || params.init !== s.params.init;
  if (restartNeeded) {
    const keepPreset = params.init === 'manual' && s.manualPreset && s.manualPreset.length === params.k;
    return restart({ ...s, params, manualPreset: keepPreset ? s.manualPreset : null, script: keepPreset ? s.script : [] });
  }
  let status = s.status;
  if (status === 'maxIter' && s.iteration < params.maxIter) status = 'running';
  return { ...s, params, status };
}

/** A new seed restarts the random stream and the clustering (data kept). */
export function setSeed(s: KState, seed: number): KState {
  return restart({ ...s, seed, rng: seed, script: [] });
}

// ---------------------------------------------------------------- data editing

/** Replace the data. Clustering is reset; k and the initialization method are kept. */
export function setPoints(s: KState, points: DataPoint[], opts: { datasetId: string | null; labelStyle: LabelStyle; nextLabel: number }): KState {
  return restart({ ...s, points, ...opts, scenario: null, manualPreset: null, script: [] });
}

export function loadDataset(s: KState, id: string): KState {
  const ds = getDataset(id);
  return setPoints(s, datasetPoints(ds), { datasetId: ds.id, labelStyle: ds.labelStyle, nextLabel: ds.coords.length });
}

const round1 = (n: number) => Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;

export function addPoint(s: KState, at: Pt): KState {
  const p: DataPoint = { x: round1(at.x), y: round1(at.y), label: makeLabel(s.labelStyle, s.nextLabel) };
  return setPoints(s, [...s.points, p], { datasetId: null, labelStyle: s.labelStyle, nextLabel: s.nextLabel + 1 });
}

export function removePoint(s: KState, index: number): KState {
  return setPoints(
    s,
    s.points.filter((_, i) => i !== index),
    { datasetId: null, labelStyle: s.labelStyle, nextLabel: s.nextLabel },
  );
}

export function clearPoints(s: KState): KState {
  return setPoints(s, [], { datasetId: null, labelStyle: 'numbers', nextLabel: 0 });
}

/** New blob data from the seeded RNG (2–5 blobs of 6–10 points). */
export function randomBlobs(s: KState): KState {
  let rng = s.rng;
  const next = () => {
    const [v, n] = rngNext(rng);
    rng = n;
    return v;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  const blobs = 2 + Math.floor(next() * 4);
  const centres: Pt[] = [];
  while (centres.length < blobs) {
    const c = { x: 1.5 + 7 * next(), y: 1.5 + 7 * next() };
    if (centres.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 2.2) || centres.length === 0) centres.push(c);
  }
  const pts: DataPoint[] = [];
  const seen = new Set<string>();
  for (const c of centres) {
    const n = 6 + Math.floor(next() * 5);
    const sd = 0.45 + 0.4 * next();
    for (let i = 0; i < n; i++) {
      const p = { x: Math.max(0.2, Math.min(9.8, round1(c.x + gauss() * sd))), y: Math.max(0.2, Math.min(9.8, round1(c.y + gauss() * sd))) };
      const key = `${p.x},${p.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push({ ...p, label: makeLabel('numbers', pts.length) });
    }
  }
  return setPoints({ ...s, rng }, pts, { datasetId: null, labelStyle: 'numbers', nextLabel: pts.length });
}

// ---------------------------------------------------------------- the microsteps

interface Next {
  phase: Phase;
  cursor: number;
}

/** The microstep advance() would perform next (null when done or waiting). */
export function nextMicro(s: KState): Next | null {
  if (isDone(s) || waitingReason(s)) return null;
  const k = s.params.k;
  const n = s.points.length;
  const assignStart: Next = { phase: stepsEachPoint(s) ? 'selectPoint' : 'assignAll', cursor: 0 };
  const updateStart: Next = { phase: s.params.stepCentroids ? 'gather' : 'updateAll', cursor: 0 };

  if (s.status === 'init') {
    if (s.centroids.length >= k) return assignStart;
    if (s.params.init !== 'kmeans++' || s.centroids.length === 0) return { phase: 'initPlace', cursor: s.centroids.length };
    if (s.phase === 'initD2') return { phase: 'initDraw', cursor: s.centroids.length };
    if (s.phase === 'initDraw') return { phase: 'initPlace', cursor: s.centroids.length };
    return { phase: 'initD2', cursor: s.centroids.length };
  }
  switch (s.phase) {
    case 'selectPoint':
      return { phase: 'measure', cursor: s.cursor };
    case 'measure':
      return { phase: 'choose', cursor: s.cursor };
    case 'choose':
      return s.cursor + 1 < n ? { phase: 'selectPoint', cursor: s.cursor + 1 } : updateStart;
    case 'assignAll':
      return updateStart;
    case 'gather':
      return { phase: 'computeMean', cursor: s.cursor };
    case 'computeMean':
      return { phase: 'move', cursor: s.cursor };
    case 'move':
      return s.cursor + 1 < k ? { phase: 'gather', cursor: s.cursor + 1 } : { phase: 'check', cursor: 0 };
    case 'updateAll':
      return { phase: 'check', cursor: 0 };
    default:
      return assignStart;
  }
}

/** Perform exactly one microstep. Returns the same object when nothing can happen. */
export function advance(s: KState): KState {
  const nx = nextMicro(s);
  if (!nx) return s;
  const t: KState = { ...s, phase: nx.phase, cursor: nx.cursor, tick: s.tick + 1 };
  switch (nx.phase) {
    case 'initD2':
      return doInitD2(t);
    case 'initDraw':
      return doInitDraw(t);
    case 'initPlace':
      return doInitPlace(t);
    case 'selectPoint':
      return doSelectPoint(t);
    case 'measure':
      return doMeasure(t);
    case 'choose':
      return doChoose(t);
    case 'assignAll':
      return doAssignAll(t);
    case 'gather':
      return doGather(t);
    case 'computeMean':
      return doComputeMean(t);
    case 'move':
      return doMove(t);
    case 'updateAll':
      return doUpdateAll(t);
    case 'check':
      return doCheck(t);
    default:
      return s;
  }
}

// ----- initialization

function doInitD2(s: KState): KState {
  const { rows, total } = plusPlusTable(s.points, s.centroids);
  const j = s.centroids.length;
  const pending: InitDraw = { centroid: j, kind: 'weighted', random: null, scripted: false, candidates: [], rows, total, pick: null, position: null };
  const far = [...rows].sort((a, b) => b.d2 - a.d2)[0];
  return {
    ...s,
    pendingInit: pending,
    explanation: `K-means++ for ${cName(j)}: compute D(p)², each point's squared distance to its nearest centroid chosen so far. Total = ${fmt2(total)}. Each point's chance is D(p)² ÷ total, so ${lbl(s, far.point)} (D² = ${fmt2(far.d2)}) has the widest slice of the bar. Points already used as centroids have D² = 0 and can't be chosen.`,
  };
}

function doInitDraw(s: KState): KState {
  const p = s.pendingInit!;
  const d = draw(s);
  const pick = pickWeighted(d.r, p.rows!);
  const drawn: InitDraw = { ...p, random: d.r, scripted: d.scripted, pick, position: { x: s.points[pick].x, y: s.points[pick].y } };
  const row = p.rows!.find((r) => r.point === pick)!;
  return {
    ...s,
    rng: d.rng,
    script: d.script,
    pendingInit: drawn,
    explanation: `Draw a random number between 0 and 1: ${fmtProb(d.r)}${d.scripted ? ' (predetermined for this demo)' : ''}. It falls in ${lbl(s, pick)}'s interval [${fmtProb(row.lo, 4)}, ${fmtProb(row.hi, 4)}), whose probability is ${fmtProb(row.prob, 4)}. Far points are more likely, but any point with D(p)² > 0 could have been chosen.`,
  };
}

function place(s: KState, d: InitDraw, explanation: string): KState {
  const pos = { ...d.position! };
  const centroids = [...s.centroids, pos];
  const done = centroids.length >= s.params.k;
  const tail = done ? ` All ${s.params.k} centroids are placed. Next: the assignment step.` : '';
  return {
    ...s,
    centroids,
    trails: [...s.trails, [pos]],
    initDraws: [...s.initDraws, d],
    pendingInit: null,
    perCluster: centroids.map(() => 0),
    explanation: explanation + tail,
  };
}

function doInitPlace(s: KState): KState {
  const j = s.centroids.length;
  if (s.params.init === 'manual') {
    const [pos, ...rest] = s.manualQueue;
    const d: InitDraw = { centroid: j, kind: 'manual', random: null, scripted: false, candidates: [], rows: null, total: 0, pick: null, position: { ...pos } };
    return place({ ...s, manualQueue: rest }, d, `${cName(j)} is placed by hand at ${fmtCentroid(pos)}.`);
  }
  if (s.params.init === 'kmeans++' && j > 0) {
    const d = s.pendingInit!;
    return place(s, d, `${cName(j)} is placed on ${lbl(s, d.pick!)} at ${fmtPoint(d.position!)}.`);
  }
  // uniform draw: Forgy, or the first k-means++ centroid
  const candidates = uniformCandidates(s.points, s.centroids);
  const r = draw(s);
  const { pick } = pickUniform(r.r, candidates);
  const d: InitDraw = {
    centroid: j,
    kind: 'uniform',
    random: r.r,
    scripted: r.scripted,
    candidates,
    rows: null,
    total: 0,
    pick,
    position: { x: s.points[pick].x, y: s.points[pick].y },
  };
  const why = s.params.init === 'kmeans++' ? 'K-means++ chooses the first centroid uniformly at random. ' : '';
  return place(
    { ...s, rng: r.rng, script: r.script },
    d,
    `${why}Random number ${fmtProb(r.r)}${r.scripted ? ' (predetermined)' : ''}: ${describeDraw(d, s.points)}. ${cName(j)} is placed at ${fmtPoint(d.position!)}.`,
  );
}

/** Instructor click in manual mode: place the next centroid there. */
export function placeManualCentroid(s: KState, at: Pt): KState {
  if (s.status !== 'init' || s.params.init !== 'manual' || s.centroids.length >= s.params.k || s.manualQueue.length > 0) return s;
  const pos = { x: Math.round(Math.min(10, Math.max(0, at.x)) * 10) / 10, y: Math.round(Math.min(10, Math.max(0, at.y)) * 10) / 10 };
  return advance({ ...s, manualQueue: [pos] });
}

// ----- assignment step

function beginAssignment(s: KState): KState {
  return { ...s, status: 'running', iteration: s.iteration + 1, startAssign: [...s.assign], changes: [], check: null, means: [], mean: null };
}

function doSelectPoint(s: KState): KState {
  const t = s.cursor === 0 ? beginAssignment(s) : s;
  const p = t.points[t.cursor];
  const cur = t.assign[t.cursor];
  return {
    ...t,
    dist: null,
    lastChange: null,
    explanation: `Iteration ${t.iteration}, assignment step. Select ${p.label} at ${fmtPoint(p)}${cur !== null ? ` (currently in cluster ${cur + 1})` : ''}. Which of the ${t.params.k} centroids is nearest?`,
  };
}

function doMeasure(s: KState): KState {
  const p = s.points[s.cursor];
  const dc = distanceCalc(s.cursor, p, s.centroids);
  return {
    ...s,
    dist: dc,
    explanation: `Measure the straight-line (Euclidean) distance from ${p.label} to every centroid: ${listJoin(dc.rows.map((r) => `${fmt2(r.d)} to ${cName(r.centroid)}`))}. See the Distance panel for the arithmetic.`,
  };
}

function distanceSentence(s: KState, dc: DistanceCalc): string {
  const p = s.points[dc.point];
  const parts = listJoin(dc.rows.map((r) => `${fmt2(r.d)} from ${cName(r.centroid)}`));
  const w = dc.winner;
  if (dc.tied.length > 1) {
    const names = listJoin(dc.tied.map(cName));
    return `${p.label} at ${fmtPoint(p)} is ${parts}. Tie: ${names} are all ${fmt2(dc.rows[w].d)} away. Ties go to the lower-numbered centroid, so ${p.label} joins cluster ${w + 1}.`;
  }
  return `${p.label} at ${fmtPoint(p)} is ${parts}. ${cName(w)} is nearest, so ${p.label} joins cluster ${w + 1}.`;
}

function doChoose(s: KState): KState {
  const dc = s.dist ?? distanceCalc(s.cursor, s.points[s.cursor], s.centroids);
  const i = s.cursor;
  const to = dc.winner;
  const from = s.startAssign[i];
  const assign = [...s.assign];
  assign[i] = to;
  const change: Change | null = from !== to ? { point: i, from, to } : null;
  const changes = change ? [...s.changes, change] : s.changes;
  let t: KState = { ...s, dist: dc, assign, changes, lastChange: change };
  let note = '';
  if (change && from !== null) note = ` ${lbl(s, i)} moved from ${cName(from)} to ${cName(to)}!`;
  else if (!change) note = ` (No change: it was already in cluster ${to + 1}.)`;
  if (i === s.points.length - 1) {
    t = finishAssignment(t);
    note += ` That was the last point. Inertia after the assignment step = ${fmtInertia(t.inertia!)}.`;
  }
  return { ...t, explanation: distanceSentence(s, dc) + note };
}

function finishAssignment(s: KState): KState {
  const { total, perCluster } = inertiaOf(s);
  return { ...s, inertia: total, perCluster, history: [...s.history, { iteration: s.iteration, half: 'assign', value: total }] };
}

function changeSummary(s: KState, changes: Change[]): string {
  const moved = changes.filter((c) => c.from !== null);
  if (changes.length === 0) return 'No point changed cluster.';
  if (moved.length === 0) return `All ${changes.length} points received their first cluster.`;
  const list = moved.slice(0, 8).map((c) => `${lbl(s, c.point)} (${cName(c.from!)}→${cName(c.to)})`);
  return `${moved.length} point${moved.length > 1 ? 's' : ''} changed cluster: ${list.join(', ')}${moved.length > 8 ? ', …' : ''}.`;
}

function doAssignAll(s0: KState): KState {
  const s = beginAssignment(s0);
  const assign = [...s.assign];
  const changes: Change[] = [];
  const ties: string[] = [];
  s.points.forEach((p, i) => {
    const dc = distanceCalc(i, p, s.centroids);
    if (dc.tied.length > 1) ties.push(`${p.label} (${listJoin(dc.tied.map(cName))} tie → ${cName(dc.winner)})`);
    if (s.startAssign[i] !== dc.winner) changes.push({ point: i, from: s.startAssign[i], to: dc.winner });
    assign[i] = dc.winner;
  });
  const t = finishAssignment({ ...s, assign, changes, dist: null, lastChange: null });
  return {
    ...t,
    explanation: `Iteration ${t.iteration}, assignment step: every point joins its nearest centroid, all at once. ${changeSummary(t, changes)}${ties.length ? ` Ties (to the lower-numbered centroid): ${ties.join(', ')}.` : ''} Inertia = ${fmtInertia(t.inertia!)}. Click any point or table row to see its distances.`,
  };
}

// ----- update step

function doGather(s: KState): KState {
  const j = s.cursor;
  const m = meanCalc(j, s.points, s.assign, s.centroids[j]);
  const means = j === 0 ? [] : s.means;
  return {
    ...s,
    dist: null,
    lastChange: null,
    mean: m,
    means,
    explanation: m.empty
      ? `Update step. Gather the members of cluster ${j + 1}: there are none! ${cName(j)} has no points, so it has no mean.`
      : `Update step. Gather the members of cluster ${j + 1}: ${m.members.map((i) => lbl(s, i)).join(', ')} (${m.n} point${m.n > 1 ? 's' : ''}). ${cName(j)} will move to their mean.`,
  };
}

function doComputeMean(s: KState): KState {
  const m = s.mean!;
  return {
    ...s,
    explanation: m.empty
      ? `${cName(m.centroid)} has no points, so it has no mean and does not move. (Empty-cluster rule: the centroid stays where it is.)`
      : `The mean is the average x and the average y of the ${m.n} members: (${fmt2(m.to.x)}, ${fmt2(m.to.y)}). The mean is the point with the smallest total squared distance to the group.`,
  };
}

function finishUpdate(s: KState): KState {
  const { total, perCluster } = inertiaOf(s);
  return { ...s, inertia: total, perCluster, history: [...s.history, { iteration: s.iteration, half: 'update', value: total }] };
}

function doMove(s: KState): KState {
  const m = s.mean!;
  const j = m.centroid;
  const centroids = [...s.centroids];
  centroids[j] = { ...m.to };
  const trails = s.trails.map((tr, i) => (i === j ? [...tr, { ...m.to }] : tr));
  let t: KState = { ...s, centroids, trails, means: [...s.means, m] };
  const travelled = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
  let text = m.empty
    ? `${cName(j)} has no points, so it has no mean and does not move. It stays at ${fmtCentroid(m.from)}.`
    : `${cName(j)} moves from ${fmtCentroid(m.from)} to ${fmtCentroid(m.to)}${travelled < 1e-9 ? ' (it was already there, so it doesn’t move)' : `, a distance of ${fmt2(travelled)}`}.`;
  if (j === s.params.k - 1) {
    t = finishUpdate(t);
    text += ` All centroids updated. Inertia after the update step = ${fmtInertia(t.inertia!)}.`;
  }
  return { ...t, explanation: text };
}

function doUpdateAll(s: KState): KState {
  const means = s.centroids.map((c, j) => meanCalc(j, s.points, s.assign, c));
  const centroids = means.map((m) => ({ ...m.to }));
  const trails = s.trails.map((tr, j) => [...tr, { ...centroids[j] }]);
  const t = finishUpdate({ ...s, centroids, trails, means, mean: null, dist: null, lastChange: null });
  const empty = means.filter((m) => m.empty).map((m) => cName(m.centroid));
  return {
    ...t,
    explanation: `Update step: every centroid moves to the mean of its cluster's points (see the Mean panel).${empty.length ? ` ${listJoin(empty)} ${empty.length > 1 ? 'have' : 'has'} no points, so ${empty.length > 1 ? 'they do' : 'it does'} not move.` : ''} Inertia after the update step = ${fmtInertia(t.inertia!)}.`,
  };
}

// ----- convergence check

function doCheck(s: KState): KState {
  const it = s.iteration;
  const prevEnd = [...s.history].reverse().find((h) => h.iteration === it - 1 && h.half === 'update');
  const thisAssign = s.history.find((h) => h.iteration === it && h.half === 'assign');
  const before = prevEnd?.value ?? thisAssign?.value ?? s.inertia ?? 0;
  const after = s.inertia ?? 0;
  const converged = s.changes.length === 0;
  const cutoff = !converged && it >= s.params.maxIter;
  const check: CheckRecord = { iteration: it, changes: s.changes, before, after, converged, cutoff };
  const delta = before - after;
  const better =
    it === 1
      ? `During iteration 1 the update step lowered inertia from ${fmtInertia(before)} to ${fmtInertia(after)}.`
      : delta > 1e-12
        ? `Inertia fell from ${fmtInertia(before)} to ${fmtInertia(after)} (−${fmtInertia(delta)}).`
        : `Inertia stayed at ${fmtInertia(after)}.`;
  let verdict: string;
  if (converged) verdict = `No point changed cluster, so the centroids will never move again. CONVERGED after ${it} iteration${it > 1 ? 's' : ''} with inertia ${fmtInertia(after)}. This is a local minimum: a different start might give a different answer.`;
  else if (cutoff) verdict = `Stopped at the maximum of ${s.params.maxIter} iterations. This is a CUTOFF, not convergence: points were still changing cluster.`;
  else verdict = 'Points changed cluster, so not converged yet. Another iteration follows.';
  return {
    ...s,
    check,
    status: converged ? 'converged' : cutoff ? 'maxIter' : 'running',
    mean: null,
    dist: null,
    lastChange: null,
    explanation: `End of iteration ${it}. ${changeSummary(s, s.changes)} ${better} ${verdict}`,
  };
}

// ---------------------------------------------------------------- bigger steps

/** True when the state sits at the end of an initialization, assignment or update step, or a check. */
function endsHalf(s: KState): boolean {
  switch (s.phase) {
    case 'initPlace':
      return s.centroids.length >= s.params.k;
    case 'choose':
      return s.cursor === s.points.length - 1;
    case 'move':
      return s.cursor === s.params.k - 1;
    case 'assignAll':
    case 'updateAll':
    case 'check':
      return true;
    default:
      return false;
  }
}

function runUntil(s: KState, stop: (t: KState) => boolean, limit = 100000): KState {
  let t = s;
  for (let i = 0; i < limit; i++) {
    const n = advance(t);
    if (n === t) break;
    t = n;
    if (stop(t)) break;
  }
  return t;
}

/** Finish the current initialization, assignment step or update step (or do the check), then stop. */
export const advancePhase = (s: KState) => runUntil(s, endsHalf);

/** Finish the current iteration (assignment + update + convergence check). */
export const advanceIteration = (s: KState) => runUntil(s, (t) => t.phase === 'check');

/** Run until converged or the iteration cap. */
export const runToConvergence = (s: KState) => runUntil(s, isDone);

/** Fast, non-visual run to convergence (one microstep per assignment / update step). */
export function solve(s: KState): KState {
  const fast = { ...s, params: { ...s.params, stepPoints: 'off' as StepMode, stepCentroids: false } };
  const done = runToConvergence(fast);
  return { ...done, params: s.params };
}
