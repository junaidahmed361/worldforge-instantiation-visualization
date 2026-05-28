# worldforge-instantiation-visualization

Visualization-first repo for Worldforge instantiation views:
- multi-world mesh
- calibration knobs
- visual potential-impact overlays

## Scope
This repo intentionally excludes ingestion/execution backend logic.
It focuses on interactive mesh exploration and trajectory impact comparison.

## Planned stack
- React + TypeScript + Vite
- Sigma.js or D3-force for mesh rendering
- Zustand for UI state (knobs, filters, selected trajectory)

## MVP features
1. Load a WorkUnit JSON
2. Render nodes/edges by world and relation
3. Show impact propagation as edge pulse/intensity
4. Calibration knobs:
   - impact vs risk
   - speed vs confidence
   - debt tolerance
   - blast radius cap
5. Compare trajectory A vs B overlays

## Run (after deps are installed)
```bash
npm install
npm run dev
```


## WorkUnit import flow (from backend)

1) Generate a WorkUnit using `POST /intent` in the realmforge API.
2) (Optional) Persist it via `POST /demo/export-workunit`.
3) Paste the WorkUnit JSON into this UI textarea and click "Load WorkUnit".
4) Tune calibration knobs to inspect ranked potential-impact entities.
