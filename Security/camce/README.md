# C.A.M.C.E. Security Correlation Engine (Portable Static Build)

Open `index.html` from any static web server.

## Highlights
- Multi-file HTML/CSS/JS architecture.
- OpenSearch findings + threat findings ingestion.
- Normalized in-memory Map store with single-pass document parse.
- ID sanitization + edge validation invariants.
- Correlation fields: related.ip/user/hosts/email/domain + custom dot-path fields.
- Hub thresholding to avoid clique explosion.
- Temporal bridges with story window (minutes).
- Off-main-thread layout (Web Worker) with deterministic seed and incremental reuse.
- Canvas renderer with progressive node/edge rendering, viewport culling, and zoom LOD.
- Timeline playback with event replay and UTC time-window filtering.
- Centrality sizing and rarity pivots.

## Files
- `js/api.js` — OpenSearch API requests.
- `js/store.js` — normalized security store.
- `js/graphBuilder.js` — correlation engine and edge aggregation.
- `js/layoutWorker.js` — force layout worker.
- `js/renderer.js` — scalable canvas rendering.
- `js/timeline.js` — replay and scrub logic.
- `js/analytics.js` — stats and pivots.

