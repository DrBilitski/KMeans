import { ReactNode, useEffect, useRef, useState } from 'react';
import { fmtInertia } from '../engine/format';

/** Panel and AnimatedNumber, reused from the Q-Learning Explorer. */

export function Panel(props: { title: string; icon?: string; className?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`panel ${props.className ?? ''}`}>
      <header className="panel-title">
        <span>
          {props.icon && <span className="panel-icon">{props.icon}</span>}
          {props.title}
        </span>
        {props.right}
      </header>
      <div className="panel-body">{props.children}</div>
    </section>
  );
}

/** A number that tweens smoothly to its new value and flashes when it changes. */
export function AnimatedNumber({
  value,
  duration,
  initial,
  format = fmtInertia,
}: {
  value: number;
  duration: number;
  initial?: number;
  format?: (n: number) => string;
}) {
  const start = initial ?? value;
  const [shown, setShown] = useState(start);
  const [flash, setFlash] = useState(0);
  const from = useRef(start);
  const shownRef = useRef(start);

  useEffect(() => {
    if (value === shownRef.current) return;
    from.current = shownRef.current;
    setFlash((f) => f + 1);
    if (duration < 30) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tickFn = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - (1 - k) ** 3;
      const v = from.current + (value - from.current) * e;
      shownRef.current = k >= 1 ? value : v;
      setShown(shownRef.current);
      if (k < 1) raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span key={flash} className={flash ? 'num-flash' : undefined}>
      {format(shown)}
    </span>
  );
}

/** Keep the row at `index` visible inside a scrolling container without scrolling the page. */
export function useScrollRowIntoView(container: React.RefObject<HTMLElement>, selector: string, deps: unknown[]) {
  useEffect(() => {
    const box = container.current;
    if (!box) return;
    const row = box.querySelector<HTMLElement>(selector);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const headerH = (box.querySelector('thead') as HTMLElement | null)?.offsetHeight ?? 0;
    if (top - headerH < box.scrollTop) box.scrollTop = top - headerH - 4;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
