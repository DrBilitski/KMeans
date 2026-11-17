import { fmtNum } from './format';
import { quantise, rngNext } from './rng';
import { RGBImage } from './sampleImages';

/**
 * K-means on pixel colors (use case 2: image compression).
 *
 * Every pixel is a point in 3-D color space [R, G, B]. Each centroid becomes
 * one palette color, and every pixel is repainted with its centroid's color.
 * Same algorithm and rules as the 2-D engine (ties → lower-numbered color,
 * empty clusters stay put, converged when no pixel changes), but with one
 * microstep per half-iteration: tens of thousands of pixels are too many to
 * step through one by one.
 *
 * `advanceImage(state)` performs exactly one microstep and returns a new state.
 */

export type RGBf = [number, number, number];
export type ImgPhase = 'ready' | 'init' | 'assign' | 'update' | 'check';
export type ImgStatus = 'init' | 'running' | 'converged' | 'maxIter';
export type ImgInit = 'kmeans++' | 'random';

export const IMG_MICROSTEPS: { phase: ImgPhase; label: string }[] = [
  { phase: 'init', label: 'Pick Starting Colors' },
  { phase: 'assign', label: 'Assign Every Pixel' },
  { phase: 'update', label: 'Update Every Color' },
  { phase: 'check', label: 'Check Convergence' },
];

export interface ColorMean {
  color: number;
  n: number;
  sum: RGBf;
  from: RGBf;
  to: RGBf;
  empty: boolean;
}

export interface ImgDraw {
  color: number;
  random: number;
  pixel: number;
  kind: 'uniform' | 'weighted';
  /** Weighted draws: D(p)² of the chosen pixel and the total. */
  d2?: number;
  total?: number;
}

export interface ImgState {
  img: RGBImage;
  k: number;
  init: ImgInit;
  maxIter: number;
  seed: number;
  rng: number;
  centroids: RGBf[];
  /** Palette index of each pixel (-1 = not assigned yet). */
  assign: Int16Array;
  /** Pixels per color after the last assignment. */
  counts: number[];
  iteration: number;
  phase: ImgPhase;
  status: ImgStatus;
  changed: number;
  means: ColorMean[];
  draws: ImgDraw[];
  inertia: number | null;
  history: { iteration: number; half: 'assign' | 'update'; value: number }[];
  explanation: string;
  tick: number;
}

export const IMG_DEFAULT_K = 6;
export const IMG_MAX_K = 32;
export const IMG_DEFAULT_SEED = 2024;

const N = (s: { img: RGBImage }) => s.img.width * s.img.height;
export const hex = (c: RGBf) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const rgbText = (c: RGBf, digits = 0) => `[${c.map((v) => (digits ? v.toFixed(digits) : Math.round(v))).join(', ')}]`;
export const pixelRGB = (img: RGBImage, i: number): RGBf => [img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]];

export function createImgState(img: RGBImage, opts: { k?: number; init?: ImgInit; seed?: number; maxIter?: number } = {}): ImgState {
  const seed = opts.seed ?? IMG_DEFAULT_SEED;
  const s: ImgState = {
    img,
    k: Math.max(1, Math.min(IMG_MAX_K, opts.k ?? IMG_DEFAULT_K)),
    init: opts.init ?? 'kmeans++',
    maxIter: opts.maxIter ?? 50,
    seed,
    rng: seed,
    centroids: [],
    assign: new Int16Array(img.width * img.height).fill(-1),
    counts: [],
    iteration: 0,
    phase: 'ready',
    status: 'init',
    changed: 0,
    means: [],
    draws: [],
    inertia: null,
    history: [],
    explanation: '',
    tick: 0,
  };
  return { ...s, explanation: `${img.width} × ${img.height} = ${(img.width * img.height).toLocaleString()} pixels, each a point [R, G, B] in color space. K-means will find k = ${s.k} colors to repaint the whole image with. Press Next Step to pick the starting colors.` };
}

/** Keep the image and settings; clear the palette and continue the random stream. */
export function restartImg(s: ImgState, changes: Partial<Pick<ImgState, 'k' | 'init' | 'maxIter' | 'seed'>> = {}): ImgState {
  const seedChanged = changes.seed !== undefined && changes.seed !== s.seed;
  const fresh = createImgState(s.img, { k: changes.k ?? s.k, init: changes.init ?? s.init, seed: changes.seed ?? s.seed, maxIter: changes.maxIter ?? s.maxIter });
  return { ...fresh, rng: seedChanged ? fresh.seed : s.rng, tick: s.tick + 1 };
}

export const isImgDone = (s: ImgState) => s.status === 'converged' || s.status === 'maxIter';

/** Distances from one color to every palette color, with the nearest (ties → lowest index). */
export function colorDistances(c: RGBf, centroids: RGBf[]) {
  const rows = centroids.map((m, j) => {
    const d = [c[0] - m[0], c[1] - m[1], c[2] - m[2]];
    const sq = d.map((v) => v * v);
    const d2 = sq[0] + sq[1] + sq[2];
    return { color: j, centroid: m, diff: d, sq, d2, d: Math.sqrt(d2) };
  });
  let winner = 0;
  rows.forEach((r, j) => {
    if (r.d2 < rows[winner].d2) winner = j;
  });
  const tied = rows.filter((r) => r.d2 === rows[winner].d2).map((r) => r.color);
  return { rows, winner, tied };
}

function nearestIndex(data: Uint8ClampedArray, i: number, cents: RGBf[]): [number, number] {
  const r = data[i * 3];
  const g = data[i * 3 + 1];
  const b = data[i * 3 + 2];
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < cents.length; j++) {
    const c = cents[j];
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return [best, bestD];
}

export function imgInertia(img: RGBImage, cents: RGBf[], assign: Int16Array): number {
  let total = 0;
  for (let i = 0; i < assign.length; i++) {
    const a = assign[i];
    if (a < 0) continue;
    const c = cents[a];
    const dr = img.data[i * 3] - c[0];
    const dg = img.data[i * 3 + 1] - c[1];
    const db = img.data[i * 3 + 2] - c[2];
    total += dr * dr + dg * dg + db * db;
  }
  return total;
}

function drawRandom(s: ImgState): [number, number] {
  const [raw, rng] = rngNext(s.rng);
  return [quantise(raw), rng];
}

function doInit(s: ImgState): ImgState {
  const n = N(s);
  const data = s.img.data;
  const cents: RGBf[] = [];
  const draws: ImgDraw[] = [];
  let rng = s.rng;
  const next = () => {
    const [v, r] = drawRandom({ ...s, rng });
    rng = r;
    return v;
  };
  const sameAsChosen = (i: number) => cents.some((c) => c[0] === data[i * 3] && c[1] === data[i * 3 + 1] && c[2] === data[i * 3 + 2]);
  // first color: a uniformly random pixel (both methods)
  let r = next();
  let p = Math.min(n - 1, Math.floor(r * n));
  cents.push(pixelRGB(s.img, p));
  draws.push({ color: 0, random: r, pixel: p, kind: 'uniform' });
  const d2 = new Float64Array(n);
  while (cents.length < s.k) {
    if (s.init === 'random') {
      // Forgy: uniformly random pixels with a color not chosen yet
      let tries = 0;
      do {
        r = next();
        p = Math.min(n - 1, Math.floor(r * n));
      } while (sameAsChosen(p) && ++tries < 200);
      if (sameAsChosen(p)) break;
      cents.push(pixelRGB(s.img, p));
      draws.push({ color: cents.length - 1, random: r, pixel: p, kind: 'uniform' });
      continue;
    }
    // k-means++: probability ∝ D(p)² to the nearest color chosen so far
    let total = 0;
    for (let i = 0; i < n; i++) {
      d2[i] = nearestIndex(data, i, cents)[1];
      total += d2[i];
    }
    if (total === 0) break; // fewer distinct colors than k
    r = next();
    const target = r * total;
    let acc = 0;
    p = n - 1;
    for (let i = 0; i < n; i++) {
      acc += d2[i];
      if (d2[i] > 0 && acc > target) {
        p = i;
        break;
      }
    }
    cents.push(pixelRGB(s.img, p));
    draws.push({ color: cents.length - 1, random: r, pixel: p, kind: 'weighted', d2: d2[p], total });
  }
  const short = cents.length < s.k ? ` The image has only ${cents.length} distinct colors, so only ${cents.length} palette colors can be placed.` : '';
  return {
    ...s,
    rng,
    k: cents.length,
    centroids: cents,
    draws,
    counts: cents.map(() => 0),
    explanation:
      (s.init === 'kmeans++'
        ? `K-means++ picked ${cents.length} starting colors from the image's own pixels: the first uniformly at random, each next one with probability proportional to D(p)², so very different colors are likely. `
        : `Random points (Forgy): ${cents.length} random pixels' colors are the starting palette. `) +
      `See the palette below and the big dots in the color cube.${short}`,
  };
}

function doAssign(s: ImgState): ImgState {
  const n = N(s);
  const assign = new Int16Array(n);
  const counts = s.centroids.map(() => 0);
  let changed = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [j, d] = nearestIndex(s.img.data, i, s.centroids);
    assign[i] = j;
    counts[j]++;
    total += d;
    if (s.assign[i] !== j) changed++;
  }
  const iteration = s.iteration + 1;
  const first = s.iteration === 0;
  return {
    ...s,
    assign,
    counts,
    changed,
    iteration,
    status: 'running',
    means: [],
    inertia: total,
    history: [...s.history, { iteration, half: 'assign', value: total }],
    explanation: first
      ? `Iteration 1: every one of the ${n.toLocaleString()} pixels is repainted with its nearest palette color (straight-line distance in R, G, B). That is the compressed image! Inertia = ${fmtBig(total)}.`
      : `Iteration ${iteration}: every pixel picks its nearest palette color again. ${changed.toLocaleString()} pixel${changed === 1 ? '' : 's'} changed color (${pct(changed, n)}). Inertia = ${fmtBig(total)}.`,
  };
}

function doUpdate(s: ImgState): ImgState {
  const sums = s.centroids.map(() => [0, 0, 0] as RGBf);
  const counts = s.centroids.map(() => 0);
  const d = s.img.data;
  for (let i = 0; i < s.assign.length; i++) {
    const j = s.assign[i];
    sums[j][0] += d[i * 3];
    sums[j][1] += d[i * 3 + 1];
    sums[j][2] += d[i * 3 + 2];
    counts[j]++;
  }
  const means: ColorMean[] = s.centroids.map((c, j) => {
    const n = counts[j];
    const to: RGBf = n ? [sums[j][0] / n, sums[j][1] / n, sums[j][2] / n] : [...c];
    return { color: j, n, sum: sums[j], from: [...c], to, empty: n === 0 };
  });
  const centroids = means.map((m) => m.to);
  const total = imgInertia(s.img, centroids, s.assign);
  const moved = Math.max(...means.map((m) => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])));
  const empty = means.filter((m) => m.empty).length;
  return {
    ...s,
    centroids,
    means,
    inertia: total,
    history: [...s.history, { iteration: s.iteration, half: 'update', value: total }],
    explanation: `Update: each palette color moves to the AVERAGE color of the pixels that use it (see the mean calculation in the Palette panel). The biggest move was ${fmtNum(Math.round(moved * 10) / 10)} color units.${empty ? ` ${empty} color${empty > 1 ? 's have' : ' has'} no pixels and stay${empty > 1 ? '' : 's'} put.` : ''} Inertia = ${fmtBig(total)}.`,
  };
}

function doCheck(s: ImgState): ImgState {
  const converged = s.iteration > 1 && s.changed === 0;
  const cutoff = !converged && s.iteration >= s.maxIter;
  return {
    ...s,
    status: converged ? 'converged' : cutoff ? 'maxIter' : 'running',
    explanation: converged
      ? `End of iteration ${s.iteration}: no pixel changed color, so the palette will never change again. CONVERGED. These ${s.k} colors are the compressed image's palette.`
      : cutoff
        ? `End of iteration ${s.iteration}: stopped at the cap of ${s.maxIter} iterations (${s.changed.toLocaleString()} pixels still changed). This is a cutoff, not convergence, but the image already looks the same.`
        : s.iteration === 1
          ? 'End of iteration 1: every pixel just received its first color, so k-means continues.'
          : `End of iteration ${s.iteration}: ${s.changed.toLocaleString()} pixels changed color (${pct(s.changed, N(s))}), so not converged yet. Another iteration follows.`,
  };
}

export function nextImgPhase(s: ImgState): ImgPhase | null {
  if (isImgDone(s)) return null;
  switch (s.phase) {
    case 'ready':
      return 'init';
    case 'init':
    case 'check':
      return 'assign';
    case 'assign':
      return 'update';
    case 'update':
      return 'check';
  }
}

export function advanceImage(s: ImgState): ImgState {
  const ph = nextImgPhase(s);
  if (!ph) return s;
  const t = { ...s, phase: ph, tick: s.tick + 1 };
  if (ph === 'init') return doInit(t);
  if (ph === 'assign') return doAssign(t);
  if (ph === 'update') return doUpdate(t);
  return doCheck(t);
}

export function imgUntil(s: ImgState, stop: (t: ImgState) => boolean, limit = 1000): ImgState {
  let t = s;
  for (let i = 0; i < limit; i++) {
    const n = advanceImage(t);
    if (n === t) break;
    t = n;
    if (stop(t)) break;
  }
  return t;
}
export const imgNextIteration = (s: ImgState) => imgUntil(s, (t) => t.phase === 'check');
export const imgRunToConvergence = (s: ImgState) => imgUntil(s, isImgDone);

/** Compressed pixels as RGBA for a canvas (palette color of each pixel). */
export function compressedRGBA(s: ImgState): Uint8ClampedArray | null {
  if (s.iteration === 0) return null;
  const n = N(s);
  const out = new Uint8ClampedArray(n * 4);
  const pal = s.centroids.map((c) => c.map((v) => Math.round(v)));
  for (let i = 0; i < n; i++) {
    const c = pal[s.assign[i]];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function originalRGBA(img: RGBImage): Uint8ClampedArray {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = img.data[i * 3];
    out[i * 4 + 1] = img.data[i * 3 + 1];
    out[i * 4 + 2] = img.data[i * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function distinctColors(img: RGBImage): number {
  const seen = new Set<number>();
  for (let i = 0; i < img.width * img.height; i++) seen.add((img.data[i * 3] << 16) | (img.data[i * 3 + 1] << 8) | img.data[i * 3 + 2]);
  return seen.size;
}

/** Storage estimate for an indexed-palette image vs. 24-bit true color. */
export function fileSizes(width: number, height: number, k: number) {
  const pixels = width * height;
  const originalBytes = pixels * 3;
  const bitsPerPixel = Math.max(1, Math.ceil(Math.log2(Math.max(2, k))));
  const paletteBytes = k * 3;
  const indexBytes = Math.ceil((pixels * bitsPerPixel) / 8);
  const compressedBytes = paletteBytes + indexBytes;
  return { pixels, originalBytes, bitsPerPixel, paletteBytes, indexBytes, compressedBytes, ratio: originalBytes / compressedBytes };
}

/** Root-mean-square color error per pixel (in 0–255 color units). */
export const rmse = (s: ImgState) => (s.inertia === null ? null : Math.sqrt(s.inertia / N(s)));

export function fmtBig(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} million`;
  return Math.round(n).toLocaleString();
}
const pct = (a: number, n: number) => `${((100 * a) / n).toFixed(a && (100 * a) / n < 0.1 ? 3 : 1)}%`;

/** A fixed, evenly spread sample of pixel indices for the color-cube plot. */
export function samplePixels(img: RGBImage, count = 2500): number[] {
  const n = img.width * img.height;
  const step = Math.max(1, Math.floor(n / count));
  const out: number[] = [];
  for (let i = Math.floor(step / 2); i < n; i += step) out.push(i);
  return out;
}

/** Run k-means to convergence for several k (the "compare k" gallery). */
export function compareK(img: RGBImage, ks: number[], seed: number) {
  return ks.map((k) => {
    const done = imgRunToConvergence(createImgState(img, { k, seed }));
    return { k, state: done, sizes: fileSizes(img.width, img.height, done.k), rmse: rmse(done) ?? 0 };
  });
}
