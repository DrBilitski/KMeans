import { SVGProps } from 'react';

/**
 * Cluster palette: 8 colours distinct from each other and from the UI's
 * purple (= current item) and yellow (= winning value). Each cluster also has
 * its own marker shape, for colour-blind students.
 */
export const CLUSTERS = [
  { name: 'coral', fill: '#f2645a', dark: '#b42318', soft: '#fde3e1' },
  { name: 'teal', fill: '#14b8a6', dark: '#0f766e', soft: '#d5f5f0' },
  { name: 'blue', fill: '#3b82f6', dark: '#1d4ed8', soft: '#dbe8fe' },
  { name: 'orange', fill: '#f97316', dark: '#c2410c', soft: '#ffe8d6' },
  { name: 'pink', fill: '#ec4899', dark: '#be185d', soft: '#fde0ef' },
  { name: 'green', fill: '#22c55e', dark: '#15803d', soft: '#dcf7e6' },
  { name: 'sky', fill: '#38bdf8', dark: '#0369a1', soft: '#dbf2fd' },
  { name: 'brown', fill: '#9a6a44', dark: '#5c3a1e', soft: '#efe3d8' },
];

export const UNASSIGNED = { fill: '#c4c2d4', dark: '#6b6894', soft: '#f1f0f6' };

export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'triangle-down', 'pentagon', 'hexagon', 'star'] as const;
export type Shape = (typeof SHAPES)[number];

export const clusterColor = (j: number | null | undefined) => (j === null || j === undefined || j < 0 ? UNASSIGNED : CLUSTERS[j % CLUSTERS.length]);
export const clusterShape = (j: number | null | undefined): Shape => (j === null || j === undefined || j < 0 ? 'circle' : SHAPES[j % SHAPES.length]);

function polygon(n: number, r: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** SVG path for a marker of "radius" r centred on (0, 0). Shapes are sized to look equally heavy. */
export function shapePath(shape: Shape, r: number): string {
  switch (shape) {
    case 'square':
      return polygon(4, r * 1.22, Math.PI / 4);
    case 'triangle':
      return polygon(3, r * 1.45, -Math.PI / 2);
    case 'triangle-down':
      return polygon(3, r * 1.45, Math.PI / 2);
    case 'diamond':
      return polygon(4, r * 1.35, 0);
    case 'pentagon':
      return polygon(5, r * 1.2, -Math.PI / 2);
    case 'hexagon':
      return polygon(6, r * 1.15, 0);
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r * 1.5 : r * 0.68;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`);
      }
      return `M${pts.join('L')}Z`;
    }
    default:
      return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  }
}

export function Marker({ cluster, r, ...rest }: { cluster: number | null; r: number } & SVGProps<SVGPathElement>) {
  return <path d={shapePath(clusterShape(cluster), r)} {...rest} />;
}

/** Small inline swatch (shape + colour) for tables and legends. */
export function Swatch({ cluster, size = 14 }: { cluster: number | null; size?: number }) {
  const c = clusterColor(cluster);
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" className="swatch" aria-hidden>
      <Marker cluster={cluster} r={6.5} fill={c.fill} stroke={c.dark} strokeWidth={1.6} />
    </svg>
  );
}

/** "C2" label with its swatch, coloured in the cluster's colour. */
export function CentroidTag({ j }: { j: number }) {
  return (
    <span className="ctag" style={{ color: clusterColor(j).dark }}>
      <Swatch cluster={j} />C{j + 1}
    </span>
  );
}
