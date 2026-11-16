# Project Specification: Interactive K-Means Clustering Visualizer

## 1. Project Overview

Build a colorful, highly graphical, interactive application that teaches how k-means clustering works.

The primary audience is university students learning unsupervised learning for the first time.

**The main goal is to visualize the algorithm, not simply execute it.**

Students should be able to watch centroids being placed, see every distance that decides a point's cluster, see each centroid computed as the mean of its points, and watch the total error fall until the algorithm converges.

The instructor must be able to pause the algorithm, advance through individual steps, change the data and parameters, and explain what is happening.

The application should feel like an interactive educational animation rather than a programming demonstration.

### Companion Application

This is the second app in a series. The first is the **Q-Learning Explorer** in `../QLearning`.

**This app must look, feel, and behave like the Q-Learning Explorer**, so students instantly recognize the controls, colors, and panels. Before writing any code, read the Q-Learning project's source (see Section 15) and reuse its design system, components, and build setup.

### Important Scope Restriction

Implement standard k-means (Lloyd's algorithm) with Euclidean distance on 2-D data.

Do not implement other clustering algorithms in this version (see Section 16).

---

## 2. Technology

Use the same stack as the Q-Learning Explorer:

- React 18 + TypeScript
- Vite
- SVG for the scatter plot and charts
- Vitest for engine tests
- Client-side execution only. No backend, no external data, no network calls except the Google Font.

### Deployment (required, same as the Q-Learning Explorer)

The production build must be a **single self-contained `dist/index.html`** with all JavaScript and CSS inlined, using `vite-plugin-singlefile` and `base: './'`.

That one file must:

- Run by double-clicking it (opened from `file://`), with no server
- Run from any static host (GitHub Pages, Netlify, Azure Static Web Apps, university web space)
- Ship no source maps

Also add a GitHub Pages workflow at `.github/workflows/deploy.yml`, copied from `../QLearning/.github/workflows/deploy.yml`, with the base changed to `/KMeans/`.

Verify the deployment by opening the built `dist/index.html` from disk in a browser and exercising the app.

---

## 3. Data Environment

### The Plane

Points live in a 2-D plane with coordinates from 0 to 10 on both axes.

Show the axes with gridlines and labeled ticks at every whole number, so students can read coordinates directly off the plot.

Display coordinates with **at most two decimal places** everywhere. Prepared datasets should use coordinates with one decimal place (or halves) so hand calculations stay readable.

### Prepared Datasets

Provide a dataset picker with at least these:

| Dataset | Points | Purpose |
|---|---:|---|
| **Tiny Worked Example** | 7 | Every calculation can be checked by hand (see Section 8) |
| **Three Clear Blobs** (default) | 30 | K-means works well |
| **Four Blobs** | 40 | Choosing k; the elbow method |
| **Overlapping Blobs** | 36 | Boundaries are ambiguous |
| **Uneven Sizes** | 35 | A big cluster and a small one; k-means may split the big one |
| **Two Moons** | 40 | Non-round shapes where k-means fails |
| **Long Thin Clusters** | 36 | Elongated clusters; k-means prefers round ones |
| **Blobs + Outlier** | 31 | One far-away point drags a centroid |
| **Uniform Random** | 30 | No real clusters exist, yet k-means still finds k groups |

Generate the prepared datasets once with a fixed seed and **store them as literal coordinate lists**, so they are identical on every run and every computer.

Keep point counts small (7–60). This is a teaching tool; every point should be individually visible and clickable.

### Editing the Data

- Click an empty spot on the plot to add a point there (rounded to one decimal place).
- Shift-click (or right-click) a point to remove it.
- A "Clear points" button empties the plot so the instructor can draw a dataset live.
- A "Random blobs" button generates new blob data from the current seed.

Changing the data resets the clustering (centroids and assignments), but keeps k and the initialization method.

Points have stable labels (P1, P2, …; the Tiny dataset uses A–G) so they can be referred to in calculations.

---

## 4. Visual Design

Reuse the Q-Learning Explorer's look exactly:

- Purple and yellow as primary UI colors, with the same CSS variables
- Same fonts (Nunito for text, JetBrains Mono for numbers)
- Same rounded panels with subtle shadows and purple title bars
- Same top bar gradient with a yellow bottom border
- Same control bar and buttons
- Large, readable text for classroom projection

### Cluster Colors

Clusters need their own palette of up to 8 colors that are distinct from each other **and from the UI's purple and yellow**, which keep their meanings:

- **Purple outline** = the item currently being processed (current point or current centroid)
- **Yellow highlight** = the winning value (smallest distance, the computed mean)

Suggested cluster palette: coral red, teal, blue, orange, pink, green, sky, brown.

Because some students are colorblind, also give each cluster a distinct **marker shape** (circle, square, triangle, diamond, …) used on points, centroids, and legend entries.

### The Plot

- Points: medium-sized markers, filled with their cluster's color and shape; gray when unassigned.
- Centroids: large star or cross markers in the cluster color with a dark outline, labeled C1, C2, …
- Optional **territory shading**: light background regions showing which centroid is nearest at each location (a Voronoi diagram). Toggle on/off.
- Optional **assignment lines**: thin lines from each point to its centroid. Toggle on/off.
- **Centroid trails**: when centroids move, leave a dotted path with small dots at each past position, so students can see how far each one traveled per iteration.
- Smooth animations for centroids moving and points changing color.

Avoid a plain spreadsheet or console appearance.

---

## 5. The K-Means Algorithm

Implement Lloyd's algorithm exactly:

1. **Initialize:** place k centroids (Section 6).
2. **Assignment step:** assign every point to its nearest centroid.
3. **Update step:** move every centroid to the mean of the points assigned to it.
4. **Convergence check:** if no point changed cluster during the assignment step, stop. Otherwise go to step 2.

Also stop after a configurable maximum number of iterations (default 20), and say clearly that this was a cutoff, not convergence.

### Distance

Use Euclidean distance:

```text
d(p, c) = √((px − cx)² + (py − cy)²)
```

The nearest centroid is the same whether you compare distances or squared distances. The engine may compare squared distances, but the UI shows the actual distances and explains this equivalence once.

### Ties

When a point is exactly the same distance from two or more centroids, assign it to the **lowest-numbered centroid**. This must be deterministic, and the UI must point it out when it happens ("Tie: C1 and C2 are both 3.61 away. Ties go to the lower-numbered centroid.").

The Tiny Worked Example contains such a tie (Section 8).

### Empty Clusters

If a centroid ends up with no points, it **stays where it is** for that update step. Flag it visibly ("C3 has no points, so it has no mean and does not move") and keep running.

### Inertia (Within-Cluster Sum of Squares)

```text
Inertia = Σ over all points of (distance from the point to its assigned centroid)²
```

Show inertia prominently and update it after every assignment step and every update step.

Teach that each half of an iteration can only lower (or keep) the inertia:

- The assignment step lowers it by giving each point its closest centroid.
- The update step lowers it because the mean is the point that minimizes total squared distance to a group.

Therefore inertia never increases and the algorithm always converges, but **it may converge to a poor local minimum** depending on initialization.

---

## 6. Initialization

Provide an initialization selector:

**Random points (Forgy):** choose k distinct data points at random to be the initial centroids.

**K-means++:**

1. Choose the first centroid uniformly at random from the data points.
2. For every point, compute D(p)², its squared distance to the nearest centroid chosen so far.
3. Choose the next centroid with probability proportional to D(p)².
4. Repeat until k centroids are chosen.

**Manual:** the instructor clicks k locations on the plot to place the centroids by hand. This is essential for demonstrating bad initializations.

### Show the Actual Random Decisions

This is the k-means equivalent of the Q-Learning Explorer's epsilon panel. Every random choice must be visible.

For **random points**, show the random number drawn and which point it selected.

For **k-means++**, show a **probability bar** divided into one segment per point, with widths proportional to D(p)², colored and labeled by point. Then:

1. Show each point's D(p)² and probability in a small table.
2. Draw and display a random number between 0 and 1.
3. Show which segment the number falls into, with a marker on the bar.
4. Highlight the chosen point and place the new centroid there.

Explain that points far from existing centroids are more likely to be chosen, but **any point with D(p)² > 0 can be chosen**.

Use a deterministic, seedable random number generator, the same one as the Q-Learning Explorer (`rng.ts`, mulberry32, with the RNG state stored in the simulation state). Show the seed and provide a "new seed" button, as in the Q-Learning Explorer.

---

## 7. Step-by-Step Controls

This is the application's highest-priority feature.

Use the Q-Learning Explorer's control bar layout and keyboard shortcuts. Provide:

**Play:** run automatically with animations.

**Pause:** freeze at the current stage without changing anything.

**Next Step:** advance exactly one microstep (below).

**Next Phase:** finish the current assignment step or update step, and stop.

**Next Iteration:** finish the current iteration (assignment + update + convergence check), and stop.

**Run to Convergence:** run until converged (or the iteration cap), then stop.

**Restart:** keep the data and k, clear the centroids, and start initialization again with the next random draws.

**Reset:** restore the default dataset, parameters, and seed.

**Speed control:** very slow to fast, as in the Q-Learning Explorer.

### Required Microsteps

**Initialization** (one microstep per centroid placed; for k-means++ also one microstep for "compute D(p)²" and one for "draw the random number")

**Assignment step**, for each point in order:

1. **Select Point:** outline the point in purple and show its coordinates.
2. **Measure Distances:** draw a line from the point to every centroid, labeled with its distance, and show the calculations in the Distance panel.
3. **Choose Nearest:** highlight the smallest distance in yellow and recolor the point. If it changed cluster, call that out ("P7 moved from C2 to C1").

**Update step**, for each centroid in order:

4. **Gather Members:** highlight all points assigned to this centroid.
5. **Compute Mean:** show the sums and the division in the Mean panel.
6. **Move Centroid:** animate the centroid to its new position and add to its trail.

**End of iteration:**

7. **Check Convergence:** report how many points changed cluster this iteration, the new inertia, and whether the algorithm has converged.

With 30+ points, stepping through every point is slow. Provide a toggle **"Step through each point"**. When it is off, the assignment step for all points becomes a single microstep, followed by a summary of which points changed. The update step can likewise be one microstep per centroid or one for all centroids. Default: on for the Tiny dataset, off for larger datasets.

Each microstep shows a short plain-English explanation, for example:

"P4 at (5.0, 7.0) is 7.21 from C1 and 0.00 from C2. C2 is nearer, so P4 joins cluster 2."

**Important:** nothing (data, centroids, assignments, random draws) may change while paused. Each command advances exactly once.

---

## 8. Calculation Panels

These are the k-means equivalent of the Q-Learning Explorer's Bellman panel. **Show how actual numbers are substituted into the equations at every step.**

### Distance Panel (assignment step)

For the current point, show one row per centroid:

```text
Point C = (3.0, 4.0)

to C1 (1.00, 1.00):  √((3.0 − 1.00)² + (4.0 − 1.00)²) = √(4.00 + 9.00) = √13.00 = 3.61
to C2 (5.00, 7.00):  √((3.0 − 5.00)² + (4.0 − 7.00)²) = √(4.00 + 9.00) = √13.00 = 3.61

Tie → C1 (lower number wins)
```

Highlight the winning row in yellow, and color each row's label with the centroid's cluster color.

### Mean Panel (update step)

For the current centroid, list its members and show the arithmetic:

```text
Cluster 1 members: A (1.0, 1.0), B (1.5, 2.0), C (3.0, 4.0)

new x = (1.0 + 1.5 + 3.0) / 3 = 5.5 / 3 = 1.83
new y = (1.0 + 2.0 + 4.0) / 3 = 7.0 / 3 = 2.33

C1 moves from (1.00, 1.00) to (1.83, 2.33)
```

### Assignment Table

The k-means equivalent of the Q-table. Rows are points; columns are the distance to each centroid, plus the assigned cluster.

- Highlight the smallest distance in each row (yellow).
- Highlight the current point's row (purple outline) on both the table and the plot.
- Clicking a row highlights that point on the plot and shows its distances in the Distance panel **without changing the algorithm state**, as in the Q-Learning Explorer's row inspection.
- Clicking a point on the plot does the same.

For larger datasets the table scrolls inside its panel; the panel itself must not change size.

### Inertia Panel

Show the current inertia (always with 3 decimal places, e.g. 8.525), its breakdown per cluster, and a small line chart of inertia after every half-iteration (reuse the Q-Learning Explorer's `LineChart`).

### Worked Example: Tiny Dataset (k = 2, manual centroids C1 = (1, 1), C2 = (5, 7))

Points: A (1, 1), B (1.5, 2), C (3, 4), D (5, 7), E (3.5, 5), F (4.5, 5), G (3.5, 4.5)

**Iteration 1**

| Point | to C1 (1, 1) | to C2 (5, 7) | Cluster |
|---|---:|---:|---|
| A | 0.00 | 7.21 | 1 |
| B | 1.12 | 6.10 | 1 |
| C | 3.61 | 3.61 | 1 (tie → lower number) |
| D | 7.21 | 0.00 | 2 |
| E | 4.72 | 2.50 | 2 |
| F | 5.32 | 2.06 | 2 |
| G | 4.30 | 2.92 | 2 |

Inertia after assignment = 33.250

Update: C1 = mean(A, B, C) = (5.5/3, 7/3) = (1.83, 2.33); C2 = mean(D, E, F, G) = (16.5/4, 21.5/4) = (4.13, 5.38). (The exact x is 4.125; display rounding gives 4.13.)

Inertia after update = 12.208

**Iteration 2**

C is now 2.03 from C1 and 1.78 from C2, so **C switches to cluster 2**. All other points stay.

Inertia after assignment = 11.226

Update: C1 = mean(A, B) = (1.25, 1.50); C2 = mean(C, D, E, F, G) = (19.5/5, 25.5/5) = (3.90, 5.10).

Inertia after update = 8.525

**Iteration 3**

No point changes cluster. **Converged** with inertia 8.525.

These numbers must appear exactly as above in the app, and must be checked by an automated test.

### Worked Example: K-Means++ on the Tiny Dataset

If the first centroid is A (1, 1), the squared distances to it are:

| Point | D(p)² | Probability | Interval on the bar |
|---|---:|---:|---|
| A | 0 | 0.0000 | (never chosen) |
| B | 1.25 | 0.0092 | [0.0000, 0.0092) |
| C | 13 | 0.0961 | [0.0092, 0.1054) |
| D | 52 | 0.3845 | [0.1054, 0.4898) |
| E | 22.25 | 0.1645 | [0.4898, 0.6543) |
| F | 28.25 | 0.2089 | [0.6543, 0.8632) |
| G | 18.5 | 0.1368 | [0.8632, 1.0000) |

Total = 135.25. A random number of 0.400 falls in D's interval, so D becomes the second centroid.

Test these numbers too.

---

## 9. Choosing k: The Elbow Method

Provide an **Elbow panel**:

- For k = 1 to 8, run k-means to convergence on the current data (k-means++ initialization, several seeded restarts, keep the lowest inertia).
- Plot final inertia against k.
- Highlight the current k.
- Explain the "elbow": inertia always decreases as k grows (k = number of points gives zero), so the goal is the point where adding clusters stops helping much.

Mark the elbow chart as computed by the same engine, with the seed and number of restarts shown. Compute it on demand ("Compute elbow chart" button), not on every edit.

Also explain honestly that the elbow is sometimes unclear, especially on the Uniform Random and Overlapping datasets.

---

## 10. Multiple Restarts and Local Minima

Because k-means can converge to a poor result, provide a **"Run 10 restarts"** feature:

- Run k-means to convergence 10 times with different seeds (same initialization method).
- Show a small gallery of the 10 results as mini plots with their final inertia.
- Highlight the best (lowest inertia).
- Let the instructor click any result to load it into the main view.

This makes "different starting points give different answers" visible.

---

## 11. Guided Demonstration Mode

As in the Q-Learning Explorer, provide predefined scenarios that load a prepared dataset, k, initialization, and (where needed) predetermined random numbers or manual centroids.

**Scenario A: The Worked Example.** Tiny dataset, k = 2, manual centroids at (1, 1) and (5, 7), step through each point. Reproduces Section 8 exactly, including the tie and C switching clusters.

**Scenario B: Good Clustering.** Three Clear Blobs, k = 3, k-means++. Converges in a few iterations to the obvious answer.

**Scenario C: Bad Initialization.** Three Clear Blobs, k = 3, with two manual centroids inside one blob and one between the other two blobs. Converges to a clearly wrong local minimum. Compare its inertia with Scenario B's.

**Scenario D: K-Means++ in Action.** Three Clear Blobs, showing each D(p)² probability bar and random draw as the centroids are placed.

**Scenario E: Wrong k.** Four Blobs with k = 2 and then k = 6. Show that k-means always returns exactly k clusters, even when that's wrong. Then show the elbow chart.

**Scenario F: Where K-Means Fails.** Two Moons and Long Thin Clusters. K-means splits the data into round-ish regions instead of following the true shapes. Explain the assumption: clusters are compact and roughly round and similar in size.

**Scenario G: The Outlier.** Blobs + Outlier. Show one centroid dragged toward a lone point, or a centroid wasted on it. Explain that means are sensitive to outliers.

**Scenario H: No Real Clusters.** Uniform Random with k = 3. K-means still produces 3 clean-looking groups. Teach that clustering always produces an answer; whether it means anything is up to the analyst.

**Scenario I: Empty Cluster.** A prepared dataset and manual centroid placement where one centroid gets no points. Show the empty-cluster rule.

Scenarios must use the real engine; all displayed calculations must be mathematically correct.

Clearly mark the app as being in a guided scenario (as the Q-Learning Explorer does with its banner and top-bar badge), and provide "Exit scenario".

---

## 12. Instructor Parameters

Provide an instructor control panel with a short explanation beside each control:

| Parameter | Default | Explanation |
|---|---:|---|
| Number of clusters (k) | 3 | How many groups k-means will find. It always finds exactly this many. |
| Initialization | k-means++ | How the starting centroids are chosen. |
| Max iterations | 20 | Safety cap; normally k-means converges well before this. |
| Step through each point | auto | Show each point's assignment individually, or all at once. |
| Dataset | Three Clear Blobs | Which prepared data to load. |
| Seed | 2024 | Controls every random choice, so demos are repeatable. |

Plus display toggles: territory shading, assignment lines, centroid trails, point labels.

Changing k or the initialization method restarts the clustering on the same data.

---

## 13. User Interface Layout

Create a dashboard optimized for a 16:9 projector, matching the Q-Learning Explorer's layout:

```text
+----------------------------------------------------------------------+
| 🎯 K-MEANS EXPLORER   Iteration 3  Phase  k  Inertia  Changed  Stage  |
+-----------------------------+--------------------+-------------------+
|                             |                    |                   |
|        SCATTER PLOT         |  ASSIGNMENT TABLE  |  INITIALIZATION / |
|  points, centroids, trails, |  distances to each |  RANDOM DRAW      |
|  territories, lines         |  centroid          |  (k-means++ bar)  |
|                             |                    |                   |
+-----------------------------+------------+-------+-------------------+
|  DISTANCE or MEAN CALCULATION            |  WHAT IS HAPPENING?       |
|  (whichever applies to the current step) |  stepper + explanation    |
+------------------------------------------+---------------------------+
| ▶ PLAY | ❚❚ PAUSE | NEXT STEP | NEXT PHASE | NEXT ITERATION | ...     |
+----------------------------------------------------------------------+
| Instructor panels: Data & Parameters | Scenarios | Inertia & Elbow   |
+----------------------------------------------------------------------+
```

Use a stepper in the explanation panel listing the microsteps, with the current one highlighted, exactly as in the Q-Learning Explorer.

### Layout Stability (lesson from the Q-Learning Explorer)

The layout must **never shift while stepping**. The Q-Learning Explorer initially had panels and the top bar change size as their text changed, which pushed the control buttons up and down under the instructor's cursor. To prevent this:

- Top-bar stats have fixed widths; long values get an ellipsis plus a tooltip. The top bar never wraps.
- Set explicit line heights on top-bar text so the web font loading doesn't change heights.
- The explanation, calculation, and table panels have fixed sizes and scroll internally if content is too long.
- Avoid hover effects that move buttons (use a glow, not a lift).
- Verify by stepping through a full run and checking that the control bar's position never changes.

---

## 14. Implementation Architecture

Mirror the Q-Learning Explorer's architecture.

**Engine (pure TypeScript, no React):**

- `geometry.ts`: points, distances, means, inertia
- `datasets.ts`: the prepared datasets as literal coordinates
- `kmeans.ts`: the state machine. `advance(state)` performs exactly one microstep and returns a new immutable state. Helpers `advancePhase`, `advanceIteration`, `runToConvergence`, `restart`, `reset`.
- `init.ts`: random-point, k-means++, and manual initialization, recording every random draw for display
- `elbow.ts` and `restarts.ts`: batch runs for Sections 9 and 10
- `scenarios.ts`: Scenarios A–I
- `rng.ts`, `format.ts`: copied from the Q-Learning Explorer

All calculations happen in the engine. The UI only displays values the engine produced; it never recomputes distances or means itself. The engine records the intermediate values (each distance, each sum, the random number, the probability intervals) so the panels can show them.

**Hook:** `useKMeans.ts`, modeled on `useSimulation.ts` (play timer, speed levels, paused commands).

**Components:** plot, assignment table, initialization panel, distance panel, mean panel, inertia and elbow charts, explanation panel, instructor panels, and the reused top bar, controls, panels, and line chart.

**Tests (Vitest):**

- The Section 8 worked example: every distance, assignment, mean, and inertia, including the tie at C and C switching in iteration 2
- The k-means++ probabilities and interval selection in Section 8
- Inertia never increases across half-iterations, on every prepared dataset with several seeds
- Convergence is detected exactly when no point changes cluster
- Empty clusters keep their centroid in place
- Ties go to the lowest-numbered centroid
- The same seed gives identical runs; pausing changes nothing
- Every scenario loads and runs

---

## 15. Reuse From the Q-Learning Explorer

Read `../QLearning` before starting. Copy and adapt rather than reinvent:

| File in ../QLearning | Reuse for |
|---|---|
| `src/styles.css` | Theme variables, panels, top bar, controls, stepper, buttons, scenario banner, layout-stability rules |
| `src/components/ui.tsx` | `Panel`, `AnimatedNumber`, value coloring |
| `src/components/TopBar.tsx` | Top bar and fixed-width stats |
| `src/components/Controls.tsx` | Control bar, keyboard shortcuts, speed slider |
| `src/components/LineChart.tsx` | Inertia and elbow charts |
| `src/components/ExplanationPanel.tsx` | Stepper + plain-English explanation |
| `src/engine/rng.ts`, `src/engine/format.ts` | Seeded RNG and number formatting |
| `src/useSimulation.ts` | Play / pause / speed / step hook pattern |
| `vite.config.ts`, `index.html`, `package.json` | Single-file build, fonts, scripts |
| `.github/workflows/deploy.yml` | GitHub Pages deployment (base `/KMeans/`) |

Replace the robot logo with a target or cluster icon, and the title with **K-MEANS EXPLORER**. Keep the subtitle style and the badge in the top-right corner ("LIVE CLUSTERING" / "GUIDED SCENARIO X").

If there are screenshots of the Q-Learning Explorer in `./reference/`, match their look.

Do not modify the Q-Learning project.

---

## 16. Future Extensions (do not build now)

Later versions may add k-medoids, Gaussian mixture models, DBSCAN, or hierarchical clustering for comparison. Keep the plot, panels, and controls independent of k-means specifics where it's easy to do so, but do not build infrastructure for other algorithms now.

---

## 17. Educational Accuracy

The simulator must correctly demonstrate:

- K-means is unsupervised: there are no labels, and colors are cluster numbers, not true classes.
- Each point is assigned to its nearest centroid by Euclidean distance.
- Each centroid moves to the mean of its assigned points.
- Assignment and update alternate until no point changes cluster.
- Inertia never increases, so k-means always converges.
- Convergence is to a local minimum, which depends on initialization.
- K-means++ makes far-away points more likely as centroids, but it is still random.
- K-means always returns exactly k clusters, whether or not real clusters exist.
- K-means favors compact, round, similarly sized clusters and is sensitive to outliers.
- The elbow method is a heuristic, not a rule.
- Cluster numbers are arbitrary; the same clustering can have its numbers permuted.

---

## 18. Priorities

1. Scatter plot with datasets, matching the Q-Learning Explorer's look.
2. Correct k-means engine with tests (including the Section 8 worked example).
3. Microstep controls with pause safety.
4. Distance and mean calculation panels, and the assignment table.
5. Initialization panel with visible random draws and the k-means++ bar.
6. Inertia tracking and chart.
7. Guided scenarios.
8. Elbow chart and multiple restarts.
9. Single-file build and GitHub Pages workflow.
10. Polish, layout stability, and projector readability.

### Acceptance Criteria

The application is successful when an instructor can:

- Load the Tiny dataset and step through the worked example, with every number matching Section 8.
- Point at any point and show its distance to every centroid, and why it joined its cluster.
- Show the mean calculation that moves each centroid.
- Demonstrate k-means++ choosing a centroid, including the probability bar and random number.
- Show a bad initialization converging to a worse answer than a good one.
- Show inertia falling and the algorithm stopping when nothing changes.
- Use the elbow chart to discuss choosing k.
- Show k-means failing on Two Moons and being pulled by an outlier.
- Add and remove points live and recluster.
- Pause at any moment without anything changing, and reset reliably.
- Double-click the built `dist/index.html` and have the full app run.

### Final Instruction

The visual educational experience is more important than a sophisticated implementation.

Keep the data simple.

Make the algorithm extremely transparent.

The student should always be able to answer four questions:

1. **Why is this point in this cluster?**
2. **Why did this centroid move here?**
3. **Did this iteration make the clustering better, and by how much?**
4. **Would a different start give a different answer?**

Build a functional, attractive teaching application, not just a static mockup.
