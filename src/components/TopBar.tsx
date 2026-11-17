import { ReactNode } from 'react';

export function TopBar(props: { subtitle: string; badge: string; guided: boolean; playing: boolean; children: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">🎯</span>
        <div>
          <h1>K-MEANS EXPLORER</h1>
          <div className="subtitle">{props.subtitle}</div>
        </div>
      </div>
      <div className="top-stats">{props.children}</div>
      <div className={`mode-badge ${props.guided ? 'mode-guided' : 'mode-live'}`}>
        {props.badge}
        {props.playing && <span className="playing-dot" />}
      </div>
    </header>
  );
}

export function TopStat({ label, value, accent, wide, mid }: { label: string; value: string | number; accent?: boolean; wide?: boolean; mid?: boolean }) {
  return (
    <div className={`top-stat ${accent ? 'accent' : ''} ${wide ? 'wide' : ''} ${mid ? 'mid' : ''}`} title={`${label}: ${value}`}>
      <div className="ts-label">{label}</div>
      <div className="ts-value">{value}</div>
    </div>
  );
}
