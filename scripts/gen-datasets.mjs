// One-off generator for the prepared datasets.
// Run: node scripts/gen-datasets.mjs > src/engine/datasetCoords.ts
// The output is committed as literal coordinates, so the app never regenerates them.

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1783);
const gauss = () => {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const r1 = (n) => Math.round(Math.min(9.8, Math.max(0.2, n)) * 10) / 10;

function collect(gen, count) {
  const out = [];
  const seen = new Set();
  while (out.length < count) {
    const [x, y] = gen(out.length).map(r1);
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([x, y]);
  }
  return out;
}

const blob = (cx, cy, sd, n) => collect(() => [cx + gauss() * sd, cy + gauss() * sd], n);
const blobs = (spec) => {
  const all = [];
  const seen = new Set();
  for (const [cx, cy, sd, n] of spec) {
    for (const p of blob(cx, cy, sd, n + 5)) {
      const key = p.join(',');
      if (seen.has(key) || all.filter((q) => q.c === cx + ',' + cy).length >= n) continue;
      seen.add(key);
      all.push({ p, c: cx + ',' + cy });
    }
  }
  return all.map((a) => a.p);
};

const sets = {
  threeBlobs: blobs([
    [2.5, 7.5, 0.7, 10],
    [7.5, 7.0, 0.7, 10],
    [5.0, 2.5, 0.7, 10],
  ]),
  fourBlobs: blobs([
    [2.5, 7.5, 0.7, 10],
    [7.5, 7.5, 0.7, 10],
    [2.5, 2.5, 0.7, 10],
    [7.5, 2.5, 0.7, 10],
  ]),
  overlapping: blobs([
    [3.6, 6.2, 1.1, 12],
    [6.2, 6.4, 1.1, 12],
    [5.0, 3.8, 1.1, 12],
  ]),
  uneven: blobs([
    [3.6, 4.6, 1.35, 28],
    [8.2, 8.0, 0.4, 7],
  ]),
  moons: (() => {
    const pts = collect((i) => {
      const upper = i % 2 === 0;
      const t = Math.PI * rand();
      const [x0, y0] = upper ? [Math.cos(t), Math.sin(t)] : [1 - Math.cos(t), 0.5 - Math.sin(t)];
      return [3.6 + 2.6 * x0 + gauss() * 0.12, 3.6 + 2.6 * y0 + gauss() * 0.12];
    }, 40);
    return pts;
  })(),
  thin: (() => {
    const rows = [2.5, 5.0, 7.5];
    return collect((i) => [1 + 8 * rand(), rows[i % 3] + gauss() * 0.18], 36);
  })(),
  outlier: [
    ...blobs([
      [2.2, 7.6, 0.6, 10],
      [5.0, 8.0, 0.6, 10],
      [3.0, 4.8, 0.6, 10],
    ]),
    [9.5, 0.6],
  ],
  uniform: collect(() => [0.5 + 9 * rand(), 0.5 + 9 * rand()], 30),
};

const fmt = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
let out = '// GENERATED ONCE by scripts/gen-datasets.mjs (seed 1783). Literal coordinates: do not edit by hand.\n';
out += "export const COORDS: Record<string, [number, number][]> = {\n";
for (const [name, pts] of Object.entries(sets)) {
  out += `  ${name}: [\n`;
  for (let i = 0; i < pts.length; i += 6) {
    out += '    ' + pts.slice(i, i + 6).map(([x, y]) => `[${fmt(x)}, ${fmt(y)}]`).join(', ') + ',\n';
  }
  out += '  ],\n';
}
out += '};\n';
process.stdout.write(out);
for (const [n, p] of Object.entries(sets)) process.stderr.write(`${n}: ${p.length}\n`);
