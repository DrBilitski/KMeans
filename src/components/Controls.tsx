import { useEffect } from 'react';
import { KController, SPEEDS } from '../useKMeans';

/** Control bar and keyboard shortcuts, laid out like the Q-Learning Explorer's. */
export function Controls({ ctl, blocked }: { ctl: KController; blocked: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (ctl.playing) ctl.pause();
        else ctl.play();
      } else if (k === 'arrowright' || k === 'n') {
        e.preventDefault();
        ctl.nextStep();
      } else if (k === 'p') ctl.nextPhase();
      else if (k === 'i') ctl.nextIteration();
      else if (k === 'c') ctl.runToConvergence();
      else if (k === 'escape') ctl.setInspected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  return (
    <div className="controls">
      <div className="btn-group">
        <button className={`btn btn-play ${ctl.playing ? 'active' : ''}`} onClick={ctl.play} disabled={ctl.playing || blocked} title="Play (Space)">
          ▶ Play
        </button>
        <button className={`btn btn-pause ${!ctl.playing ? 'active' : ''}`} onClick={ctl.pause} disabled={!ctl.playing} title="Pause (Space)">
          ❚❚ {ctl.playing ? 'Pause' : 'Paused'}
        </button>
      </div>
      <div className="btn-group">
        <button className="btn btn-step" onClick={ctl.nextStep} disabled={blocked} title="Advance exactly one microstep (→ or N)">
          ▸ Next Step
        </button>
        <button className="btn" onClick={ctl.nextPhase} disabled={blocked} title="Finish the current assignment or update step (P)">
          ⏩ Next Phase
        </button>
        <button className="btn" onClick={ctl.nextIteration} disabled={blocked} title="Finish this iteration: assignment + update + convergence check (I)">
          ⏭ Next Iteration
        </button>
        <button className="btn btn-soft" onClick={ctl.runToConvergence} disabled={blocked} title="Run until converged or the iteration cap (C)">
          ⚡ Run to Convergence
        </button>
      </div>
      <div className="btn-group">
        <button className="btn btn-soft" onClick={ctl.restart} title="Keep the data and k; clear the centroids and initialize again with the next random draws">
          ↺ Restart
        </button>
        <button className="btn btn-danger" onClick={ctl.reset} title="Restore the default dataset, parameters and seed">
          ⟲ Reset
        </button>
      </div>
      <label className="speed">
        <span>Speed</span>
        <input type="range" min={0} max={SPEEDS.length - 1} value={ctl.speed} onChange={(e) => ctl.setSpeed(Number(e.target.value))} />
        <b>{SPEEDS[ctl.speed].label}</b>
      </label>
      <div className="kbd-hint">
        <kbd>Space</kbd> play/pause · <kbd>→</kbd> step · <kbd>P</kbd> phase · <kbd>I</kbd> iteration · <kbd>C</kbd> converge
      </div>
    </div>
  );
}
