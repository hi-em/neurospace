# NeuroSpace

> **Status, honestly: the geometry no longer computes.** The Grasshopper definition ran on IAAC's
> shared course Rhino Compute server, and that server has been retired now the course year is
> over. The [deployed app](https://hi-em.github.io/neurospace/) still loads and the scoring still
> works: sliders move, the NeuroScore responds, the analysis report reads. The room just does not
> render. A recorded walkthrough of the whole thing working is on the
> [project page](https://emiliechidiac.com/work/neurospace).
>
> Which is, accidentally, a decent argument for the split described below: the fast path was built
> to live in the browser, so it outlived the server.

A parametric room you can drag, and a score that answers back. Move a slider and NeuroSpace
rebuilds the room, then estimates what that room is likely doing to the person inside it:
cognitive load, circadian rhythm, stress. The idea is to make an invisible layer of a design
legible while the plan is still soft.

It is BIM reframed: Building Information Modeling to Behavior Information Modeling. The
information that matters is not only what a building is made of, it is what the building is
doing to the person inside it.

Built solo, for MaCAD (Master in Advanced Computational Design for Architecture II) at IAAC, by
Emilie El Chidiac.

## How it works

Two paths, deliberately split, because they have very different costs.

**The slow path: geometry.** The room is described as parameters rather than geometry, ceiling
height, wall count, curvature, opening count and size, organic form, plants. Those go to a
Grasshopper definition ([`src/assets/neuro-space.gh`](src/assets/neuro-space.gh)) evaluated
server side through Rhino Compute, which streams the heavy geometry back. The browser never
models anything itself. This only reruns when the shape actually changes.

**The fast path: scoring.** The behavioural score is computed in the browser the instant a
slider settles ([`src/utils/neuroScore.js`](src/utils/neuroScore.js)). No server round trip,
so the number answers as fast as you can drag.

```
sliders ──► Grasshopper on Rhino Compute ──► geometry ──► three.js  (slow path, on change)
        └─► weighted score in the browser ──────────────► NeuroScore (fast path, instant)
```

Stack: Vue 3, Pinia, three.js, rhino3dm and compute-rhino3d, Vite.

## The score, and how to argue with it

The NeuroScore is a **transparent weighted sum**, not an instrument. It estimates; it does not
measure anything about your body, and it makes no clinical claim. Current weights:

| Dimension | Weight | Reading |
|---|---|---|
| Ceiling height | 0.22 | cognitive freedom |
| Wall curvature and count | 0.25 | visual stress |
| Daylight, opening count and size | 0.22 | wellbeing |
| Biophilic organic form | 0.18 | optimal around 0.4, not maximal |
| Potted plants | 0.13 | attention restoration |

They lean on neuroarchitecture research, principally the work of Dr. Cleo Valentine, turned
into numbers a designer can read. They are in the repo on purpose. A score you can argue with
beats a number you have to trust, so if you disagree with a weight, the file is right there
and the disagreement is the useful part.

The biophilic curve is the one worth noticing: the score peaks at a middling value and falls
off above it. More organic form is not monotonically better, and a scoring function that
rewarded "more" would have been easier to write and wrong.

## Honest notes

- **The score is a heuristic.** It is a defensible reading of published research, not a
  measurement, and it should be argued with rather than cited.
- **Depending on someone else's server was the real mistake, and it has already cost the demo.**
  The Grasshopper definition ran on IAAC's shared course Rhino Compute instance, hardcoded in
  `src/scripts/compute.js` along with the shared class key. That server is now unreachable, so
  the geometry path is dead while the scoring path, which never left the browser, still runs.
  Self-hosting Rhino Compute is billed on server uptime rather than on use, which is priced for
  products and not for a portfolio piece. The right fix is to remove the dependency: compute the
  geometry in code, client side, so nothing can retire underneath it. That is the next version,
  and it will be its own repo.
- **An earlier version of the demo recording shipped with my browser window in frame.** It was
  re-encoded with a crop above the app. Worth saying because it is the kind of thing that is
  easy to miss and awkward to undo.

## Running it locally

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
```

Deploys to GitHub Pages from `master` via `.github/workflows/deploy.yml`. The geometry needs a
reachable Rhino Compute endpoint, set in `src/scripts/compute.js`. Point it at a local Rhino
Compute instance and everything works again.

## More

The long read: [The data pipeline behind NeuroSpace, from sliders to synapses](https://blog.iaac.net/the-data-pipeline-behind-neurospace-from-sliders-to-synapses/)

The project page: [emiliechidiac.com/work/neurospace](https://emiliechidiac.com/work/neurospace)
