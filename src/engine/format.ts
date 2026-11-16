/**
 * Number formatting shared by the engine's explanations and the UI.
 * Adapted from the Q-Learning Explorer. Coordinates never show more than two
 * decimals; inertia always shows three.
 */

const clean = (n: number, digits: number): number => {
  const r = Number(n.toFixed(digits));
  return Object.is(r, -0) ? 0 : r;
};

/** Compact number: up to 3 decimals, trailing zeros dropped (4.4, 2.2, 0.1). */
export function fmtNum(n: number): string {
  return String(clean(n, 3));
}

/** Fixed 2 decimals (centroid coordinates, distances, squares). */
export function fmt2(n: number): string {
  return clean(n, 2).toFixed(2);
}

/** Fixed 1 decimal (data-point coordinates and their sums). */
export function fmt1(n: number): string {
  return clean(n, 1).toFixed(1);
}

/** A data-point coordinate: one decimal, or two if the point needs it. */
export function fmtCoord(n: number): string {
  return Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? fmt1(n) : fmt2(n);
}

/** Inertia: always three decimals, e.g. 8.525. */
export function fmtInertia(n: number): string {
  return clean(n, 3).toFixed(3);
}

/** Probability / random number with 3 or 4 decimals. */
export function fmtProb(n: number, digits = 3): string {
  return clean(n, digits).toFixed(digits);
}

export const fmtPoint = (p: { x: number; y: number }) => `(${fmtCoord(p.x)}, ${fmtCoord(p.y)})`;
export const fmtCentroid = (p: { x: number; y: number }) => `(${fmt2(p.x)}, ${fmt2(p.y)})`;
export const cName = (j: number) => `C${j + 1}`;
