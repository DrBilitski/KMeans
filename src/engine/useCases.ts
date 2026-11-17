import { fmtNum } from './format';
import { DataPoint, Pt } from './geometry';
import { AxisUnits, KState, UnitsView, createInitialState, restart, setParams, setPoints } from './kmeans';

/**
 * Real-world use cases built on the same engine.
 *
 * Use case 1, customer segmentation: a grocery store's customers described by
 * average spend per visit, visits per month and % of purchases made with
 * coupons. K-means clusters on the first two (plotted); coupon % is shown but
 * not used, so it can describe the groups afterwards.
 */

/** [spend per visit ($), visits per month, coupon %]. Generated once by scripts/gen-customers.mjs. */
export const CUSTOMER_RECORDS: [number, number, number][] = [
  [54, 12, 29], [54, 3, 55], [142, 12, 6], [142, 14, 4], [60, 3, 44],
  [50, 12, 13], [68, 10, 22], [132, 16, 3], [82, 9, 19], [126, 18, 1],
  [128, 12, 6], [40, 11, 15], [158, 18, 12], [46, 2, 48], [46, 1, 42],
  [26, 2, 38], [128, 15, 12], [132, 17, 7], [32, 8, 30], [76, 9, 16],
  [24, 1, 32], [72, 12, 22], [42, 12, 28], [34, 13, 28], [104, 17, 5],
  [136, 14, 8], [50, 2, 56], [60, 11, 18], [74, 2, 32], [38, 3, 32],
  [144, 16, 6], [30, 3, 32], [132, 12, 8], [68, 3, 53], [78, 13, 23],
  [34, 3, 53], [38, 1, 49], [162, 15, 12], [56, 9, 27], [100, 17, 6],
  [66, 3, 40], [74, 4, 54], [160, 16, 2], [32, 10, 16], [62, 12, 27],
];

const SPEND: AxisUnits = { name: 'Average spend per visit', prefix: '$', suffix: '', perUnit: 20 };

/**
 * Scaled: spend ÷ 20 and visits ÷ 2, so both features span 0–10.
 * Not scaled: both features measured on the same raw scale (÷ 20), as if
 * $1 and 1 visit counted equally, which is what plain k-means does with raw data.
 */
export function customerUnits(scaled: boolean): UnitsView {
  return {
    id: 'customers',
    scaled,
    x: SPEND,
    y: { name: 'Visits per month', prefix: '', suffix: ' visits', perUnit: scaled ? 2 : 20 },
  };
}

/** Plane coordinate → real value. */
export const toReal = (axis: AxisUnits, v: number) => v * axis.perUnit;
export const fmtReal = (axis: AxisUnits, v: number) => `${axis.prefix}${fmtNum(Math.round(v * 10) / 10)}${axis.suffix}`;
export const realPoint = (u: UnitsView, p: Pt) => ({ x: toReal(u.x, p.x), y: toReal(u.y, p.y) });

export function customerPoints(scaled: boolean): DataPoint[] {
  const u = customerUnits(scaled);
  return CUSTOMER_RECORDS.map(([spend, visits, coupons], i) => ({
    x: Math.round((spend / u.x.perUnit) * 100) / 100,
    y: Math.round((visits / u.y.perUnit) * 100) / 100,
    label: `P${i + 1}`,
    extra: { coupons },
  }));
}

export const CUSTOMER_SEED = 2024;

/** The customer-segmentation state, keeping k / method / seed from `prev` when switching scaling. */
export function buildCustomerState(scaled: boolean, prev?: KState): KState {
  let s = prev ?? setParams(createInitialState(CUSTOMER_SEED), { k: 3, init: 'kmeans++' });
  s = setPoints({ ...s, rng: s.seed }, customerPoints(scaled), { datasetId: null, labelStyle: 'numbers', nextLabel: CUSTOMER_RECORDS.length });
  s = { ...s, units: customerUnits(scaled), scenario: null };
  return restart(
    s,
    scaled
      ? `${CUSTOMER_RECORDS.length} customers. Each is one point: spend per visit (x) and visits per month (y), both scaled to 0–10. Coupon % is shown but not used. Nobody tells k-means what a good customer looks like: press Next Step to let it find ${s.params.k} groups.`
      : `Same ${CUSTOMER_RECORDS.length} customers, NOT scaled: spend in dollars (up to $162) and visits in visits (at most 18) count equally. A $10 difference outweighs a 10-visit difference, so visits barely matter. Watch what k-means finds now.`,
  );
}

export interface SegmentProfile {
  cluster: number;
  size: number;
  spend: number;
  visits: number;
  coupons: number;
  /** spend × visits: the average customer's monthly spending. */
  monthly: number;
  visitsMin: number;
  visitsMax: number;
  name: string;
  action: string;
}

const NAMES_3 = [
  { name: 'Occasional shoppers', action: 'Offer coupons to encourage visits' },
  { name: 'Regular shoppers', action: 'Promote loyalty rewards' },
  { name: 'High-value shoppers', action: 'Offer VIP benefits' },
];

/**
 * Average real-world features of each cluster, ranked by monthly spending.
 * Names are suggestions a person might give after looking at the numbers; the
 * algorithm itself only produced cluster numbers.
 */
export function segmentProfiles(s: KState): SegmentProfile[] {
  if (!s.units || s.centroids.length === 0 || s.status === 'init') return [];
  const u = s.units;
  const profiles = s.centroids.map((_, j) => {
    const members = s.points.filter((_, i) => s.assign[i] === j);
    const n = members.length;
    const avg = (f: (p: DataPoint) => number) => (n ? members.reduce((a, p) => a + f(p), 0) / n : 0);
    const spend = avg((p) => toReal(u.x, p.x));
    const visits = avg((p) => toReal(u.y, p.y));
    return { cluster: j, size: n, spend, visits, coupons: avg((p) => p.extra?.coupons ?? 0), monthly: avg((p) => toReal(u.x, p.x) * toReal(u.y, p.y)),
      visitsMin: n ? Math.min(...members.map((p) => toReal(u.y, p.y))) : 0,
      visitsMax: n ? Math.max(...members.map((p) => toReal(u.y, p.y))) : 0,
      name: '',
      action: '',
    };
  });
  const ranked = profiles
    .filter((p) => p.size > 0)
    .sort((a, b) => a.monthly - b.monthly);
  ranked.forEach((p, r) => {
    if (ranked.length === 3) Object.assign(p, NAMES_3[r]);
    else {
      p.name = r === 0 ? 'Lowest-value group' : r === ranked.length - 1 ? 'Highest-value group' : `Group ${r + 1} by value`;
      p.action = 'Look at the averages and decide';
    }
  });
  return profiles;
}
