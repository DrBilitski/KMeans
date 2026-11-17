import { describe, expect, it } from 'vitest';
import { setParams, solve } from './kmeans';
import { freshRun } from './restarts';
import { CUSTOMER_RECORDS, buildCustomerState, segmentProfiles } from './useCases';

/** The segment each customer was generated in (the algorithm never sees this). */
const truth = CUSTOMER_RECORDS.map(([spend, visits]) => (visits <= 4 ? 'occasional' : spend >= 100 ? 'high' : 'regular'));
const purity = (assign: (number | null)[], k: number) =>
  Array.from({ length: k }, (_, j) => new Set(truth.filter((_, i) => assign[i] === j)).size);

describe('customer segmentation use case', () => {
  it('stores coordinates with at most two decimals and coupons as an unused extra', () => {
    for (const scaled of [true, false]) {
      const s = buildCustomerState(scaled);
      expect(s.points).toHaveLength(45);
      for (const p of s.points) {
        expect(Math.round(p.x * 100) / 100).toBe(p.x);
        expect(Math.round(p.y * 100) / 100).toBe(p.y);
        expect(p.extra?.coupons).toBeTypeOf('number');
      }
    }
  });

  it('scaled features recover the three segments on every seed', () => {
    const base = buildCustomerState(true);
    for (let seed = 2024; seed < 2034; seed++) {
      const d = solve(freshRun(base, { seed }));
      expect(purity(d.assign, 3)).toEqual([1, 1, 1]);
    }
  });

  it('without scaling, k-means mixes occasional and regular shoppers', () => {
    const d = solve(buildCustomerState(false));
    expect(Math.max(...purity(d.assign, 3))).toBeGreaterThan(1);
  });

  it('profiles name the groups by value and average the coupon feature', () => {
    const p = segmentProfiles(solve(buildCustomerState(true)));
    const byName = Object.fromEntries(p.map((x) => [x.name, x]));
    expect(byName['Occasional shoppers'].visits).toBeLessThan(4);
    expect(byName['High-value shoppers'].spend).toBeGreaterThan(100);
    expect(byName['Occasional shoppers'].coupons).toBeGreaterThan(byName['High-value shoppers'].coupons);
    expect(p.reduce((a, x) => a + x.size, 0)).toBe(45);
  });

  it('switching scaling keeps k, method and seed', () => {
    const s = setParams(buildCustomerState(true), { k: 4, init: 'random' });
    const t = buildCustomerState(false, s);
    expect(t.params).toMatchObject({ k: 4, init: 'random' });
    expect(t.seed).toBe(s.seed);
    expect(t.units?.scaled).toBe(false);
    expect(t.centroids).toHaveLength(0);
  });
});
