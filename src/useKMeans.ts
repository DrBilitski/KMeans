import { useCallback, useEffect, useState } from 'react';
import { DataPoint, Pt } from './engine/geometry';
import { ElbowResult, computeElbow } from './engine/elbow';
import { fmtInertia } from './engine/format';
import {
  KState,
  Params,
  addPoint,
  advance,
  advanceIteration,
  advancePhase,
  clearPoints,
  createInitialState,
  isDone,
  loadDataset,
  placeManualCentroid,
  randomBlobs,
  removePoint,
  reset,
  restart,
  runToConvergence,
  setParams,
  setSeed,
  waitingReason,
} from './engine/kmeans';
import { RestartRun, runRestarts } from './engine/restarts';
import { ScenarioAction, ScenarioDef } from './engine/scenarios';

/** Delay between microsteps while playing, from "very slow" to "fast" (as in the Q-Learning Explorer). */
export const SPEEDS = [
  { label: 'Very slow', ms: 3200 },
  { label: 'Slow', ms: 2000 },
  { label: 'Relaxed', ms: 1300 },
  { label: 'Normal', ms: 800 },
  { label: 'Brisk', ms: 450 },
  { label: 'Fast', ms: 200 },
  { label: 'Turbo', ms: 60 },
];

interface Restarts {
  runs: RestartRun[];
  points: DataPoint[];
  k: number;
  init: string;
  seed: number;
}

/**
 * React wrapper around the pure k-means engine. Owns Play/Pause timing.
 * Every state change goes through an engine function; the UI never computes
 * distances or means itself. Every command except Play pauses first.
 */
export function useKMeans() {
  const [state, setState] = useState<KState>(() => createInitialState());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [inspected, setInspected] = useState<number | null>(null);
  const [elbow, setElbow] = useState<(ElbowResult & { forPoints: DataPoint[] }) | null>(null);
  const [restarts, setRestarts] = useState<Restarts | null>(null);
  const delay = SPEEDS[speed].ms;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setState((s) => advance(s)), delay);
    return () => window.clearInterval(id);
  }, [playing, delay]);

  // Stop playing when there is nothing left to do (converged, cap reached, or waiting for clicks).
  useEffect(() => {
    if (playing && (isDone(state) || waitingReason(state))) setPlaying(false);
  }, [playing, state]);

  // Inspection refers to a point index: drop it when the data changes.
  useEffect(() => setInspected(null), [state.points]);

  const pausedDo = useCallback((fn: (s: KState) => KState) => {
    setPlaying(false);
    setState(fn);
  }, []);

  const elbowValid = elbow && elbow.forPoints === state.points && elbow.seed === state.seed ? elbow : null;
  const restartsValid =
    restarts && restarts.points === state.points && restarts.k === state.params.k && restarts.init === state.params.init && restarts.seed === state.seed ? restarts : null;

  const doElbow = () => {
    setPlaying(false);
    setElbow({ ...computeElbow(state), forPoints: state.points });
  };
  const doRestarts = () => {
    setPlaying(false);
    if (state.params.init === 'manual') return;
    setRestarts({ runs: runRestarts(state), points: state.points, k: state.params.k, init: state.params.init, seed: state.seed });
  };

  return {
    state,
    playing,
    speed,
    delay,
    inspected,
    setInspected,
    setSpeed,
    elbow: elbowValid,
    restarts: restartsValid,
    play: () => {
      if (!isDone(state) && !waitingReason(state)) setPlaying(true);
    },
    pause: () => setPlaying(false),
    nextStep: () => pausedDo(advance),
    nextPhase: () => pausedDo(advancePhase),
    nextIteration: () => pausedDo(advanceIteration),
    runToConvergence: () => pausedDo(runToConvergence),
    restart: () => pausedDo((s) => restart(s)),
    reset: () => {
      setInspected(null);
      pausedDo(() => reset());
    },
    newSeed: () => pausedDo((s) => setSeed(s, Math.floor(Math.random() * 100000))),
    setSeed: (n: number) => pausedDo((s) => setSeed(s, n)),
    setParams: (p: Partial<Params>) => pausedDo((s) => setParams(s, p)),
    loadDataset: (id: string) => pausedDo((s) => loadDataset(s, id)),
    addPoint: (p: Pt) => pausedDo((s) => addPoint(s, p)),
    removePoint: (i: number) => pausedDo((s) => removePoint(s, i)),
    clearPoints: () => pausedDo(clearPoints),
    randomBlobs: () => pausedDo(randomBlobs),
    placeCentroid: (p: Pt) => pausedDo((s) => placeManualCentroid(s, p)),
    loadScenario: (sc: ScenarioDef) => {
      setInspected(null);
      pausedDo(() => sc.build());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    exitScenario: () => {
      setInspected(null);
      pausedDo((s) => ({ ...reset(), seed: s.seed, rng: s.seed }));
    },
    scenarioAction: (a: ScenarioAction) => {
      if (a.kind === 'apply' && a.apply) pausedDo(a.apply);
      else if (a.kind === 'elbow') doElbow();
      else if (a.kind === 'restarts') doRestarts();
    },
    computeElbow: doElbow,
    runRestarts: doRestarts,
    loadRestart: (r: RestartRun) =>
      pausedDo((s) => ({
        ...r.final,
        params: { ...r.final.params, stepPoints: s.params.stepPoints, stepCentroids: s.params.stepCentroids, maxIter: s.params.maxIter },
        scenario: s.scenario,
        seed: s.seed,
        tick: s.tick + 1,
        explanation: `Loaded restart #${r.run} (seed ${r.seed}): ${r.converged ? `converged after ${r.iterations} iterations` : 'stopped at the iteration cap'} with inertia ${fmtInertia(r.inertia)}. Same data, same k, same method; only the random start differed.`,
      })),
  };
}

export type KController = ReturnType<typeof useKMeans>;
