import { COORDS } from './datasetCoords';
import { DataPoint } from './geometry';

/**
 * The prepared datasets. Coordinates are literal lists (generated once with a
 * fixed seed by scripts/gen-datasets.mjs), so every run on every computer
 * shows exactly the same data.
 */

export type LabelStyle = 'letters' | 'numbers';

export interface Dataset {
  id: string;
  name: string;
  purpose: string;
  /** Suggested k when the dataset is chosen from the picker. */
  k: number;
  labelStyle: LabelStyle;
  coords: [number, number][];
}

export const TINY_COORDS: [number, number][] = [
  [1, 1],
  [1.5, 2],
  [3, 4],
  [5, 7],
  [3.5, 5],
  [4.5, 5],
  [3.5, 4.5],
];

export const DATASETS: Dataset[] = [
  { id: 'tiny', name: 'Tiny Worked Example', purpose: 'Every calculation can be checked by hand.', k: 2, labelStyle: 'letters', coords: TINY_COORDS },
  { id: 'threeBlobs', name: 'Three Clear Blobs', purpose: 'K-means works well.', k: 3, labelStyle: 'numbers', coords: COORDS.threeBlobs },
  { id: 'fourBlobs', name: 'Four Blobs', purpose: 'Choosing k; the elbow method.', k: 4, labelStyle: 'numbers', coords: COORDS.fourBlobs },
  { id: 'overlapping', name: 'Overlapping Blobs', purpose: 'Boundaries are ambiguous.', k: 3, labelStyle: 'numbers', coords: COORDS.overlapping },
  { id: 'uneven', name: 'Uneven Sizes', purpose: 'A big cluster and a small one; k-means may split the big one.', k: 2, labelStyle: 'numbers', coords: COORDS.uneven },
  { id: 'moons', name: 'Two Moons', purpose: 'Non-round shapes where k-means fails.', k: 2, labelStyle: 'numbers', coords: COORDS.moons },
  { id: 'thin', name: 'Long Thin Clusters', purpose: 'Elongated clusters; k-means prefers round ones.', k: 3, labelStyle: 'numbers', coords: COORDS.thin },
  { id: 'outlier', name: 'Blobs + Outlier', purpose: 'One far-away point drags a centroid.', k: 3, labelStyle: 'numbers', coords: COORDS.outlier },
  { id: 'uniform', name: 'Uniform Random', purpose: 'No real clusters exist, yet k-means still finds k groups.', k: 3, labelStyle: 'numbers', coords: COORDS.uniform },
];

export const DEFAULT_DATASET = 'threeBlobs';

export const getDataset = (id: string): Dataset => DATASETS.find((d) => d.id === id) ?? DATASETS[1];

/** Label for the n-th point (0-based) in a labelling style. */
export function makeLabel(style: LabelStyle, n: number): string {
  if (style === 'letters') {
    let s = '';
    let k = n;
    do {
      s = String.fromCharCode(65 + (k % 26)) + s;
      k = Math.floor(k / 26) - 1;
    } while (k >= 0);
    return s;
  }
  return `P${n + 1}`;
}

export function datasetPoints(d: Dataset): DataPoint[] {
  return d.coords.map(([x, y], i) => ({ x, y, label: makeLabel(d.labelStyle, i) }));
}
