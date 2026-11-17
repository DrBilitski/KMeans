import { CSSProperties, useMemo, useState } from 'react';
import { fmtInertia } from './engine/format';
import { distanceCalc } from './engine/geometry';
import { HALF_OF, MICROSTEPS, isDone, waitingReason } from './engine/kmeans';
import { SCENARIOS } from './engine/scenarios';
import { AssignmentTable } from './components/AssignmentTable';
import { CALC_TITLES, CalcPanel, calcMode } from './components/CalcPanel';
import { CentroidTag, Swatch } from './components/clusters';
import { Controls } from './components/Controls';
import { ExplanationPanel } from './components/ExplanationPanel';
import { ElbowPanel, InertiaPanel, RestartsPanel } from './components/InertiaPanels';
import { InitPanel } from './components/InitPanel';
import { DataPanel, ParamsPanel, ScenariosPanel } from './components/InstructorPanels';
import { PlotDefs, PlotToggles, ScatterPlot } from './components/ScatterPlot';
import { CustomerDataPanel, ScalingSwitch, SegmentProfilesPanel } from './components/CustomerPanels';
import { ImageView } from './components/ImageCompression';
import { useImageKMeans } from './useImageKMeans';
import { Mode, ModeSelector, TopBar, TopStat } from './components/TopBar';
import { Panel } from './components/ui';
import { buildCustomerState } from './engine/useCases';
import { KController, useKMeans } from './useKMeans';

const PHASE_NAMES = { init: 'Initialize', assign: 'Assignment', update: 'Update', check: 'Check' };

/**
 * Each mode keeps its own clustering state at all times (as the Q-Learning
 * Explorer keeps both learning modes), so switching never loses a run.
 */
export default function App() {
  const explorer = useKMeans();
  const customers = useKMeans(() => buildCustomerState(true));
  const images = useImageKMeans();
  const [mode, setMode] = useState<Mode>('explorer');
  const switchTo = (m: Mode) => {
    explorer.pause();
    customers.pause();
    images.pause();
    setMode(m);
  };
  const selector = <ModeSelector value={mode} onChange={switchTo} />;
  if (mode === 'images') return <ImageView ctl={images} modeSelector={selector} />;
  return mode === 'explorer' ? <Dashboard key="explorer" ctl={explorer} mode={mode} modeSelector={selector} /> : <Dashboard key="customers" ctl={customers} mode={mode} modeSelector={selector} />;
}

function Dashboard({ ctl, mode, modeSelector }: { ctl: KController; mode: Mode; modeSelector: React.ReactNode }) {
  const s = ctl.state;
  const useCase = mode === 'customers';
  const [toggles, setToggles] = useState<PlotToggles>({ territory: true, lines: false, trails: true, labels: true });

  const stepMs = ctl.playing ? ctl.delay : 900;
  const moveMs = Math.max(40, Math.min(750, stepMs * 0.65));
  const animMs = Math.max(0, Math.min(900, stepMs * 0.7));

  const inspectCalc = useMemo(
    () => (ctl.inspected !== null && s.points[ctl.inspected] && s.centroids.length > 0 ? distanceCalc(ctl.inspected, s.points[ctl.inspected], s.centroids) : null),
    [ctl.inspected, s.points, s.centroids],
  );
  const toggleInspect = (i: number) => ctl.setInspected(ctl.inspected === i ? null : i);

  const placing = s.status === 'init' && s.params.init === 'manual' && s.centroids.length < s.params.k && s.manualQueue.length === 0;
  const onEmptyClick = (p: { x: number; y: number }) => {
    if (placing && s.points.length > 0) ctl.placeCentroid(p);
    else if (!useCase) ctl.addPoint(p);
  };

  const micro = MICROSTEPS.find((m) => m.phases.includes(s.phase));
  const stage = isDone(s)
    ? s.status === 'converged'
      ? 'Converged ✓'
      : 'Stopped at cap'
    : waitingReason(s)
      ? 'Waiting'
      : s.phase === 'ready'
        ? 'Ready'
        : s.phase === 'assignAll'
          ? 'Assign all points'
          : s.phase === 'updateAll'
            ? 'Update all centroids'
            : `${micro?.label ?? ''}${s.phase === 'selectPoint' || s.phase === 'measure' || s.phase === 'choose' ? ` · ${s.points[s.cursor]?.label}` : ''}${
                s.phase === 'gather' || s.phase === 'computeMean' || s.phase === 'move' ? ` · C${s.cursor + 1}` : ''
              }`;
  const changed = s.status === 'init' ? '—' : s.iteration === 1 && s.changes.every((c) => c.from === null) ? 'all' : s.changes.filter((c) => c.from !== null).length;
  const calc = calcMode(s, inspectCalc);
  const scenarioDef = s.scenario ? SCENARIOS.find((x) => x.id === s.scenario!.id) : null;
  const sizes = s.centroids.map((_, j) => s.assign.filter((a) => a === j).length);

  return (
    <div className="app" style={{ '--move-ms': `${moveMs}ms`, '--anim-ms': `${animMs}ms` } as CSSProperties}>
      <PlotDefs />
      <TopBar
        subtitle={useCase ? 'Use case 1: customer segmentation' : 'Lloyd’s algorithm, one step at a time'}
        badge={useCase ? 'USE CASE 1' : s.scenario ? `GUIDED SCENARIO ${s.scenario.letter}` : 'LIVE CLUSTERING'}
        guided={useCase || !!s.scenario}
        playing={ctl.playing}
        modeSelector={modeSelector}
      >
        <TopStat label="Iteration" value={`${s.iteration}/${s.params.maxIter}`} />
        <TopStat label="Phase" value={isDone(s) ? 'Done' : PHASE_NAMES[HALF_OF[s.phase]]} mid />
        <TopStat label="k" value={s.params.k} />
        <TopStat label="Inertia" value={s.inertia === null ? '—' : fmtInertia(s.inertia)} accent mid />
        <TopStat label="Changed" value={changed} />
        <TopStat label="Stage" value={stage} wide />
      </TopBar>

      {useCase && (
        <div className="scenario-banner uc-banner">
          <b>🛒 Customer Segmentation</b>
          <span>
            Each point is one grocery customer: <b>spend per visit</b> (x) and <b>visits per month</b> (y). Coupon % is shown but not used. K-means must find {s.params.k} groups with no labels; we name
            them afterwards (see Segment Profiles below).
          </span>
          <ScalingSwitch ctl={ctl} />
        </div>
      )}

      {s.scenario && (
        <div className="scenario-banner">
          <b>
            Scenario {s.scenario.letter}: {s.scenario.title}
          </b>
          <span>{s.scenario.description}</span>
          {scenarioDef?.actions?.map((a) => (
            <button key={a.label} className="btn btn-small sb-action" onClick={() => ctl.scenarioAction(a)}>
              {a.label}
            </button>
          ))}
          <button className="btn btn-soft btn-small sb-exit" onClick={ctl.exitScenario}>
            Exit scenario
          </button>
        </div>
      )}

      <main className="dashboard">
        <Panel
          className="area-plot"
          title="Scatter Plot"
          icon="📍"
          right={
            <span className="toggles">
              {(
                [
                  ['territory', 'territories'],
                  ['lines', 'assignment lines'],
                  ['trails', 'trails'],
                  ['labels', 'labels'],
                ] as const
              ).map(([key, text]) => (
                <label key={key}>
                  <input type="checkbox" checked={toggles[key]} onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })} /> {text}
                </label>
              ))}
            </span>
          }
        >
          <ScatterPlot
            state={s}
            inspected={ctl.inspected}
            inspectCalc={inspectCalc}
            toggles={toggles}
            onPointClick={(i) => (placing ? ctl.placeCentroid(s.points[i]) : toggleInspect(i))}
            onPointRemove={useCase ? () => undefined : ctl.removePoint}
            onEmptyClick={onEmptyClick}
          />
          <div className="plot-legend">
            {s.centroids.length === 0 ? (
              <span>
                <Swatch cluster={null} /> {s.points.length} unassigned points
              </span>
            ) : (
              s.centroids.map((_, j) => (
                <span key={j}>
                  <CentroidTag j={j} /> <span className="muted">{sizes[j]} pts</span>
                </span>
              ))
            )}
            <span className="lg-ring lg-purple">current</span>
            <span className="lg-ring lg-yellow">winner</span>
          </div>
        </Panel>

        <Panel className="area-table" title="Assignment Table" icon="📋">
          <AssignmentTable state={s} inspected={ctl.inspected} onRowClick={toggleInspect} />
        </Panel>

        <Panel className="area-init" title="Initialization / Random Draw" icon="🎲">
          <InitPanel state={s} />
        </Panel>

        <Panel className="area-calc" title={CALC_TITLES[calc]} icon="🧮">
          <CalcPanel state={s} inspect={inspectCalc} />
        </Panel>

        <Panel className="area-explain" title="What is happening?" icon="💬">
          <ExplanationPanel state={s} />
        </Panel>
      </main>

      <Controls ctl={ctl} blocked={isDone(s) || !!waitingReason(s)} />

      <section className={`instructor ${useCase ? 'instructor-uc' : ''}`}>
        {useCase ? (
          <>
            <Panel className="area-data" title="Customer Data & Scaling" icon="🛒">
              <CustomerDataPanel ctl={ctl} />
            </Panel>
            <Panel className="area-params" title="Parameters" icon="🎛️">
              <ParamsPanel ctl={ctl} />
            </Panel>
            <Panel className="area-profiles" title="Segment Profiles" icon="🏷️">
              <SegmentProfilesPanel ctl={ctl} />
            </Panel>
          </>
        ) : (
          <>
            <Panel className="area-data" title="Data" icon="🗂️">
              <DataPanel ctl={ctl} />
            </Panel>
            <Panel className="area-params" title="Parameters" icon="🎛️">
              <ParamsPanel ctl={ctl} />
            </Panel>
            <Panel className="area-scenarios" title="Guided Demonstrations" icon="🎓">
              <ScenariosPanel ctl={ctl} />
            </Panel>
          </>
        )}
        <Panel className="area-inertia" title="Inertia" icon="📉">
          <InertiaPanel state={s} animMs={animMs} />
        </Panel>
        <Panel className="area-elbow" title="Choosing k: The Elbow Method" icon="📐">
          <ElbowPanel ctl={ctl} />
        </Panel>
        <Panel className="area-restarts" title="Multiple Restarts" icon="🔁">
          <RestartsPanel ctl={ctl} />
        </Panel>
      </section>

      <footer className="footer">
        K-Means Explorer · standard k-means (Lloyd’s algorithm) with Euclidean distance · companion to the Q-Learning Explorer. Everything runs in your browser.
      </footer>
    </div>
  );
}
