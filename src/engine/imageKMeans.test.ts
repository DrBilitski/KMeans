import { describe, expect, it } from 'vitest';
import {
  advanceImage,
  colorDistances,
  compressedRGBA,
  createImgState,
  distinctColors,
  fileSizes,
  imgNextIteration,
  imgRunToConvergence,
  restartImg,
} from './imageKMeans';
import { posterImage, rainbowImage, sunsetImage } from './sampleImages';

describe('image compression use case', () => {
  it('file sizes match the slides: 400 × 300 → 120,000 pixels → 360,000 bytes', () => {
    const f = fileSizes(400, 300, 6);
    expect(f.pixels).toBe(120000);
    expect(f.originalBytes).toBe(360000);
    expect(f.bitsPerPixel).toBe(3); // 6 colors need 3 bits
    expect(f.compressedBytes).toBe(18 + 45000);
    expect(fileSizes(400, 300, 2).bitsPerPixel).toBe(1);
    expect(fileSizes(400, 300, 20).bitsPerPixel).toBe(5);
  });

  it('the flat poster has exactly 5 colors and k = 5 compresses it with zero error', () => {
    const img = posterImage();
    expect(distinctColors(img)).toBe(5);
    const done = imgRunToConvergence(createImgState(img, { k: 5 }));
    expect(done.status).toBe('converged');
    expect(done.inertia).toBe(0);
  });

  it('asking for more colors than the image has places only the distinct ones', () => {
    const done = advanceImage(createImgState(posterImage(), { k: 8 }));
    expect(done.k).toBe(5);
  });

  it('inertia never increases across half-iterations', () => {
    for (const make of [sunsetImage, rainbowImage]) {
      for (const k of [2, 6, 10]) {
        const done = imgRunToConvergence(createImgState(make(), { k, maxIter: 15 }));
        const h = done.history.map((x) => x.value);
        for (let i = 1; i < h.length; i++) expect(h[i]).toBeLessThanOrEqual(h[i - 1] * (1 + 1e-12));
      }
    }
  });

  it('steps are exactly: init, assign, update, check, assign, …', () => {
    let s = createImgState(sunsetImage(), { k: 4 });
    const phases: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = advanceImage(s);
      phases.push(s.phase);
    }
    expect(phases).toEqual(['init', 'assign', 'update', 'check', 'assign', 'update']);
    expect(compressedRGBA(s)).not.toBeNull();
  });

  it('each palette color is the mean of its pixels', () => {
    const s = advanceImage(advanceImage(advanceImage(createImgState(sunsetImage(), { k: 3 }))));
    for (const m of s.means) {
      if (m.empty) continue;
      expect(m.to[0]).toBeCloseTo(m.sum[0] / m.n, 9);
      expect(s.centroids[m.color]).toEqual(m.to);
    }
    expect(s.means.reduce((a, m) => a + m.n, 0)).toBe(120000);
  });

  it('is deterministic for a seed, and restart continues the random stream', () => {
    const a = imgNextIteration(createImgState(sunsetImage(), { k: 6, seed: 7 }));
    const b = imgNextIteration(createImgState(sunsetImage(), { k: 6, seed: 7 }));
    expect(a.centroids).toEqual(b.centroids);
    const r = advanceImage(restartImg(a));
    expect(r.draws[0].random).not.toBe(a.draws[0].random);
  });

  it('distances to palette colors pick the nearest, ties to the lower number', () => {
    const d = colorDistances([100, 100, 100], [
      [110, 100, 100],
      [90, 100, 100],
      [0, 0, 0],
    ]);
    expect(d.winner).toBe(0);
    expect(d.tied).toEqual([0, 1]);
    expect(d.rows[0].d).toBe(10);
  });

  it('runs fast enough for the classroom (k = 20 on 120,000 pixels)', () => {
    const t0 = performance.now();
    imgRunToConvergence(createImgState(sunsetImage(), { k: 20, maxIter: 30 }));
    expect(performance.now() - t0).toBeLessThan(8000);
  });
});
