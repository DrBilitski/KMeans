// One-off generator for the customer-segmentation use case.
// Run: node scripts/gen-customers.mjs   (prints literal records to paste into src/engine/useCases.ts)
// Spend is a multiple of $2 and visits are whole numbers, so scaled coordinates
// (spend ÷ 20, visits ÷ 2) have at most one decimal.

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
const rand = mulberry32(783);
const between = (lo, hi) => lo + (hi - lo) * rand();
const even = (v) => Math.round(v / 2) * 2;

// [spend lo, hi], [visits lo, hi], [coupon % lo, hi], count
const segments = [
  [[20, 76], [1, 4], [30, 60], 15], // occasional: few visits, low-to-moderate spend, coupon-driven
  [[30, 84], [8, 13], [10, 30], 15], // regular: frequent, moderate spend
  [[100, 164], [11, 18], [0, 12], 15], // high value: frequent, heavy spend
];
const seen = new Set();
const out = [];
for (const [[s0, s1], [v0, v1], [c0, c1], n] of segments) {
  let made = 0;
  while (made < n) {
    const spend = even(between(s0, s1));
    const visits = Math.round(between(v0, v1));
    const coupons = Math.round(between(c0, c1));
    const key = `${spend},${visits}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([spend, visits, coupons]);
    made++;
  }
}
// shuffle so segments aren't listed in order (the algorithm doesn't know them)
for (let i = out.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [out[i], out[j]] = [out[j], out[i]];
}
let s = '';
for (let i = 0; i < out.length; i += 5) s += '  ' + out.slice(i, i + 5).map((r) => `[${r.join(', ')}]`).join(', ') + ',\n';
process.stdout.write(s);
