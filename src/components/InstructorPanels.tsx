import { ReactNode, useEffect, useState } from 'react';
import { DATASETS } from '../engine/datasets';
import { INIT_NAMES, InitMethod } from '../engine/init';
import { AUTO_STEP_LIMIT, KState, MAX_K, StepMode, stepsEachPoint } from '../engine/kmeans';
import { SCENARIOS } from '../engine/scenarios';
import { KController } from '../useKMeans';

function Param({ label, value, explain, children }: { label: ReactNode; value?: ReactNode; explain: string; children: ReactNode }) {
  return (
    <div className="param">
      <div className="param-head">
        <span className="param-label">{label}</span>
        {value !== undefined && <b className="param-value mono">{value}</b>}
      </div>
      {children}
      <div className="param-explain">{explain}</div>
    </div>
  );
}

export function DataPanel({ ctl }: { ctl: KController }) {
  const s = ctl.state;
  const ds = DATASETS.find((d) => d.id === s.datasetId);
  return (
    <div className="params">
      <Param label="Dataset" explain={ds ? ds.purpose : 'Custom data (edited by hand). Pick a dataset to start over.'}>
        <select className="select" value={s.datasetId ?? ''} onChange={(e) => ctl.loadDataset(e.target.value)}>
          {!s.datasetId && <option value="">Custom ({s.points.length} points)</option>}
          {DATASETS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.coords.length})
            </option>
          ))}
        </select>
      </Param>
      <div className="btn-row">
        <button className="btn btn-soft btn-small" onClick={ctl.clearPoints}>
          🧽 Clear points
        </button>
        <button className="btn btn-soft btn-small" onClick={ctl.randomBlobs} title="New blob data from the seeded random number generator">
          🎲 Random blobs
        </button>
      </div>
      <p className="teach-note">
        <b>Edit live:</b> click an empty spot to add a point · <b>shift-click</b> or <b>right-click</b> a point to remove it · click a point to inspect its distances. Changing the data resets the clustering (k and the
        method are kept).
      </p>
      <p className="param-foot">
        {s.points.length} points. There are no labels: colours are cluster numbers, not true classes, and the numbering itself is arbitrary.
      </p>
    </div>
  );
}

export function ParamsPanel({ ctl }: { ctl: KController }) {
  const s = ctl.state;
  const p = s.params;
  const [seedText, setSeedText] = useState(String(s.seed));
  useEffect(() => setSeedText(String(s.seed)), [s.seed]);
  return (
    <div className="params">
      <Param label={<>Number of clusters <i>k</i></>} value={p.k} explain="How many groups k-means will find. It always finds exactly this many.">
        <input type="range" min={1} max={MAX_K} step={1} value={p.k} onChange={(e) => ctl.setParams({ k: Number(e.target.value) })} />
      </Param>
      <Param label="Initialization" explain="How the starting centroids are chosen. Changing it restarts the clustering.">
        <div className="seg-buttons">
          {(Object.keys(INIT_NAMES) as InitMethod[]).map((m) => (
            <button key={m} className={p.init === m ? 'on' : ''} onClick={() => ctl.setParams({ init: m })}>
              {m === 'random' ? 'Random points' : m === 'kmeans++' ? 'K-means++' : 'Manual'}
            </button>
          ))}
        </div>
      </Param>
      <Param label="Max iterations" value={p.maxIter} explain="Safety cap; normally k-means converges well before this.">
        <input type="range" min={1} max={50} step={1} value={p.maxIter} onChange={(e) => ctl.setParams({ maxIter: Number(e.target.value) })} />
      </Param>
      <Param
        label="Step through each point"
        value={stepsEachPoint(s) ? 'on' : 'off'}
        explain={`Show each point's assignment individually, or all at once. Auto = on for ${AUTO_STEP_LIMIT} points or fewer.`}
      >
        <div className="seg-buttons">
          {(['auto', 'on', 'off'] as StepMode[]).map((m) => (
            <button key={m} className={p.stepPoints === m ? 'on' : ''} onClick={() => ctl.setParams({ stepPoints: m })}>
              {m}
            </button>
          ))}
        </div>
      </Param>
      <label className="check-row">
        <input type="checkbox" checked={p.stepCentroids} onChange={(e) => ctl.setParams({ stepCentroids: e.target.checked })} /> Step through each centroid in the update step
      </label>
      <Param label="Seed" explain="Controls every random choice, so demos are repeatable.">
        <div className="seed-row">
          <input
            type="number"
            className="seed-input mono"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            onBlur={() => {
              const n = parseInt(seedText, 10);
              if (!Number.isNaN(n) && n !== s.seed) ctl.setSeed(n);
              else setSeedText(String(s.seed));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="btn btn-soft btn-small" onClick={ctl.newSeed}>
            new seed
          </button>
        </div>
      </Param>
      <p className="param-foot">Reset restores the default dataset, parameters and seed (2024).</p>
    </div>
  );
}

export function ScenariosPanel({ ctl }: { ctl: KController }) {
  const s: KState = ctl.state;
  return (
    <div className="scenarios">
      <p className="sc-intro">Each demo loads a dataset, k, initialization and (where needed) hand-placed centroids. The math runs live in the same engine.</p>
      <div className="sc-list">
        {SCENARIOS.map((sc) => (
          <button key={sc.id} className={`sc-card ${s.scenario?.id === sc.id ? 'active' : ''}`} onClick={() => ctl.loadScenario(sc)}>
            <span className="sc-letter">{sc.letter}</span>
            <span className="sc-text">
              <b>{sc.title}</b>
              <span>{sc.summary}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="sc-footer">
        <button className="btn btn-soft" onClick={ctl.exitScenario} disabled={!s.scenario}>
          Exit scenario
        </button>
      </div>
    </div>
  );
}
