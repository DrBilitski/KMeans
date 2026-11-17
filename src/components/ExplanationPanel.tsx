import { fmtInertia } from '../engine/format';
import { KState, MICROSTEPS, waitingReason } from '../engine/kmeans';

/** Stepper + plain-English explanation, as in the Q-Learning Explorer. */
export function ExplanationPanel({ state: s }: { state: KState }) {
  const nowIdx = MICROSTEPS.map((m, i) => (m.phases.includes(s.phase) ? i : -1)).filter((i) => i >= 0);
  const first = nowIdx.length ? nowIdx[0] : -1;
  const waiting = waitingReason(s);
  return (
    <div className="explain">
      <ol className="stepper">
        {MICROSTEPS.map((m, i) => {
          const status = nowIdx.includes(i) ? 'now' : first >= 0 && i < first ? 'done' : s.status !== 'init' && i === 0 ? 'done' : 'todo';
          return (
            <li key={m.id} className={`step-${status}`}>
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{m.label}</span>
            </li>
          );
        })}
      </ol>
      <div className="explain-text" key={s.tick}>
        {s.explanation}
      </div>
      {waiting && s.explanation !== waiting && <div className="wait-card">👉 {waiting}</div>}
      {s.status === 'converged' && (
        <div className="episode-card ep-goal">
          <div className="ep-title">✅ Converged after {s.iteration} iteration{s.iteration > 1 ? 's' : ''}</div>
          <div className="ep-stats">
            <span>
              Final inertia <b>{fmtInertia(s.inertia ?? 0)}</b>
            </span>
            <span>Restart (or run 10 restarts) to see whether a different start gives a different answer.</span>
          </div>
        </div>
      )}
      {s.status === 'maxIter' && (
        <div className="episode-card ep-timeout">
          <div className="ep-title">⏱ Iteration cap reached ({s.params.maxIter})</div>
          <div className="ep-stats">
            <span>This is a cutoff, not convergence. Raise “Max iterations” to continue.</span>
          </div>
        </div>
      )}
    </div>
  );
}
