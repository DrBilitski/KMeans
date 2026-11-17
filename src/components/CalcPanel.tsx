import { cName, fmt2, fmtCentroid, fmtCoord, fmtInertia, fmtPoint } from '../engine/format';
import { DistanceCalc, MeanCalc } from '../engine/geometry';
import { KState } from '../engine/kmeans';
import { CentroidTag, clusterColor } from './clusters';
import { describeReal } from './ScatterPlot';

/** Which calculation the panel is showing (used for its title). */
export function calcMode(s: KState, inspect: DistanceCalc | null): 'inspect' | 'distance' | 'mean' | 'check' | 'intro' {
  if (inspect) return 'inspect';
  if (s.phase === 'selectPoint' || s.phase === 'measure' || s.phase === 'choose' || s.phase === 'assignAll') return 'distance';
  if (s.phase === 'gather' || s.phase === 'computeMean' || s.phase === 'move' || s.phase === 'updateAll') return 'mean';
  if (s.phase === 'check') return 'check';
  return 'intro';
}

export const CALC_TITLES = {
  inspect: 'Distance Calculation (inspecting)',
  distance: 'Distance Calculation',
  mean: 'Mean Calculation',
  check: 'Convergence Check',
  intro: 'Calculations',
};

const paren = (n: number) => fmt2(n);

export function DistanceTable({ s, dc, reveal }: { s: KState; dc: DistanceCalc; reveal: boolean }) {
  const p = s.points[dc.point];
  return (
    <div className="dcalc">
      <div className="calc-head">
        Point <b>{p.label}</b> = <span className="mono">{fmtPoint(p)}</span>
        {s.units && <span className="real-note"> ({describeReal(s.units, p)}). Distances use the plotted {s.units.scaled ? 'scaled' : 'unscaled'} values.</span>}
      </div>
      {dc.rows.map((r) => {
        const win = reveal && r.centroid === dc.winner;
        return (
          <div key={r.centroid} className={`drow ${win ? 'drow-win' : ''} ${reveal && dc.tied.length > 1 && dc.tied.includes(r.centroid) ? 'drow-tie' : ''}`}>
            <span className="drow-label" style={{ color: clusterColor(r.centroid).dark }}>
              to <CentroidTag j={r.centroid} /> <span className="mono">{fmtCentroid({ x: r.cx, y: r.cy })}</span>:
            </span>
            <span className="mono drow-math">
              √(({fmtCoord(dc.px)} − {paren(r.cx)})² + ({fmtCoord(dc.py)} − {paren(r.cy)})²) = √({fmt2(r.dx2)} + {fmt2(r.dy2)}) = √{fmt2(r.d2)} ={' '}
              <b className="dval">{fmt2(r.d)}</b>
            </span>
          </div>
        );
      })}
      {reveal &&
        (dc.tied.length > 1 ? (
          <div className="calc-verdict tie">
            Tie: {dc.tied.map(cName).join(' and ')} are {dc.tied.length === 2 ? 'both' : 'all'} {fmt2(dc.rows[dc.winner].d)} away. Ties go to the lower-numbered centroid → <CentroidTag j={dc.winner} />
          </div>
        ) : (
          <div className="calc-verdict">
            Smallest distance: <CentroidTag j={dc.winner} /> → {p.label} joins cluster {dc.winner + 1}
          </div>
        ))}
    </div>
  );
}

function MeanBlock({ s, m, stage }: { s: KState; m: MeanCalc; stage: 'gather' | 'compute' | 'move' }) {
  const j = m.centroid;
  const pts = m.members.map((i) => s.points[i]);
  return (
    <div className="mcalc">
      <div className="calc-head">
        Cluster {j + 1} members{' '}
        <span className="muted">
          ({m.n} point{m.n === 1 ? '' : 's'})
        </span>
        :{' '}
        {m.empty ? (
          <b className="empty-flag">none</b>
        ) : (
          pts.map((p, k) => (
            <span key={p.label} className="member">
              <b>{p.label}</b> <span className="mono">{fmtPoint(p)}</span>
              {k < pts.length - 1 ? ', ' : ''}
            </span>
          ))
        )}
      </div>
      {m.empty ? (
        <div className="calc-verdict tie">
          <CentroidTag j={j} /> has no points, so it has no mean and does not move. It stays at <span className="mono">{fmtCentroid(m.from)}</span>.
        </div>
      ) : stage === 'gather' ? (
        <div className="calc-wait-line">Next: add up the x values and the y values, then divide by {m.n}.</div>
      ) : (
        <>
          <div className="mrow mono">
            new x = ({pts.map((p) => fmtCoord(p.x)).join(' + ')}) / {m.n} = {fmtCoord(m.sumX)} / {m.n} = <b className="dval">{fmt2(m.to.x)}</b>
          </div>
          <div className="mrow mono">
            new y = ({pts.map((p) => fmtCoord(p.y)).join(' + ')}) / {m.n} = {fmtCoord(m.sumY)} / {m.n} = <b className="dval">{fmt2(m.to.y)}</b>
          </div>
          <div className={`calc-verdict ${stage === 'move' ? 'moved' : ''}`}>
            <CentroidTag j={j} /> moves from <span className="mono">{fmtCentroid(m.from)}</span> to <b className="mono">{fmtCentroid(m.to)}</b>
            {s.units && <span className="real-note"> = the average customer in this cluster: {describeReal(s.units, m.to)}</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function CalcPanel({ state: s, inspect }: { state: KState; inspect: DistanceCalc | null }) {
  const mode = calcMode(s, inspect);
  const ph = s.phase;

  if (mode === 'inspect' && inspect) {
    return (
      <div className="calc-panel">
        <div className="inspect-note">Inspecting only: this does not change the algorithm. Click the point again (or press Esc) to stop.</div>
        <DistanceTable s={s} dc={inspect} reveal />
        <SquaredNote />
      </div>
    );
  }

  if (mode === 'distance') {
    if (ph === 'assignAll') {
      const moved = s.changes.filter((c) => c.from !== null);
      return (
        <div className="calc-panel">
          <div className="calc-head">All {s.points.length} points were assigned to their nearest centroid at once.</div>
          {moved.length === 0 && s.changes.length > 0 && <div className="calc-wait-line">This is the first assignment: every point received its first cluster.</div>}
          {moved.length === 0 && s.changes.length === 0 && <div className="calc-verdict">No point changed cluster.</div>}
          {moved.length > 0 && (
            <div className="change-list">
              {moved.map((c) => (
                <span key={c.point} className="change-chip">
                  <b>{s.points[c.point].label}</b> <CentroidTag j={c.from!} /> → <CentroidTag j={c.to} />
                </span>
              ))}
            </div>
          )}
          <div className="calc-wait-line">Click any point (or table row) to see its full distance calculation.</div>
          <SquaredNote />
        </div>
      );
    }
    const p = s.points[s.cursor];
    return (
      <div className="calc-panel">
        {ph === 'selectPoint' || !s.dist ? (
          <>
            <div className="calc-head">
              Point <b>{p.label}</b> = <span className="mono">{fmtPoint(p)}</span>
            </div>
            <div className="formula">
              d(p, c) = √((p<sub>x</sub> − c<sub>x</sub>)² + (p<sub>y</sub> − c<sub>y</sub>)²)
            </div>
            <div className="calc-wait-line">Next: measure the distance from {p.label} to each of the {s.centroids.length} centroids.</div>
          </>
        ) : (
          <DistanceTable s={s} dc={s.dist} reveal={ph === 'choose'} />
        )}
        {ph === 'choose' && s.lastChange && s.lastChange.from !== null && (
          <div className="switch-callout">
            ↺ {p.label} moved from <CentroidTag j={s.lastChange.from} /> to <CentroidTag j={s.lastChange.to} />
          </div>
        )}
        <SquaredNote />
      </div>
    );
  }

  if (mode === 'mean') {
    if (ph === 'updateAll') {
      return (
        <div className="calc-panel">
          {s.means.map((m) => (
            <MeanBlock key={m.centroid} s={s} m={m} stage="move" />
          ))}
        </div>
      );
    }
    return (
      <div className="calc-panel">
        <MeanBlock s={s} m={s.mean!} stage={ph === 'gather' ? 'gather' : ph === 'computeMean' ? 'compute' : 'move'} />
        <p className="eps-note">The mean is the point with the smallest total squared distance to its group, so moving a centroid there can only lower (or keep) the inertia.</p>
      </div>
    );
  }

  if (mode === 'check' && s.check) {
    const c = s.check;
    const moved = c.changes.filter((x) => x.from !== null);
    const delta = c.before - c.after;
    return (
      <div className="calc-panel">
        <div className="check-grid">
          <div className="check-cell">
            <div className="cc-label">Points that changed cluster</div>
            <div className="cc-value">{c.iteration === 1 ? `${c.changes.length} (first assignment)` : moved.length}</div>
          </div>
          <div className="check-cell">
            <div className="cc-label">Inertia {c.iteration === 1 ? 'after assignment → after update' : 'last iteration → now'}</div>
            <div className="cc-value mono">
              {fmtInertia(c.before)} → {fmtInertia(c.after)}
            </div>
          </div>
          <div className="check-cell">
            <div className="cc-label">Improvement</div>
            <div className="cc-value mono">{delta > 1e-12 ? `−${fmtInertia(delta)}` : '0.000'}</div>
          </div>
        </div>
        {moved.length > 0 && (
          <div className="change-list">
            {moved.map((x) => (
              <span key={x.point} className="change-chip">
                <b>{s.points[x.point].label}</b> <CentroidTag j={x.from!} /> → <CentroidTag j={x.to} />
              </span>
            ))}
          </div>
        )}
        <div className={`verdict-card ${c.converged ? 'v-conv' : c.cutoff ? 'v-cut' : 'v-cont'}`}>
          {c.converged
            ? `✅ Converged: no point changed cluster in iteration ${c.iteration}. Running more iterations would change nothing.`
            : c.cutoff
              ? `⏱ Stopped at the iteration cap (${s.params.maxIter}). This is a cutoff, not convergence.`
              : '🔁 Not converged: points changed cluster, so the centroids may still move. Another iteration follows.'}
        </div>
      </div>
    );
  }

  return (
    <div className="calc-panel">
      <div className="formula">
        d(p, c) = √((p<sub>x</sub> − c<sub>x</sub>)² + (p<sub>y</sub> − c<sub>y</sub>)²)
      </div>
      <div className="formula">
        new c = ( Σx / n , Σy / n ) over the n points in the cluster
      </div>
      <div className="calc-wait-line">
        {s.status === 'init'
          ? `Placing the ${s.params.k} starting centroids (${s.centroids.length} placed so far). The Initialization panel shows every random draw. Then each point will be measured against every centroid here.`
          : 'Click any point to see its distances.'}
      </div>
      <SquaredNote />
    </div>
  );
}

function SquaredNote() {
  return <p className="eps-note">The nearest centroid is the same whether you compare distances or squared distances (√ keeps the order), so the engine may compare d², but the table shows real distances.</p>;
}
