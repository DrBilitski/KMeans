import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { fmtNum } from '../engine/format';
import {
  IMG_MAX_K,
  IMG_MICROSTEPS,
  ImgState,
  RGBf,
  colorDistances,
  compressedRGBA,
  distinctColors,
  fileSizes,
  fmtBig,
  hex,
  isImgDone,
  originalRGBA,
  pixelRGB,
  rgbText,
  rmse,
  samplePixels,
} from '../engine/imageKMeans';
import { SAMPLE_IMAGES } from '../engine/sampleImages';
import { COMPARE_KS, ImgController } from '../useImageKMeans';
import { Controls } from './Controls';
import { LineChart } from './LineChart';
import { TopBar, TopStat } from './TopBar';
import { Panel } from './ui';

const kb = (bytes: number) => `${fmtNum(Math.round(bytes / 100) / 10)} KB`;
const textOn = (c: RGBf) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 150 ? '#1e1b4b' : '#ffffff');

/** Draws an RGBA buffer; clicking reports the pixel index. */
function ImageCanvas({ rgba, width, height, marker, onPick, empty }: { rgba: Uint8ClampedArray | null; width: number; height: number; marker: number | null; onPick?: (i: number) => void; empty?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !rgba) return;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);
  const mx = marker !== null ? marker % width : 0;
  const my = marker !== null ? Math.floor(marker / width) : 0;
  return (
    <div className="img-frame" style={{ aspectRatio: `${width} / ${height}` } as CSSProperties}>
      {rgba ? (
        <canvas
          ref={ref}
          width={width}
          height={height}
          className="img-canvas"
          onClick={(e) => {
            if (!onPick) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.min(width - 1, Math.floor(((e.clientX - r.left) / r.width) * width));
            const y = Math.min(height - 1, Math.floor(((e.clientY - r.top) / r.height) * height));
            onPick(y * width + x);
          }}
        />
      ) : (
        <div className="img-empty">{empty}</div>
      )}
      {marker !== null && rgba && <div className="img-marker" style={{ left: `${((mx + 0.5) / width) * 100}%`, top: `${((my + 0.5) / height) * 100}%` }} />}
    </div>
  );
}

/** Rotatable 3-D scatter of a sample of pixels in R, G, B space, with the palette colors as big dots. */
function ColorCube({ s, inspected, selected }: { s: ImgState; inspected: number | null; selected: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rot, setRot] = useState({ yaw: -0.75, pitch: 0.42 });
  const [byPalette, setByPalette] = useState(false);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const sample = useMemo(() => samplePixels(s.img, 2600), [s.img]);
  const W = 520;
  const H = 390;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cy = Math.cos(rot.yaw);
    const sy = Math.sin(rot.yaw);
    const cp = Math.cos(rot.pitch);
    const sp = Math.sin(rot.pitch);
    const scale = 0.92;
    // x = red, y = green (depth), z = blue (up)
    const proj = (r: number, g: number, b: number) => {
      const x = r - 127.5;
      const y = g - 127.5;
      const z = b - 127.5;
      const x1 = x * cy - y * sy;
      const y1 = x * sy + y * cy;
      const z2 = z * cp - y1 * sp;
      const depth = y1 * cp + z * sp;
      return { X: W / 2 + x1 * scale, Y: H / 2 - 4 - z2 * scale, depth };
    };
    // cube edges
    const corners = [0, 255];
    ctx.strokeStyle = '#ddd6fe';
    ctx.lineWidth = 1;
    for (const a of corners)
      for (const b of corners) {
        const lines: [number[], number[]][] = [
          [[0, a, b], [255, a, b]],
          [[a, 0, b], [a, 255, b]],
          [[a, b, 0], [a, b, 255]],
        ];
        for (const [p, q] of lines) {
          const P = proj(p[0], p[1], p[2]);
          const Q = proj(q[0], q[1], q[2]);
          ctx.beginPath();
          ctx.moveTo(P.X, P.Y);
          ctx.lineTo(Q.X, Q.Y);
          ctx.stroke();
        }
      }
    // axes from black
    const axes: [number[], string, string][] = [
      [[255, 0, 0], '#dc2626', 'Red'],
      [[0, 255, 0], '#16a34a', 'Green'],
      [[0, 0, 255], '#2563eb', 'Blue'],
    ];
    const o = proj(0, 0, 0);
    ctx.lineWidth = 3;
    ctx.font = '800 14px Nunito, sans-serif';
    for (const [p, col, name] of axes) {
      const P = proj(p[0], p[1], p[2]);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(o.X, o.Y);
      ctx.lineTo(P.X, P.Y);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText(`${name} 255`, P.X + 4, P.Y - 4);
    }
    ctx.fillStyle = '#6b6894';
    ctx.fillText('0', o.X - 12, o.Y + 14);
    // points, back to front
    const assigned = s.iteration > 0;
    const pts = sample.map((i) => {
      const c = pixelRGB(s.img, i);
      const p = proj(c[0], c[1], c[2]);
      const shown = byPalette && assigned ? s.centroids[s.assign[i]] : c;
      return { ...p, fill: hex(shown as RGBf), dim: selected !== null && assigned && s.assign[i] !== selected };
    });
    pts.sort((a, b) => a.depth - b.depth);
    for (const p of pts) {
      ctx.globalAlpha = p.dim ? 0.08 : 0.85;
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.arc(p.X, p.Y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // movement arrows during the update step
    if (s.phase === 'update') {
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const m of s.means) {
        const A = proj(...m.from);
        const B = proj(...m.to);
        ctx.beginPath();
        ctx.moveTo(A.X, A.Y);
        ctx.lineTo(B.X, B.Y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // inspected pixel
    if (inspected !== null) {
      const c = pixelRGB(s.img, inspected);
      const P = proj(c[0], c[1], c[2]);
      if (assigned) {
        const Q = proj(...s.centroids[s.assign[inspected]]);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(P.X, P.Y);
        ctx.lineTo(Q.X, Q.Y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(P.X, P.Y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // palette colors (centroids)
    s.centroids
      .map((c, j) => ({ j, c, p: proj(c[0], c[1], c[2]) }))
      .sort((a, b) => a.p.depth - b.p.depth)
      .forEach(({ j, c, p }) => {
        ctx.fillStyle = hex(c);
        ctx.strokeStyle = j === selected ? '#7c3aed' : '#1e1b4b';
        ctx.lineWidth = j === selected ? 4.5 : 2.5;
        ctx.beginPath();
        ctx.arc(p.X, p.Y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = textOn(c);
        ctx.font = '900 11px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(j + 1), p.X, p.Y + 4);
        ctx.textAlign = 'start';
      });
  }, [s, rot, sample, byPalette, inspected, selected]);

  return (
    <div className="cube-wrap">
      <canvas
        ref={ref}
        className="cube"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, ...rot };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setRot({ yaw: d.yaw - (e.clientX - d.x) * 0.01, pitch: Math.max(-1.4, Math.min(1.4, d.pitch + (e.clientY - d.y) * 0.01)) });
        }}
        onPointerUp={() => (drag.current = null)}
      />
      <div className="cube-foot">
        <span>Drag to rotate · {sample.length.toLocaleString()} sample pixels · big dots = palette colors (centroids)</span>
        <label>
          <input type="checkbox" checked={byPalette} onChange={(e) => setByPalette(e.target.checked)} /> color dots by their palette color
        </label>
      </div>
    </div>
  );
}

function Palette({ ctl }: { ctl: ImgController }) {
  const s = ctl.state;
  const n = s.img.width * s.img.height;
  if (s.centroids.length === 0) return <div className="chart-empty">The palette appears after the first step: k starting colors picked from the image’s own pixels.</div>;
  return (
    <div className="palette">
      {s.centroids.map((c, j) => (
        <button
          key={j}
          className={`pswatch ${ctl.selectedColor === j ? 'on' : ''} ${s.iteration > 0 && s.counts[j] === 0 ? 'empty' : ''}`}
          style={{ background: hex(c), color: textOn(c) }}
          onClick={() => ctl.setSelectedColor(ctl.selectedColor === j ? null : j)}
          title={`Color ${j + 1}: ${rgbText(c, 1)}`}
        >
          <b>{j + 1}</b>
          <span className="mono">{hex(c)}</span>
          {s.iteration > 0 && <span className="mono pct">{((100 * s.counts[j]) / n).toFixed(1)}%</span>}
        </button>
      ))}
    </div>
  );
}

function Calculation({ ctl }: { ctl: ImgController }) {
  const s = ctl.state;
  const sel = ctl.selectedColor;
  if (ctl.inspected !== null && s.centroids.length > 0) {
    const px = pixelRGB(s.img, ctl.inspected);
    const dc = colorDistances(px, s.centroids);
    const x = ctl.inspected % s.img.width;
    const y = Math.floor(ctl.inspected / s.img.width);
    const rows = [...dc.rows].sort((a, b) => a.d2 - b.d2).slice(0, 6);
    return (
      <div className="calc-panel">
        <div className="calc-head">
          Pixel at ({x}, {y}) = <span className="mono">{rgbText(px)}</span> <span className="inline-swatch" style={{ background: hex(px) }} />
          <span className="muted small"> (inspecting only; the {Math.min(6, rows.length)} nearest palette colors)</span>
        </div>
        {rows.map((r) => (
          <div key={r.color} className={`drow ${r.color === dc.winner ? 'drow-win' : ''}`}>
            <span className="drow-label">
              to <span className="inline-swatch" style={{ background: hex(r.centroid) }} /> color {r.color + 1} <span className="mono">{rgbText(r.centroid)}</span>:
            </span>
            <span className="mono drow-math">
              √(({px[0]}−{Math.round(r.centroid[0])})² + ({px[1]}−{Math.round(r.centroid[1])})² + ({px[2]}−{Math.round(r.centroid[2])})²) = <b className="dval">{r.d.toFixed(1)}</b>
            </span>
          </div>
        ))}
        <div className="calc-verdict">
          Nearest: color {dc.winner + 1}, so this pixel is repainted <span className="inline-swatch" style={{ background: hex(s.centroids[dc.winner]) }} /> <span className="mono">{hex(s.centroids[dc.winner])}</span>
          {dc.tied.length > 1 && ' (tie: the lower-numbered color wins)'}
        </div>
      </div>
    );
  }
  const m = sel !== null ? s.means[sel] : s.means.length ? [...s.means].sort((a, b) => b.n - a.n)[0] : null;
  if (m && s.phase !== 'assign') {
    return (
      <div className="calc-panel">
        <div className="calc-head">
          Color {m.color + 1} {sel === null && <span className="muted small">(the most-used color; click a swatch to choose another)</span>}: the average of its{' '}
          <b>{m.n.toLocaleString()}</b> pixels
        </div>
        {m.empty ? (
          <div className="calc-verdict tie">No pixels use this color, so it has no mean and stays where it is.</div>
        ) : (
          (['R', 'G', 'B'] as const).map((ch, c) => (
            <div key={ch} className="mrow mono">
              new {ch} = ({ch} values summed) / {m.n.toLocaleString()} = {Math.round(m.sum[c]).toLocaleString()} / {m.n.toLocaleString()} = <b className="dval">{(m.sum[c] / m.n).toFixed(1)}</b>
            </div>
          ))
        )}
        <div className="calc-verdict moved">
          <span className="inline-swatch" style={{ background: hex(m.from) }} /> {rgbText(m.from, 1)} → <span className="inline-swatch" style={{ background: hex(m.to) }} /> <b className="mono">{rgbText(m.to, 1)}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="calc-panel">
      <div className="formula">
        d(pixel, color) = √((R<sub>p</sub> − R<sub>c</sub>)² + (G<sub>p</sub> − G<sub>c</sub>)² + (B<sub>p</sub> − B<sub>c</sub>)²)
      </div>
      <div className="calc-wait-line">
        Same distance as in the Explorer, with a third dimension. {s.iteration > 0 ? 'Click any pixel in either image to see its distances to the palette colors.' : 'Press Next Step to begin.'}
      </div>
      {s.phase === 'assign' && <div className="calc-verdict">{s.changed.toLocaleString()} pixels changed color in this assignment step.</div>}
    </div>
  );
}

function Explanation({ s }: { s: ImgState }) {
  const cur = IMG_MICROSTEPS.findIndex((m) => m.phase === s.phase);
  return (
    <div className="explain">
      <ol className="stepper img-stepper">
        {IMG_MICROSTEPS.map((m, i) => (
          <li key={m.phase} className={`step-${i === cur ? 'now' : i < cur || (s.iteration > 0 && i === 0) ? 'done' : 'todo'}`}>
            <span className="step-num">{i + 1}</span>
            <span className="step-label">{m.label}</span>
          </li>
        ))}
      </ol>
      <div className="explain-text" key={s.tick}>
        {s.explanation}
      </div>
    </div>
  );
}

function SourcePanel({ ctl }: { ctl: ImgController }) {
  const s = ctl.state;
  const [error, setError] = useState<string | null>(null);
  const [seedText, setSeedText] = useState(String(s.seed));
  useEffect(() => setSeedText(String(s.seed)), [s.seed]);
  const note = SAMPLE_IMAGES.find((x) => x.id === ctl.sampleId)?.note;
  return (
    <div className="params">
      <div className="sample-buttons">
        {SAMPLE_IMAGES.map((x) => (
          <button key={x.id} className={`btn btn-small ${ctl.sampleId === x.id ? 'btn-step' : 'btn-soft'}`} onClick={() => ctl.loadSample(x.id)}>
            {x.label}
          </button>
        ))}
        <label className={`btn btn-small ${ctl.sampleId === 'upload' ? 'btn-step' : 'btn-soft'} upload-btn`}>
          📁 Upload your image
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setError(await ctl.upload(f));
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="param-foot">
        {ctl.sampleId === 'upload' ? `${s.img.name}, shrunk to ${s.img.width} × ${s.img.height} if larger. It never leaves your computer.` : note}
        {error && <b className="err"> {error}</b>}
      </p>
      <div className="param">
        <div className="param-head">
          <span className="param-label">
            Number of colors <i>k</i>
          </span>
          <b className="param-value mono">{s.k}</b>
        </div>
        <input type="range" min={1} max={IMG_MAX_K} value={s.k} onChange={(e) => ctl.setK(Number(e.target.value))} />
        <div className="btn-row">
          {COMPARE_KS.map((k) => (
            <button key={k} className={`btn btn-small ${s.k === k ? 'btn-step' : 'btn-soft'}`} onClick={() => ctl.setK(k)}>
              {k} colors
            </button>
          ))}
        </div>
        <div className="param-explain">K = the reduced number of colors. Changing it restarts the clustering.</div>
      </div>
      <div className="param">
        <div className="param-head">
          <span className="param-label">Starting colors</span>
        </div>
        <div className="seg-buttons">
          <button className={s.init === 'kmeans++' ? 'on' : ''} onClick={() => ctl.setInit('kmeans++')}>
            K-means++
          </button>
          <button className={s.init === 'random' ? 'on' : ''} onClick={() => ctl.setInit('random')}>
            Random pixels
          </button>
        </div>
      </div>
      <div className="param">
        <div className="param-head">
          <span className="param-label">Seed</span>
        </div>
        <div className="seed-row">
          <input
            type="number"
            className="seed-input mono"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            onBlur={() => {
              const n = parseInt(seedText, 10);
              if (!Number.isNaN(n) && n !== s.seed) ctl.setSeed(n);
              else setSeedText(String(s.seed));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="btn btn-soft btn-small" onClick={ctl.newSeed}>
            new seed
          </button>
        </div>
      </div>
    </div>
  );
}

function SizePanel({ s }: { s: ImgState }) {
  const f = fileSizes(s.img.width, s.img.height, s.k);
  const distinct = useMemo(() => distinctColors(s.img), [s.img]);
  return (
    <div className="sizes">
      <div className="size-row">
        <span>Pixels</span>
        <b className="mono">
          {s.img.width} × {s.img.height} = {f.pixels.toLocaleString()}
        </b>
      </div>
      <div className="size-row">
        <span>Distinct colors in the original</span>
        <b className="mono">{distinct.toLocaleString()}</b>
      </div>
      <div className="size-box orig">
        <div className="sb-title">Original: 24-bit true color</div>
        <div className="mono">
          {f.pixels.toLocaleString()} pixels × 3 bytes = <b>{kb(f.originalBytes)}</b>
        </div>
        <div className="muted small">16,777,216 possible colors per pixel</div>
      </div>
      <div className="size-box comp">
        <div className="sb-title">Compressed: {s.k}-color palette</div>
        <div className="mono">
          palette {s.k} × 3 bytes = {f.paletteBytes} B
        </div>
        <div className="mono">
          + {f.pixels.toLocaleString()} pixels × {f.bitsPerPixel} bit{f.bitsPerPixel > 1 ? 's' : ''} = {kb(f.indexBytes)}
        </div>
        <div className="mono">
          = <b>{kb(f.compressedBytes)}</b> ({fmtNum(Math.round(f.ratio * 10) / 10)}× smaller)
        </div>
        <div className="muted small">
          {s.k} colors need {f.bitsPerPixel} bit{f.bitsPerPixel > 1 ? 's' : ''} per pixel (2<sup>{f.bitsPerPixel}</sup> = {2 ** f.bitsPerPixel} ≥ {s.k}). Dimensions stay the same.
        </div>
      </div>
      <p className="param-foot">An idealized indexed-color file (like GIF/PNG-8, before any further compression), not a JPEG.</p>
    </div>
  );
}

function CompareGallery({ ctl }: { ctl: ImgController }) {
  const s = ctl.state;
  const c = ctl.compare;
  return (
    <div className="restarts">
      <div className="panel-actions">
        <button className="btn btn-soft btn-small" onClick={ctl.runCompare} disabled={ctl.busy}>
          {ctl.busy ? '⏳ Computing…' : `🖼️ Compress with ${COMPARE_KS.join(', ')} colors`}
        </button>
        <span className="muted small">Each runs k-means++ to convergence (seed {s.seed}), as in the assignment.</span>
      </div>
      {c ? (
        <div className="compare">
          <figure>
            <ImageCanvas rgba={originalRGBA(s.img)} width={s.img.width} height={s.img.height} marker={null} />
            <figcaption>
              Original <span className="mono">{kb(fileSizes(s.img.width, s.img.height, 2).originalBytes)}</span>
            </figcaption>
          </figure>
          {c.runs.map((r) => (
            <figure key={r.k}>
              <ImageCanvas rgba={compressedRGBA(r.state)} width={s.img.width} height={s.img.height} marker={null} />
              <figcaption>
                <b>{r.state.k} colors</b> <span className="mono">{kb(r.sizes.compressedBytes)}</span> · error {r.rmse.toFixed(1)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="chart-empty">See the same image with 2, 6, 10 and 20 colors side by side, with file sizes and color error.</div>
      )}
    </div>
  );
}

function Discussion() {
  const [open, setOpen] = useState(false);
  return (
    <div className="params">
      <p className="uc-p">
        <b>Assignment question:</b> What kind of images compress well with little distortion? Try all three built-in images and your own photo with 2, 6 and 10 colors.
      </p>
      <button className="btn btn-soft btn-small" onClick={() => setOpen(!open)}>
        {open ? 'Hide hint' : 'Show a hint'}
      </button>
      {open && (
        <p className="teach-note">
          Images whose pixels already fall into a few tight color clusters (logos, cartoons, posters, diagrams) lose almost nothing: each cluster’s mean is nearly every pixel’s true color. Photos with smooth
          gradients (sky, skin, shadows) spread their colors continuously, so any small palette causes visible banding. Look at the color cube: tight blobs compress well; a smear does not.
        </p>
      )}
    </div>
  );
}

export function ImageView({ ctl, modeSelector }: { ctl: ImgController; modeSelector: ReactNode }) {
  const s = ctl.state;
  const original = useMemo(() => originalRGBA(s.img), [s.img]);
  const compressed = useMemo(() => compressedRGBA(s), [s.assign, s.centroids]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = rmse(s);
  const done = isImgDone(s);
  const stage = done ? (s.status === 'converged' ? 'Converged ✓' : 'Stopped at cap') : s.phase === 'ready' ? 'Ready' : IMG_MICROSTEPS.find((m) => m.phase === s.phase)?.label ?? '';
  const pick = (i: number) => ctl.setInspected(ctl.inspected === i ? null : i);

  return (
    <div className="app">
      <TopBar subtitle="Use case 2: image compression by color reduction" badge="USE CASE 2" guided playing={ctl.playing} modeSelector={modeSelector}>
        <TopStat label="Iteration" value={`${s.iteration}/${s.maxIter}`} />
        <TopStat label="Colors k" value={s.k} />
        <TopStat label="Color error" value={err === null ? '—' : err.toFixed(2)} accent mid />
        <TopStat label="Pixels changed" value={s.iteration === 0 ? '—' : s.iteration === 1 ? 'all' : s.changed.toLocaleString()} mid />
        <TopStat label="Stage" value={stage} wide />
      </TopBar>

      <div className="scenario-banner uc-banner">
        <b>🖼️ Image Compression</b>
        <span>
          Each pixel is a point [R, G, B]. K-means groups similar colors; the <b>centroid of each cluster is the compressed color</b>, and every pixel in the cluster is repainted with it. Same
          dimensions, far fewer colors, smaller file.
        </span>
      </div>

      <main className="dashboard img-dash">
        <Panel className="area-plot" title="Original Image" icon="🖼️" right={<span className="legend-mini">click a pixel to inspect</span>}>
          <ImageCanvas rgba={original} width={s.img.width} height={s.img.height} marker={ctl.inspected} onPick={pick} />
        </Panel>
        <Panel className="area-table" title={`Compressed: ${s.k} Colors`} icon="🎨">
          <div>
            <ImageCanvas
              rgba={compressed}
              width={s.img.width}
              height={s.img.height}
              marker={ctl.inspected}
              onPick={pick}
              empty={<>The compressed image appears after the first assignment step.</>}
            />
          </div>
        </Panel>
        <Panel className="area-init" title="Color Space (R, G, B)" icon="🧊">
          <div>
            <ColorCube s={s} inspected={ctl.inspected} selected={ctl.selectedColor} />
          </div>
        </Panel>
        <Panel className="area-calc" title="Palette & Calculation" icon="🧮">
          <div className="pal-calc">
            <Palette ctl={ctl} />
            <Calculation ctl={ctl} />
          </div>
        </Panel>
        <Panel className="area-explain" title="What is happening?" icon="💬">
          <Explanation s={s} />
        </Panel>
      </main>

      <Controls ctl={ctl} blocked={done} hidePhase />

      <section className="instructor instructor-img">
        <Panel className="area-data" title="Image & Colors" icon="🎛️">
          <SourcePanel ctl={ctl} />
        </Panel>
        <Panel className="area-params" title="File Size" icon="💾">
          <SizePanel s={s} />
        </Panel>
        <Panel className="area-inertia" title="Inertia" icon="📉">
          <div className="inertia">
            <div className="inertia-top">
              <div className="inertia-big mono">{s.inertia === null ? '—' : fmtBig(s.inertia)}</div>
              <div className="inertia-formula">Σ (color distance from each pixel to its palette color)². Color error = √(inertia ÷ pixels).</div>
            </div>
            <LineChart
              series={[{ values: s.history.map((h) => h.value), className: 'ln-inertia' }]}
              xTicks={s.history.map((h) => `${h.iteration}${h.half === 'assign' ? 'a' : 'u'}`)}
              xLabel="after each half-iteration"
              emptyText="Inertia appears after the first assignment step."
              dots
              yMin={0}
              format={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : Math.round(v).toString())}
              height={170}
            />
          </div>
        </Panel>
        <Panel className="area-scenarios" title="Think About It" icon="🤔">
          <Discussion />
        </Panel>
        <Panel className="area-compare" title="Compare k: 2, 6, 10, 20 Colors" icon="🔍">
          <CompareGallery ctl={ctl} />
        </Panel>
      </section>

      <footer className="footer">Pixels are clustered in your browser; uploaded images never leave your computer.</footer>
    </div>
  );
}
