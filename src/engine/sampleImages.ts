import { rngNext } from './rng';

/**
 * Built-in images for the image-compression use case, drawn by code so the
 * app needs no image files. They are deterministic (seeded noise).
 *
 * - sunset: many colors and smooth gradients (compresses with visible banding)
 * - poster: exactly 5 flat colors (compresses perfectly with k = 5)
 * - rainbow: a smooth hue sweep (the hardest case for few colors)
 */

export interface RGBImage {
  width: number;
  height: number;
  /** RGB bytes, row by row: [r, g, b, r, g, b, …] (no alpha). */
  data: Uint8ClampedArray;
  name: string;
}

export const IMG_W = 400;
export const IMG_H = 300;

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clampT = (t: number) => Math.max(0, Math.min(1, t));

function make(name: string, pixel: (x: number, y: number, noise: () => number) => RGB, seed = 1783): RGBImage {
  const data = new Uint8ClampedArray(IMG_W * IMG_H * 3);
  let rng = seed;
  const noise = () => {
    const [v, n] = rngNext(rng);
    rng = n;
    return v - 0.5;
  };
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      const c = pixel(x, y, noise);
      const i = (y * IMG_W + x) * 3;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
  }
  return { width: IMG_W, height: IMG_H, data, name };
}

function ridge(x: number, base: number, amp: number, f1: number, f2: number, phase: number): number {
  return base + amp * (Math.sin(x * f1 + phase) * 0.6 + Math.sin(x * f2 + phase * 2.3) * 0.4);
}

export function sunsetImage(): RGBImage {
  const skyTop: RGB = [58, 36, 110];
  const skyMid: RGB = [214, 92, 96];
  const skyLow: RGB = [252, 186, 92];
  const sun: RGB = [255, 236, 170];
  return make('Mountain sunset', (x, y, noise) => {
    const grain = noise() * 14;
    const far = ridge(x, 168, 16, 0.021, 0.057, 1.2);
    const mid = ridge(x, 196, 20, 0.016, 0.043, 3.1);
    const near = ridge(x, 228, 14, 0.012, 0.071, 5.0);
    const lake = 250;
    let c: RGB;
    if (y >= lake) {
      // lake: darker reflection of the sky with ripples
      const ry = lake - (y - lake) * 2.2;
      const t = clampT(ry / lake);
      const sky = t < 0.6 ? mix(skyTop, skyMid, t / 0.6) : mix(skyMid, skyLow, (t - 0.6) / 0.4);
      const ripple = Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) * 10;
      c = mix(sky, [20, 30, 60], 0.45);
      c = [c[0] + ripple, c[1] + ripple, c[2] + ripple * 1.4];
    } else if (y >= near) c = mix([36, 70, 52], [16, 40, 30], clampT((y - near) / 40));
    else if (y >= mid) c = mix([70, 66, 110], [44, 50, 86], clampT((y - mid) / 50));
    else if (y >= far) c = mix([128, 88, 136], [96, 70, 120], clampT((y - far) / 60));
    else {
      const t = clampT(y / far);
      c = t < 0.6 ? mix(skyTop, skyMid, t / 0.6) : mix(skyMid, skyLow, (t - 0.6) / 0.4);
      const d = Math.hypot(x - 290, y - 140);
      if (d < 26) c = sun;
      else if (d < 70) c = mix(sun, c, clampT((d - 26) / 44) ** 0.7);
    }
    return [c[0] + grain, c[1] + grain, c[2] + grain];
  });
}

export function posterImage(): RGBImage {
  const sky: RGB = [125, 200, 235];
  const sun: RGB = [250, 205, 60];
  const hill: RGB = [70, 160, 85];
  const house: RGB = [205, 70, 60];
  const dark: RGB = [55, 45, 70];
  return make('Flat poster (5 colors)', (x, y) => {
    if (Math.hypot(x - 320, y - 70) < 38) return sun;
    const hillTop = 210 - 45 * Math.sin((x / IMG_W) * Math.PI);
    if (x > 120 && x < 220 && y > 140 && y < 230) {
      if (x > 155 && x < 185 && y > 185) return dark; // door
      return house;
    }
    if (y > 100 && y <= 140 && Math.abs(x - 170) < (y - 100) * 1.4) return dark; // roof
    return y > hillTop ? hill : sky;
  });
}

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function rainbowImage(): RGBImage {
  return make('Rainbow gradient', (x, y) => hsl((x / IMG_W) * 360, 0.85, 0.25 + 0.5 * (1 - y / IMG_H)));
}

export const SAMPLE_IMAGES = [
  { id: 'sunset', label: '🌄 Mountain sunset', make: sunsetImage, note: 'Many colors and smooth gradients, like a photo.' },
  { id: 'poster', label: '🏠 Flat poster', make: posterImage, note: 'Only 5 flat colors: k = 5 compresses it with zero error.' },
  { id: 'rainbow', label: '🌈 Rainbow gradient', make: rainbowImage, note: 'Every hue and brightness: the hardest case.' },
] as const;
