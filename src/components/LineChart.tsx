/**
 * Minimal SVG line chart for classroom-readable curves (from the Q-Learning
 * Explorer), extended with x tick labels, dots and one highlighted point.
 */
export function LineChart({
  series,
  xLabel,
  xTicks,
  emptyText,
  yMin,
  yMax,
  dots = false,
  highlight,
  format,
  height = 170,
}: {
  series: { values: number[]; className: string }[];
  xLabel: string;
  /** Label under each x position (shown when there is room). */
  xTicks?: string[];
  emptyText: string;
  yMin?: number;
  yMax?: number;
  dots?: boolean;
  /** Index to mark with a large yellow dot. */
  highlight?: number;
  format?: (v: number) => string;
  height?: number;
}) {
  const W = 520;
  const H = height;
  const pad = { l: 58, r: 14, t: 14, b: 34 };
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n === 0) return <div className="chart-empty">{emptyText}</div>;

  const all = series.flatMap((s) => s.values);
  const lo = yMin ?? Math.min(...all);
  let hi = yMax ?? Math.max(...all);
  if (hi - lo < 1e-9) hi = lo + 1;
  const sx = (i: number) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const fmt = format ?? ((v: number) => (Math.abs(hi - lo) >= 10 ? Math.round(v).toString() : v.toFixed(2)));
  const tickEvery = xTicks ? Math.max(1, Math.ceil(xTicks.length / 12)) : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
      {[lo, (lo + hi) / 2, hi].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" className="chart-tick">
            {fmt(t)}
          </text>
        </g>
      ))}
      {series.map((s, k) => (
        <g key={k}>
          <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(v)}`).join(' ')} className={`ln ${s.className}`} />
          {dots && s.values.map((v, i) => <circle key={i} cx={sx(i)} cy={sy(v)} r={4} className={`dot ${s.className}`} />)}
        </g>
      ))}
      {highlight !== undefined && series[0]?.values[highlight] !== undefined && (
        <circle cx={sx(highlight)} cy={sy(series[0].values[highlight])} r={9} className="chart-highlight" />
      )}
      {xTicks ? (
        xTicks.map((t, i) =>
          (i % tickEvery === 0 && xTicks.length - 1 - i >= Math.max(1, tickEvery * 0.75)) || i === xTicks.length - 1 ? (
            <text key={i} x={sx(i)} y={H - 16} textAnchor="middle" className={`chart-tick ${i === highlight ? 'tick-on' : ''}`}>
              {t}
            </text>
          ) : null,
        )
      ) : (
        <>
          <text x={pad.l} y={H - 16} className="chart-tick">
            1
          </text>
          <text x={W - pad.r} y={H - 16} textAnchor="end" className="chart-tick">
            {n}
          </text>
        </>
      )}
      <text x={(pad.l + W - pad.r) / 2} y={H - 2} textAnchor="middle" className="chart-axis">
        {xLabel}
      </text>
    </svg>
  );
}
