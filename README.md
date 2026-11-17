# K-Means Explorer

An interactive classroom visualizer for **k-means clustering** (Lloyd's algorithm, Euclidean distance, 2-D data).
It is the companion to the Q-Learning Explorer and uses the same look, controls and keyboard shortcuts.
Built with React + TypeScript + Vite. It runs entirely in the browser with no backend.

## Run it

```bash
npm install
npm run dev        # open the printed localhost URL
npm test           # engine tests (Section 8 worked example, k-means++ draw, convergence, scenarios)
npm run build      # produces ONE self-contained file: dist/index.html
```

The build inlines all JavaScript and CSS into `dist/index.html`. That single file
needs no server: double-click it, share it, or upload it to any static host
(GitHub Pages, Netlify, Azure Static Web Apps, university web space). The only
external request is the Google Font; offline it falls back to a system font.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml` (base `/KMeans/`).

## Modes

Switch modes in the top bar. Each mode keeps its own clustering state.

- **🎯 Explorer**: prepared datasets, live editing and guided scenarios A–I.
- **🛒 Customers** (use case 1): customer segmentation. 45 grocery customers clustered on spend per visit and
  visits per month. Coupon % is shown but not used, and the Segment Profiles panel names the groups afterwards.
  The **Scaled / Not scaled** switch shows why features must be scaled: without scaling, dollars drown out visits.
- **🖼️ Images** (use case 2): image compression by limiting colors. Placeholder for now.

## Teaching controls

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>→</kbd> or <kbd>N</kbd> | Next microstep |
| <kbd>P</kbd> | Next phase (finish the assignment or update step) |
| <kbd>I</kbd> | Next iteration |
| <kbd>C</kbd> | Run to convergence |
| <kbd>Esc</kbd> | Stop inspecting a point |

On the plot: click an empty spot to add a point, shift-click or right-click a point to remove it,
and click a point (or a table row) to inspect its distances without changing the algorithm.
With **Manual** initialization, clicks place the centroids instead.

## Code map

- `src/engine/` — pure TypeScript, no React
  - `kmeans.ts` — the microstep state machine (`advance`, `advancePhase`, `advanceIteration`, `runToConvergence`, `restart`, `reset`)
  - `geometry.ts` — distances, means, inertia, Voronoi territories
  - `init.ts` — random points (Forgy), k-means++ and manual initialization, with every random draw recorded
  - `datasets.ts` / `datasetCoords.ts` — prepared datasets as literal coordinates (generated once by `scripts/gen-datasets.mjs`)
  - `elbow.ts`, `restarts.ts` — batch runs through the same state machine
  - `scenarios.ts` — guided scenarios A–I
  - `useCases.ts` — customer-segmentation data (generated once by `scripts/gen-customers.mjs`), scaling and segment profiles
  - `rng.ts`, `format.ts` — seeded RNG and number formatting (from the Q-Learning Explorer)
- `src/useKMeans.ts` — play / pause / speed hook
- `src/components/` — plot, assignment table, initialization, calculation, explanation, inertia, elbow and restart panels
