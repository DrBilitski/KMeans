import { useCallback, useEffect, useState } from 'react';
import {
  IMG_DEFAULT_SEED,
  ImgInit,
  ImgState,
  advanceImage,
  compareK,
  createImgState,
  imgNextIteration,
  imgRunToConvergence,
  isImgDone,
  restartImg,
} from './engine/imageKMeans';
import { IMG_H, IMG_W, RGBImage, SAMPLE_IMAGES } from './engine/sampleImages';
import { SPEEDS } from './useKMeans';

export const COMPARE_KS = [2, 6, 10, 20];

/** Read an uploaded image file and shrink it to fit 400 × 300 (keeping its shape). */
export function loadImageFile(file: File): Promise<RGBImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('That file is not an image the browser can open.'));
      im.onload = () => {
        const scale = Math.min(1, IMG_W / im.width, IMG_H / im.height);
        const w = Math.max(1, Math.round(im.width * scale));
        const h = Math.max(1, Math.round(im.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(im, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const data = new Uint8ClampedArray(w * h * 3);
        for (let i = 0; i < w * h; i++) {
          data[i * 3] = rgba[i * 4];
          data[i * 3 + 1] = rgba[i * 4 + 1];
          data[i * 3 + 2] = rgba[i * 4 + 2];
        }
        resolve({ width: w, height: h, data, name: file.name });
      };
      im.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Play / pause / step hook for the image-compression engine (same pattern as useKMeans). */
export function useImageKMeans() {
  const [sampleId, setSampleId] = useState<string>('sunset');
  const [state, setState] = useState<ImgState>(() => createImgState(SAMPLE_IMAGES[0].make()));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [inspected, setInspected] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<number | null>(null);
  const [compare, setCompare] = useState<{ img: RGBImage; seed: number; runs: ReturnType<typeof compareK> } | null>(null);
  const [busy, setBusy] = useState(false);
  const delay = SPEEDS[speed].ms;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setState((s) => advanceImage(s)), Math.max(delay, 150));
    return () => window.clearInterval(id);
  }, [playing, delay]);
  useEffect(() => {
    if (playing && isImgDone(state)) setPlaying(false);
  }, [playing, state]);
  useEffect(() => setInspected(null), [state.img]);

  const pausedDo = useCallback((fn: (s: ImgState) => ImgState) => {
    setPlaying(false);
    setState(fn);
  }, []);

  const setImage = (img: RGBImage, id: string) => {
    setSampleId(id);
    setSelectedColor(null);
    pausedDo((s) => createImgState(img, { k: s.k, init: s.init, seed: s.seed, maxIter: s.maxIter }));
  };

  return {
    state,
    playing,
    speed,
    delay,
    setSpeed,
    sampleId,
    inspected,
    setInspected,
    selectedColor,
    setSelectedColor,
    busy,
    compare: compare && compare.img === state.img && compare.seed === state.seed ? compare : null,
    play: () => !isImgDone(state) && setPlaying(true),
    pause: () => setPlaying(false),
    nextStep: () => pausedDo(advanceImage),
    nextPhase: () => pausedDo(advanceImage),
    nextIteration: () => pausedDo(imgNextIteration),
    runToConvergence: () => pausedDo(imgRunToConvergence),
    restart: () => pausedDo((s) => restartImg(s)),
    reset: () => {
      setSampleId('sunset');
      setSelectedColor(null);
      pausedDo(() => createImgState(SAMPLE_IMAGES[0].make()));
    },
    setK: (k: number) => pausedDo((s) => restartImg(s, { k })),
    setInit: (init: ImgInit) => pausedDo((s) => restartImg(s, { init })),
    setSeed: (seed: number) => pausedDo((s) => restartImg(s, { seed })),
    newSeed: () => pausedDo((s) => restartImg(s, { seed: Math.floor(Math.random() * 100000) })),
    resetSeed: () => pausedDo((s) => restartImg(s, { seed: IMG_DEFAULT_SEED })),
    loadSample: (id: string) => {
      const sample = SAMPLE_IMAGES.find((x) => x.id === id) ?? SAMPLE_IMAGES[0];
      setImage(sample.make(), sample.id);
    },
    upload: async (file: File) => {
      try {
        setImage(await loadImageFile(file), 'upload');
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    runCompare: () => {
      setPlaying(false);
      setBusy(true);
      // let the "computing" state paint before the (blocking) runs
      window.setTimeout(() => {
        setCompare({ img: state.img, seed: state.seed, runs: compareK(state.img, COMPARE_KS, state.seed) });
        setBusy(false);
      }, 30);
    },
  };
}

export type ImgController = ReturnType<typeof useImageKMeans>;
