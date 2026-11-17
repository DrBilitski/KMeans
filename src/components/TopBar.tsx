import { ReactNode } from 'react';

export type Mode = 'explorer' | 'customers' | 'images';

export function ModeSelector({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const modes: [Mode, string, string][] = [
    ['explorer', '🎯 Explorer', 'The k-means explorer with prepared datasets and guided scenarios'],
    ['customers', '🛒 Customers', 'Use case 1: customer segmentation'],
    ['images', '🖼️ Images', 'Use case 2: image compression by limiting colors (coming soon)'],
  ];
  return (
    <div className="algo" role="radiogroup" aria-label="Mode">
      <span className="algo-label">Mode</span>
      <div className="algo-buttons">
        {modes.map(([m, label, title]) => (
          <button key={m} role="radio" aria-checked={value === m} className={value === m ? 'on' : ''} onClick={() => onChange(m)} title={title}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TopBar(props: { subtitle: string; badge: string; guided: boolean; playing: boolean; modeSelector?: ReactNode; children: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">🎯</span>
        <div>
          <h1>K-MEANS EXPLORER</h1>
          <div className="subtitle">{props.subtitle}</div>
        </div>
      </div>
      {props.modeSelector}
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
