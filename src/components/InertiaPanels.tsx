import { fmtInertia } from '../engine/format';
import { ELBOW_RESTARTS } from '../engine/elbow';
import { KState } from '../engine/kmeans';
import { RESTART_COUNT, bestRun } from '../engine/restarts';
import { KController } from '../useKMeans';
import { CentroidTag, Marker, clusterColor } from './clusters';
import { LineChart } from './LineChart';
import { AnimatedNumber } from './ui';

export function InertiaPanel({ state: s, animMs }: { state: KState; animMs: number }) {
  const total = s.inertia;
  const maxPart = Math.max(1e-9, ...s.perCluster);
  const ticks = s.history.map((h) => `${h.iteration}${h.half === 'assign' ? 'a' : 'u'}`);
  return (
    <div className="inertia">
      <div className="inertia-top">
        <div className="inertia-big mono">{total === null ? '—' : <AnimatedNumber value={total} duration={animMs} />}</div>
        <div className="inertia-formula">
          Inertia = Σ (distance from each point to its centroid)²
        </div>
      </div>
      {total !== null && (
        <div className="parts">
          {s.perCluster.map((v, j) => (
            <div key={j} className="part">
              <CentroidTag j={j} />
              <div className="part-bar">
                <div style={{ width: `${(v / maxPart) * 100}%`, background: clusterColor(j).fill }} />
              </div>
              <span className="mono">{fmtInertia(v)}</span>
            </div>
          ))}
        </div>
      )}
      <LineChart
        series={[{ values: s.history.map((h) => h.value), className: 'ln-inertia' }]}
        xTicks={ticks}
        xLabel="after each half-iteration (a = assignment, u = update)"
        emptyText="Inertia appears after the first assignment step."
        dots
        yMin={0}
        format={(v) => v.toFixed(1)}
        height={180}
      />
      <p className="eps-note">Each half-iteration can only lower or keep the inertia: assignment gives every point its closest centroid, and the mean minimizes squared distance. So k-means always converges, but maybe to a poor local minimum.</p>
    </div>
  );
}

export function ElbowPanel({ ctl }: { ctl: KController }) {
  const s = ctl.state;
  const e = ctl.elbow;
  const kIdx = e ? e.points.findIndex((p) => p.k === s.params.k) : -1;
  return (
    <div className="elbow">
      <div className="panel-actions">
        <button className="btn btn-soft btn-small" onClick={ctl.computeElbow} disabled={s.points.length < 2}>
          📐 Compute elbow chart
        </button>
        <span className="muted small">
          k = 1 … 8, k-means++, {ELBOW_RESTARTS} seeded restarts each (lowest inertia kept), seed {s.seed}. Same engine as the main view.
        </span>
      </div>
      {e ? (
        <>
          <LineChart
            series={[{ values: e.points.map((p) => p.inertia), className: 'ln-elbow' }]}
            xTicks={e.points.map((p) => `k=${p.k}`)}
            xLabel="number of clusters k"
            emptyText=""
            dots
            yMin={0}
            highlight={kIdx >= 0 ? kIdx : undefined}
            format={(v) => v.toFixed(0)}
            height={190}
          />
          <div className="elbow-values mono">
            {e.points.map((p) => (
              <span key={p.k} className={p.k === s.params.k ? 'on' : ''}>
                k={p.k}: {fmtInertia(p.inertia)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-empty">Computed on demand for the current data. Press the button.</div>
      )}
      <p className="eps-note">
        Inertia always decreases as k grows (with k = number of points it is zero), so “lowest inertia” can’t choose k. Look for the <b>elbow</b>: the k after which adding clusters stops helping much. It is a heuristic,
        not a rule. On Uniform Random or Overlapping Blobs there is often no clear elbow.
      </p>
    </div>
  );
}

const MW = 120;
const ms = (v: number) => 6 + (v / 10) * (MW - 12);

function MiniPlot({ s }: { s: KState }) {
  return (
    <svg viewBox={`0 0 ${MW} ${MW}`} className="mini-plot">
      <rect x={0} y={0} width={MW} height={MW} className="plot-bg" />
      {s.points.map((p, i) => {
        const c = clusterColor(s.assign[i]);
        return <Marker key={p.label} cluster={s.assign[i]} r={2.6} transform={`translate(${ms(p.x)},${MW - ms(p.y)})`} fill={c.fill} stroke={c.dark} strokeWidth={0.6} />;
      })}
      {s.centroids.map((c, j) => (
        <Marker key={j} cluster={j} r={5.5} transform={`translate(${ms(c.x)},${MW - ms(c.y)})`} fill={clusterColor(j).fill} stroke="#1e1b4b" strokeWidth={1.6} />
      ))}
    </svg>
  );
}

export function RestartsPanel({ ctl }: { ctl: KController }) {
  const s = ctl.state;
  const r = ctl.restarts;
  const best = r ? bestRun(r.runs) : -1;
  const manual = s.params.init === 'manual';
  return (
    <div className="restarts">
      <div className="panel-actions">
        <button className="btn btn-soft btn-small" onClick={ctl.runRestarts} disabled={manual || s.points.length === 0}>
          🎲 Run {RESTART_COUNT} restarts
        </button>
        <span className="muted small">
          {manual
            ? 'Restarts need a random initialization method (choose Random points or K-means++).'
            : `Same data, k = ${s.params.k}, ${s.params.init === 'kmeans++' ? 'k-means++' : 'random points'}; seeds ${s.seed}–${s.seed + RESTART_COUNT - 1}. Click a result to load it.`}
        </span>
      </div>
      {r ? (
        <div className="gallery">
          {r.runs.map((run, i) => (
            <button key={run.seed} className={`mini ${i === best ? 'mini-best' : ''}`} onClick={() => ctl.loadRestart(run)} title={`Seed ${run.seed}: ${run.iterations} iterations`}>
              <MiniPlot s={run.final} />
              <span className="mini-label mono">
                #{run.run} · {fmtInertia(run.inertia)}
              </span>
              {i === best && <span className="mini-badge">★ best</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="chart-empty">Different starting points can give different answers. Run 10 restarts to see them side by side.</div>
      )}
      {r && (
        <p className="eps-note">
          {new Set(r.runs.map((x) => x.inertia.toFixed(3))).size === 1
            ? 'All 10 runs reached the same inertia here: this data has one clear answer.'
            : `${new Set(r.runs.map((x) => x.inertia.toFixed(3))).size} different final inertias: k-means converged to different local minima depending on the start. Practitioners run several restarts and keep the lowest.`}
        </p>
      )}
    </div>
  );
}
