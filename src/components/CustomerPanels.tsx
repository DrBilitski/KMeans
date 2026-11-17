import { fmtNum } from '../engine/format';
import { buildCustomerState, CUSTOMER_RECORDS, segmentProfiles } from '../engine/useCases';
import { KController } from '../useKMeans';
import { CentroidTag } from './clusters';

const money = (n: number) => `$${fmtNum(Math.round(n))}`;
const one = (n: number) => fmtNum(Math.round(n * 10) / 10);

/** Scaled / not-scaled switch, shown in the use-case banner. */
export function ScalingSwitch({ ctl }: { ctl: KController }) {
  const scaled = ctl.state.units?.scaled ?? true;
  return (
    <div className="seg-buttons scaling-switch" role="radiogroup" aria-label="Feature scaling">
      <button role="radio" aria-checked={scaled} className={scaled ? 'on' : ''} onClick={() => ctl.apply((s) => buildCustomerState(true, s))}>
        ⚖️ Scaled features
      </button>
      <button role="radio" aria-checked={!scaled} className={!scaled ? 'on' : ''} onClick={() => ctl.apply((s) => buildCustomerState(false, s))}>
        💵 Not scaled
      </button>
    </div>
  );
}

export function CustomerDataPanel({ ctl }: { ctl: KController }) {
  const scaled = ctl.state.units?.scaled ?? true;
  return (
    <div className="params">
      <p className="uc-p">
        A grocery store describes each customer with three features. This demo shows <b>{CUSTOMER_RECORDS.length} customers</b> (a real store might have 10,000; the algorithm is the same).
      </p>
      <table className="feature-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Range</th>
            <th>Used?</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Average spend per visit</td>
            <td className="mono">$24–$162</td>
            <td>x axis</td>
          </tr>
          <tr>
            <td>Visits per month</td>
            <td className="mono">1–18</td>
            <td>y axis</td>
          </tr>
          <tr>
            <td>% purchases with coupons</td>
            <td className="mono">1–56%</td>
            <td className="muted">shown only</td>
          </tr>
        </tbody>
      </table>
      <p className="teach-note">
        <b>Why scale?</b> Distance adds up raw differences. Without scaling, a $20 gap in spending counts 20 times as much as a gap of 1 visit, so the dollar feature drowns out the visits feature.{' '}
        {scaled ? (
          <>
            Here both are scaled to 0–10: <span className="mono">x = spend ÷ 20</span>, <span className="mono">y = visits ÷ 2</span>.
          </>
        ) : (
          <>
            Right now both use the same raw scale (<span className="mono">÷ 20</span>), so the points squash into a thin strip and k-means splits mostly by spending.
          </>
        )}
      </p>
      <ScalingSwitch ctl={ctl} />
      <p className="param-foot">Coupon % is deliberately left out of the clustering so you can use it afterwards to describe the groups. Inertia is not comparable between scaled and unscaled data (different units).</p>
    </div>
  );
}

export function SegmentProfilesPanel({ ctl }: { ctl: KController }) {
  const s = ctl.state;
  const profiles = segmentProfiles(s);
  if (profiles.length === 0) {
    return <div className="chart-empty">Segment profiles appear once customers have been assigned to clusters. Press Next Phase or Run to Convergence.</div>;
  }
  const ordered = [...profiles].sort((a, b) => a.monthly - b.monthly);
  return (
    <div className="profiles">
      <table className="profile-table">
        <thead>
          <tr>
            <th>Cluster</th>
            <th>Size</th>
            <th>$/visit</th>
            <th>Visits/mo</th>
            <th>Coupons</th>
            <th>We might call them… → action</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => (
            <tr key={p.cluster}>
              <td>
                <CentroidTag j={p.cluster} />
              </td>
              <td className="mono">{p.size}</td>
              <td className="mono">{p.size ? money(p.spend) : '—'}</td>
              <td className="mono">
                {p.size ? one(p.visits) : '—'}
                {p.size > 0 && (
                  <div className={`range ${p.visitsMax - p.visitsMin > 8 ? 'range-wide' : ''}`}>
                    range {one(p.visitsMin)}–{one(p.visitsMax)}
                  </div>
                )}
              </td>
              <td className="mono">{p.size ? `${one(p.coupons)}%` : '—'}</td>
              <td>
                <div className="pname">{p.size ? p.name : 'empty'}</div>
                {p.size > 0 && <div className="paction">→ {p.action}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="teach-note">
        <b>Nobody told the algorithm what a good customer looks like.</b> It only produced cluster numbers{s.status === 'converged' ? '' : ' (still running)'}; the names and actions are ours, chosen after looking at the averages.
        Coupon % was not used for clustering, yet it differs between the groups.
        {s.units && !s.units.scaled && ' Without scaling, look at the visit ranges in brackets: some groups mix rare and frequent shoppers, so the names no longer fit.'}
      </p>
    </div>
  );
}
