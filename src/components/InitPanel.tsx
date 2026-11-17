import { useState } from 'react';
import { cName, fmt2, fmtCentroid, fmtProb } from '../engine/format';
import { INIT_NAMES, InitDraw, describeDraw } from '../engine/init';
import { KState } from '../engine/kmeans';
import { CentroidTag } from './clusters';

/** Alternating segment colours so neighbouring points are easy to tell apart. */
const SEG = ['#ddd6fe', '#c4b5fd'];

/**
 * The k-means equivalent of the epsilon panel: every random decision made
 * while placing the centroids, with the number drawn and where it landed.
 */
export function InitPanel({ state: s }: { state: KState }) {
  const [picked, setPicked] = useState<number | null>(null);
  const live = s.pendingInit;
  const shownIndex = picked !== null && picked < s.initDraws.length ? picked : null;
  const draw: InitDraw | null = shownIndex !== null ? s.initDraws[shownIndex] : live ?? s.initDraws[s.initDraws.length - 1] ?? null;
  const k = s.params.k;

  return (
    <div className="init">
      <div className="init-top">
        <div className="init-method">{INIT_NAMES[s.params.init]}</div>
        <div className="init-progress">
          {Array.from({ length: k }, (_, j) => (
            <button
              key={j}
              className={`ichip ${j < s.initDraws.length ? 'placed' : ''} ${draw?.centroid === j ? 'on' : ''}`}
              onClick={() => setPicked(j < s.initDraws.length && picked !== j ? j : null)}
              disabled={j >= s.initDraws.length}
              title={j < s.initDraws.length ? `Show how ${cName(j)} was chosen` : `${cName(j)} not placed yet`}
            >
              {j < s.initDraws.length ? <CentroidTag j={j} /> : cName(j)}
            </button>
          ))}
        </div>
      </div>
      {shownIndex !== null && <div className="init-replay">Showing how {cName(shownIndex)} was chosen (click again for the latest)</div>}

      {!draw ? (
        <div className="decision decision-wait">
          {s.params.init === 'manual'
            ? 'Manual: the instructor clicks k locations on the plot. Use it to set up good or deliberately bad starts.'
            : s.params.init === 'kmeans++'
              ? 'K-means++: the first centroid is a uniformly random data point. Each later one is drawn with probability proportional to D(p)², the squared distance to the nearest centroid so far.'
              : 'Random points (Forgy): each centroid is a data point chosen uniformly at random (all distinct).'}
          <div className="seed-line">
            Seed <b className="mono">{s.seed}</b>. Every random number comes from this seed, so a demo can be repeated exactly.
          </div>
        </div>
      ) : draw.kind === 'manual' ? (
        <div className="decision decision-wait">
          <span>
            <CentroidTag j={draw.centroid} /> was placed by hand at <b className="mono">{fmtCentroid(draw.position!)}</b>. No random number was used: manual placement is how you set up deliberately good or bad starts.
          </span>
        </div>
      ) : draw.kind === 'uniform' ? (
        <UniformDraw draw={draw} s={s} />
      ) : (
        <WeightedDraw draw={draw} s={s} />
      )}
    </div>
  );
}

function Marker({ r, label }: { r: number; label: string }) {
  return (
    <div className="prob-marker" style={{ left: `${r * 100}%` }}>
      <div className="prob-marker-label">{label}</div>
    </div>
  );
}

function UniformDraw({ draw, s }: { draw: InitDraw; s: KState }) {
  const n = draw.candidates.length;
  return (
    <>
      <div className="bar-caption">
        For <CentroidTag j={draw.centroid} />: every eligible point has the same 1/{n} chance{draw.centroid > 0 ? ' (points already used are excluded)' : ''}.
      </div>
      <div className="pbar">
        {draw.candidates.map((pi, k) => (
          <div key={pi} className={`pseg ${pi === draw.pick ? 'pseg-win' : ''}`} style={{ width: `${100 / n}%`, background: pi === draw.pick ? undefined : SEG[k % 2] }}>
            {100 / n >= 4.5 && <span>{s.points[pi].label}</span>}
          </div>
        ))}
        {draw.random !== null && <Marker key={`${draw.centroid}-${draw.random}`} r={draw.random} label={fmtProb(draw.random)} />}
      </div>
      <div className="prob-scale">
        <span>0</span>
        <span>1</span>
      </div>
      <div className="decision decision-exploit">
        <div className="decision-math">
          <span className="mono">random = {fmtProb(draw.random ?? 0)}</span>
          {draw.scripted && <span className="scripted-tag">predetermined</span>}
          <span className="mono small">{describeDraw(draw, s.points)}</span>
        </div>
        <div className="decision-word">{s.points[draw.pick!].label}</div>
      </div>
    </>
  );
}

function WeightedDraw({ draw, s }: { draw: InitDraw; s: KState }) {
  const rows = draw.rows!;
  const live = rows.filter((r) => r.d2 > 0);
  return (
    <>
      <div className="bar-caption">
        For <CentroidTag j={draw.centroid} />: slice width ∝ D(p)². Total D² = <b className="mono">{fmt2(draw.total)}</b>
      </div>
      <div className="pbar">
        {live.map((r, k) => (
          <div
            key={r.point}
            className={`pseg ${r.point === draw.pick ? 'pseg-win' : ''}`}
            style={{ width: `${r.prob * 100}%`, background: r.point === draw.pick ? undefined : SEG[k % 2] }}
            title={`${s.points[r.point].label}: D² = ${fmt2(r.d2)}, p = ${fmtProb(r.prob, 4)}`}
          >
            {r.prob >= 0.045 && <span>{s.points[r.point].label}</span>}
          </div>
        ))}
        {draw.random !== null && <Marker key={`${draw.centroid}-${draw.random}`} r={draw.random} label={fmtProb(draw.random)} />}
      </div>
      <div className="prob-scale">
        <span>0</span>
        <span>1</span>
      </div>
      {draw.random !== null && draw.pick !== null ? (
        <div className="decision decision-exploit">
          <div className="decision-math">
            <span className="mono">random = {fmtProb(draw.random)}</span>
            {draw.scripted && <span className="scripted-tag">predetermined</span>}
            <span className="mono small">{describeDraw(draw, s.points)}</span>
          </div>
          <div className="decision-word">{s.points[draw.pick].label}</div>
        </div>
      ) : (
        <div className="decision decision-wait">Next: draw a random number between 0 and 1 and see which slice it lands in.</div>
      )}
      <div className="d2-box">
        <table className="d2table">
          <thead>
            <tr>
              <th>Point</th>
              <th>D(p)²</th>
              <th>Prob.</th>
              <th>Interval on the bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.point} className={r.point === draw.pick ? 'd2-win' : r.d2 === 0 ? 'd2-zero' : ''}>
                <td>{s.points[r.point].label}</td>
                <td className="mono">{fmt2(r.d2)}</td>
                <td className="mono">{fmtProb(r.prob, 4)}</td>
                <td className="mono">{r.d2 > 0 ? `[${fmtProb(r.lo, 4)}, ${fmtProb(r.hi, 4)})` : 'never chosen'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eps-note">Far-away points are more likely, but any point with D(p)² &gt; 0 can be chosen. It is still random.</p>
    </>
  );
}
