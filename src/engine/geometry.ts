/**
 * Geometry for 2-D k-means: distances, means, inertia, Voronoi territories.
 * Pure functions. The UI never recomputes any of this itself; it calls these
 * engine functions or reads values the state machine recorded.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface DataPoint extends Pt {
  /** Stable label shown to students (P1, P2, … or A–G). */
  label: string;
  /** Use cases: extra features that are shown but NOT used for clustering (e.g. coupon %). */
  extra?: Record<string, number>;
}

/** Plane bounds: both axes run from 0 to 10. */
export const PLANE_MIN = 0;
export const PLANE_MAX = 10;

/** Two squared distances closer than this count as a tie (guards float noise). */
const TIE_EPS = 1e-9;

export const sqr = (n: number) => n * n;
export const dist2 = (a: Pt, b: Pt) => sqr(a.x - b.x) + sqr(a.y - b.y);
export const dist = (a: Pt, b: Pt) => Math.sqrt(dist2(a, b));
export const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12;

/** One row of the Distance panel: every intermediate value of d(p, c). */
export interface DistanceRow {
  centroid: number;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  dx2: number;
  dy2: number;
  d2: number;
  d: number;
}

export interface DistanceCalc {
  point: number;
  px: number;
  py: number;
  rows: DistanceRow[];
  /** Index of the nearest centroid (ties → lowest index). */
  winner: number;
  /** All centroids at the minimum distance, ascending. Length > 1 means a tie. */
  tied: number[];
}

/**
 * Distances from one point to every centroid, with the nearest one chosen.
 * Compares squared distances (same order as distances); ties go to the
 * lowest-numbered centroid.
 */
export function distanceCalc(pointIndex: number, p: Pt, centroids: Pt[]): DistanceCalc {
  const rows: DistanceRow[] = centroids.map((c, j) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d2 = dx * dx + dy * dy;
    return { centroid: j, cx: c.x, cy: c.y, dx, dy, dx2: dx * dx, dy2: dy * dy, d2, d: Math.sqrt(d2) };
  });
  let min = Infinity;
  for (const r of rows) min = Math.min(min, r.d2);
  const tied = rows.filter((r) => Math.abs(r.d2 - min) <= TIE_EPS * Math.max(1, min)).map((r) => r.centroid);
  return { point: pointIndex, px: p.x, py: p.y, rows, winner: tied[0] ?? -1, tied };
}

export function nearest(p: Pt, centroids: Pt[]): number {
  return distanceCalc(-1, p, centroids).winner;
}

export interface MeanCalc {
  centroid: number;
  members: number[];
  sumX: number;
  sumY: number;
  n: number;
  from: Pt;
  /** New position; equals `from` when the cluster is empty. */
  to: Pt;
  empty: boolean;
}

/** Mean of the points assigned to centroid j, with the sums kept for display. */
export function meanCalc(j: number, points: Pt[], assign: (number | null)[], current: Pt): MeanCalc {
  const members: number[] = [];
  let sumX = 0;
  let sumY = 0;
  points.forEach((p, i) => {
    if (assign[i] === j) {
      members.push(i);
      sumX += p.x;
      sumY += p.y;
    }
  });
  const n = members.length;
  const empty = n === 0;
  return {
    centroid: j,
    members,
    sumX,
    sumY,
    n,
    from: { ...current },
    to: empty ? { ...current } : { x: sumX / n, y: sumY / n },
    empty,
  };
}

/** Inertia (within-cluster sum of squares) and its breakdown per cluster. */
export function inertia(points: Pt[], centroids: Pt[], assign: (number | null)[]): { total: number; perCluster: number[] } {
  const perCluster = centroids.map(() => 0);
  points.forEach((p, i) => {
    const a = assign[i];
    if (a !== null && a !== undefined && centroids[a]) perCluster[a] += dist2(p, centroids[a]);
  });
  return { total: perCluster.reduce((s, v) => s + v, 0), perCluster };
}

/** Distance from every point to every centroid (the Assignment Table). */
export function distanceTable(points: Pt[], centroids: Pt[]): DistanceCalc[] {
  return points.map((p, i) => distanceCalc(i, p, centroids));
}

/**
 * Voronoi cell of every centroid inside the plane square, by clipping the
 * square with one half-plane per other centroid. Coincident centroids follow
 * the tie rule: the lower-numbered one owns the region.
 */
export function voronoiCells(centroids: Pt[], lo = PLANE_MIN, hi = PLANE_MAX): Pt[][] {
  const square: Pt[] = [
    { x: lo, y: lo },
    { x: hi, y: lo },
    { x: hi, y: hi },
    { x: lo, y: hi },
  ];
  return centroids.map((c, i) => {
    let poly = square;
    for (let j = 0; j < centroids.length && poly.length; j++) {
      if (j === i) continue;
      const o = centroids[j];
      if (samePt(c, o)) {
        if (j < i) poly = [];
        continue;
      }
      // keep points q with (q - m)·(o - c) <= 0, m = midpoint
      const nx = o.x - c.x;
      const ny = o.y - c.y;
      const mx = (c.x + o.x) / 2;
      const my = (c.y + o.y) / 2;
      const side = (q: Pt) => (q.x - mx) * nx + (q.y - my) * ny;
      const out: Pt[] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        const sa = side(a);
        const sb = side(b);
        if (sa <= 0) out.push(a);
        if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
          const t = sa / (sa - sb);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      poly = out;
    }
    return poly;
  });
}
