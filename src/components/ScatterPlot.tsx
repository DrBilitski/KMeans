import { MouseEvent, useMemo, useRef } from 'react';
import { cName, fmt2, fmtNum } from '../engine/format';
import { DistanceCalc, PLANE_MAX, Pt, voronoiCells } from '../engine/geometry';
import { KState, UnitsView, waitingReason } from '../engine/kmeans';
import { fmtReal, realPoint, toReal } from '../engine/useCases';
import { Marker, clusterColor } from './clusters';

export interface PlotToggles {
  territory: boolean;
  lines: boolean;
  trails: boolean;
  labels: boolean;
}

const L = 58;
const T = 12;
const SIZE = 546;
const W = L + SIZE + 14;
const H = T + SIZE + 50;
const S = SIZE / PLANE_MAX;
const sx = (x: number) => L + x * S;
const sy = (y: number) => T + (PLANE_MAX - y) * S;
const TICKS = Array.from({ length: PLANE_MAX + 1 }, (_, i) => i);

/** A distance line with its label at the midpoint. */
function DistLine({ p, c, d, win, dim, cls }: { p: Pt; c: Pt; d: number; win: boolean; dim?: boolean; cls: string }) {
  const mx = (sx(p.x) + sx(c.x)) / 2;
  const my = (sy(p.y) + sy(c.y)) / 2;
  return (
    <g className={`dline ${cls} ${win ? 'dline-win' : ''} ${dim ? 'dline-dim' : ''}`}>
      <line x1={sx(p.x)} y1={sy(p.y)} x2={sx(c.x)} y2={sy(c.y)} />
      <text x={mx} y={my + 5} textAnchor="middle" className="dlabel">
        {fmt2(d)}
      </text>
    </g>
  );
}

export function ScatterPlot({
  state: s,
  inspected,
  inspectCalc,
  toggles,
  onPointClick,
  onPointRemove,
  onEmptyClick,
}: {
  state: KState;
  inspected: number | null;
  inspectCalc: DistanceCalc | null;
  toggles: PlotToggles;
  onPointClick: (i: number) => void;
  onPointRemove: (i: number) => void;
  onEmptyClick: (p: Pt) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const cells = useMemo(() => (toggles.territory && s.centroids.length > 0 ? voronoiCells(s.centroids) : []), [toggles.territory, s.centroids]);
  const ph = s.phase;
  const placing = s.status === 'init' && s.params.init === 'manual' && s.centroids.length < s.params.k && s.manualQueue.length === 0 && s.points.length > 0;
  const waiting = waitingReason(s);

  const currentPoint = ph === 'selectPoint' || ph === 'measure' || ph === 'choose' ? s.cursor : null;
  const meanPhase = ph === 'gather' || ph === 'computeMean' || ph === 'move' ? s.mean : null;
  const currentCentroid = meanPhase ? meanPhase.centroid : null;
  const members = new Set(meanPhase?.members ?? []);
  const pending = s.pendingInit;
  const lastDraw = ph === 'initPlace' ? s.initDraws[s.initDraws.length - 1] : null;
  const chosenInit = ph === 'initDraw' ? pending?.pick ?? null : lastDraw?.pick ?? null;
  const d2rows = (ph === 'initD2' || ph === 'initDraw') && pending?.rows ? pending.rows : null;
  const maxProb = d2rows ? Math.max(...d2rows.map((r) => r.prob)) : 1;

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    const el = svg.current;
    if (!el) return;
    const ctm = el.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = (pt.x - L) / S;
    const y = PLANE_MAX - (pt.y - T) / S;
    if (x < 0 || x > PLANE_MAX || y < 0 || y > PLANE_MAX) return;
    onEmptyClick({ x, y });
  };

  const distLines = (dc: DistanceCalc, cls: string, showWinner: boolean) => {
    const p = s.points[dc.point];
    if (!p) return null;
    return dc.rows.map((r) => (
      <DistLine key={`${cls}${r.centroid}`} p={p} c={{ x: r.cx, y: r.cy }} d={r.d} win={showWinner && r.centroid === dc.winner} dim={showWinner && r.centroid !== dc.winner} cls={cls} />
    ));
  };

  return (
    <div className="plot-wrap">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className={`plot ${placing ? 'plot-placing' : ''}`}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label="Scatter plot of the data points and centroids"
      >
        <rect x={L} y={T} width={SIZE} height={SIZE} className="plot-bg" />

        <AxisTitles units={s.units} />

        {cells.map((poly, j) =>
          poly.length ? (
            <polygon key={j} points={poly.map((q) => `${sx(q.x)},${sy(q.y)}`).join(' ')} fill={clusterColor(j).fill} className="territory" />
          ) : null,
        )}

        {TICKS.map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={T} y2={T + SIZE} className={t === 0 ? 'axis' : 'gridline'} />
            <line x1={L} x2={L + SIZE} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'axis' : 'gridline'} />
            {(!s.units || t % 2 === 0) && (
              <text x={sx(t)} y={T + SIZE + 20} textAnchor="middle" className="tick">
                {s.units ? fmtReal(s.units.x, toReal(s.units.x, t)) : t}
              </text>
            )}
            {(!s.units || t % 2 === 0) && (
              <text x={L - 8} y={sy(t) + 5} textAnchor="end" className="tick">
                {s.units ? fmtNum(toReal(s.units.y, t)) : t}
              </text>
            )}
          </g>
        ))}

        {toggles.trails &&
          s.trails.map((tr, j) =>
            tr.length > 1 ? (
              <g key={j} className="trail" style={{ color: clusterColor(j).dark }}>
                <polyline points={tr.map((q) => `${sx(q.x)},${sy(q.y)}`).join(' ')} />
                {tr.slice(0, -1).map((q, k) => (
                  <circle key={k} cx={sx(q.x)} cy={sy(q.y)} r={4} />
                ))}
              </g>
            ) : null,
          )}

        {toggles.lines &&
          s.points.map((p, i) => {
            const a = s.assign[i];
            const c = a !== null ? s.centroids[a] : null;
            if (!c || members.has(i)) return null;
            return <line key={i} x1={sx(p.x)} y1={sy(p.y)} x2={sx(c.x)} y2={sy(c.y)} stroke={clusterColor(a).fill} className="assign-line" />;
          })}

        {/* k-means++: D(p) to the nearest centroid, with halos sized by probability */}
        {d2rows &&
          d2rows.map((r) => {
            const p = s.points[r.point];
            const c = s.centroids[r.nearest];
            return (
              <g key={r.point}>
                {r.d2 > 0 && <line x1={sx(p.x)} y1={sy(p.y)} x2={sx(c.x)} y2={sy(c.y)} className="d2-line" />}
                {r.prob > 0 && <circle cx={sx(p.x)} cy={sy(p.y)} r={9 + 22 * Math.sqrt(r.prob / maxProb)} className="prob-halo" />}
              </g>
            );
          })}

        {/* update step: members and the move to their mean */}
        {meanPhase &&
          meanPhase.members.map((i) => {
            const p = s.points[i];
            const c = s.centroids[meanPhase.centroid];
            return <line key={i} x1={sx(p.x)} y1={sy(p.y)} x2={sx(c.x)} y2={sy(c.y)} stroke={clusterColor(meanPhase.centroid).dark} className="member-line" />;
          })}
        {(ph === 'computeMean' || ph === 'move') && meanPhase && !meanPhase.empty && <MoveArrow from={meanPhase.from} to={meanPhase.to} />}
        {ph === 'updateAll' && s.means.map((m) => (m.empty ? null : <MoveArrow key={m.centroid} from={m.from} to={m.to} />))}
        {ph === 'computeMean' && meanPhase && !meanPhase.empty && (
          <g className="mean-target" transform={`translate(${sx(meanPhase.to.x)},${sy(meanPhase.to.y)})`}>
            <circle r={16} />
            <line x1={-22} x2={22} y1={0} y2={0} />
            <line y1={-22} y2={22} x1={0} x2={0} />
            <text x={20} y={-16} className="mean-label">
              mean
            </text>
          </g>
        )}

        {/* assignment step: distances from the current point */}
        {s.dist && (ph === 'measure' || ph === 'choose') && distLines(s.dist, 'cur', ph === 'choose')}
        {inspectCalc && inspected !== currentPoint && distLines(inspectCalc, 'insp', true)}

        {s.points.map((p, i) => {
          const a = s.assign[i];
          const col = clusterColor(a);
          const isCur = i === currentPoint;
          const changed = ph === 'choose' && s.lastChange?.point === i;
          return (
            <g
              key={`${p.label}`}
              className={`pt ${members.has(i) ? 'pt-member' : ''} ${changed ? 'pt-changed' : ''}`}
              transform={`translate(${sx(p.x)},${sy(p.y)})`}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) onPointRemove(i);
                else onPointClick(i);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPointRemove(i);
              }}
            >
              <title>{`${p.label} (${p.x}, ${p.y})${s.units ? ` = ${describeReal(s.units, p)}` : ''}${a !== null ? ` · cluster ${a + 1}` : ''} · click to inspect${s.units ? '' : ', shift-click to remove'}`}</title>
              <circle r={15} className="pt-hit" />
              {members.has(i) && <circle r={13} className="member-ring" stroke={col.dark} />}
              {chosenInit === i && <circle r={17} className="chosen-ring" />}
              <Marker cluster={a} r={7.5} fill={col.fill} stroke={col.dark} strokeWidth={1.8} className="pt-mark" />
              {isCur && <circle r={15} className="current-ring" />}
              {inspected === i && <circle r={19} className="inspect-ring" />}
              {(toggles.labels || isCur || inspected === i || chosenInit === i) && (
                <text x={10} y={-10} className={`pt-label ${isCur || inspected === i ? 'pt-label-on' : ''}`}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}

        {s.centroids.map((c, j) => {
          const col = clusterColor(j);
          return (
            <g key={j} className="centroid" style={{ transform: `translate(${sx(c.x)}px, ${sy(c.y)}px)` }}>
              {currentCentroid === j && <circle r={26} className="current-ring" />}
              <Marker cluster={j} r={14} fill={col.fill} stroke="#1e1b4b" strokeWidth={3.2} />
              <line x1={-6} x2={6} className="c-cross" />
              <line y1={-6} y2={6} className="c-cross" />
              <text x={17} y={-15} className="c-label" fill={col.dark}>
                {cName(j)}
              </text>
            </g>
          );
        })}

        {(placing || (waiting && s.points.length === 0)) && (
          <text x={L + SIZE / 2} y={T + 30} textAnchor="middle" className="plot-hint">
            {placing ? `Click anywhere to place ${cName(s.centroids.length)}` : 'Click to add points'}
          </text>
        )}
      </svg>
    </div>
  );
}

export function describeReal(u: UnitsView, p: { x: number; y: number; extra?: Record<string, number> }): string {
  const r = realPoint(u, p);
  return `${fmtReal(u.x, r.x)}/visit, ${fmtNum(Math.round(r.y * 10) / 10)} visits/mo${p.extra?.coupons !== undefined ? `, ${p.extra.coupons}% coupons` : ''}`;
}

function AxisTitles({ units }: { units: UnitsView | null }) {
  const x = units ? `${units.x.name} ($)${units.scaled ? ' · plotted as $ ÷ 20' : ''}` : 'x';
  const y = units ? `${units.y.name}${units.scaled ? ' · plotted as visits ÷ 2' : ' (same scale as $!)'}` : 'y';
  return (
    <g className="axis-titles">
      <text x={L + SIZE / 2} y={T + SIZE + 44} textAnchor="middle">
        {x}
      </text>
      <text transform={`translate(16, ${T + SIZE / 2}) rotate(-90)`} textAnchor="middle">
        {y}
      </text>
    </g>
  );
}

function MoveArrow({ from, to }: { from: Pt; to: Pt }) {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.05) return null;
  return <line x1={sx(from.x)} y1={sy(from.y)} x2={sx(to.x)} y2={sy(to.y)} className="move-arrow" markerEnd="url(#arrowhead)" />;
}

/** Defs shared by every plot on the page (arrowhead). */
export function PlotDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10Z" fill="#a16207" />
        </marker>
      </defs>
    </svg>
  );
}
