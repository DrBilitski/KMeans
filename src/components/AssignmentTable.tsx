import { useMemo, useRef } from 'react';
import { fmt2, fmtPoint } from '../engine/format';
import { distanceTable } from '../engine/geometry';
import { KState } from '../engine/kmeans';
import { CentroidTag, Swatch, clusterColor } from './clusters';
import { useScrollRowIntoView } from './ui';

/**
 * The k-means equivalent of the Q-table: one row per point, the distance to
 * each centroid (from the engine), and the assigned cluster.
 */
export function AssignmentTable({ state: s, inspected, onRowClick }: { state: KState; inspected: number | null; onRowClick: (i: number) => void }) {
  const table = useMemo(() => distanceTable(s.points, s.centroids), [s.points, s.centroids]);
  const box = useRef<HTMLDivElement>(null);
  const ph = s.phase;
  const current = ph === 'selectPoint' || ph === 'measure' || ph === 'choose' ? s.cursor : null;
  const changedNow = new Set(s.status !== 'init' ? s.changes.filter((c) => c.from !== null).map((c) => c.point) : []);
  const members = new Set(ph === 'gather' || ph === 'computeMean' || ph === 'move' ? s.mean?.members ?? [] : []);

  useScrollRowIntoView(box, '.row-current', [current, s.tick]);
  useScrollRowIntoView(box, '.row-inspected', [inspected]);

  if (s.points.length === 0) return <div className="table-empty">No points yet. Click the plot to add some.</div>;

  return (
    <div className="atable-box" ref={box}>
      <table className="atable">
        <thead>
          <tr>
            <th>Point</th>
            <th>(x, y)</th>
            {s.centroids.length === 0 ? (
              <th>distances</th>
            ) : (
              s.centroids.map((_, j) => (
                <th key={j} style={{ background: clusterColor(j).dark }}>
                  to C{j + 1}
                </th>
              ))
            )}
            <th>Cluster</th>
          </tr>
        </thead>
        <tbody>
          {s.points.map((p, i) => {
            const dc = table[i];
            const a = s.assign[i];
            const isCur = i === current;
            // the current point's winner is only revealed at Choose Nearest
            const showWin = s.status !== 'init' && !(isCur && ph !== 'choose');
            return (
              <tr
                key={p.label}
                className={`arow ${isCur ? 'row-current' : ''} ${inspected === i ? 'row-inspected' : ''} ${members.has(i) ? 'row-member' : ''}`}
                onClick={() => onRowClick(i)}
              >
                <td className="pcell">
                  {p.label}
                  {changedNow.has(i) && <span className="moved-tag" title="Changed cluster this iteration">moved</span>}
                </td>
                <td className="xy mono">{fmtPoint(p)}</td>
                {s.centroids.length === 0 ? (
                  <td className="dcell muted">—</td>
                ) : (
                  dc.rows.map((r) => (
                    <td key={r.centroid} className={`dcell mono ${showWin && dc.tied.includes(r.centroid) ? (r.centroid === dc.winner ? 'dmin' : 'dtie') : ''}`}>
                      {fmt2(r.d)}
                    </td>
                  ))
                )}
                <td className="ccell">{a === null ? <span className="muted">—</span> : <CentroidTag j={a} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="atable-foot">
        <span>
          <span className="lm lm-y">2.06</span> smallest distance
        </span>
        <span>
          <span className="lm lm-p">P3</span> current point
        </span>
        <span>
          <span className="lm lm-c">P5</span> inspected (click a row)
        </span>
        <span>
          <Swatch cluster={null} /> unassigned
        </span>
      </div>
    </div>
  );
}
