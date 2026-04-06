
# TODO:

[x] Initialize React project with webapp-building skill
[x] Design and implement core application architecture
[x] Create OpenSearch API service layer for findings/alerts
[x] Build graph visualization engine with D3/Cytoscape
[x] Implement temporal node splitting and timeline playback
[x] Create correlation panel with field selection
[x] Build pivots panel with statistical analysis
[x] Implement query panel with filters
[x] Create hunt section with node labeling
[x] Build statistics and legend panels
[x] Implement export/import and persistence
[x] Add layout modes and graph interactions
[x] Polish UI with glassmorphism and animations
[x] Build and deploy application as static-html file




# FEATURE_LIST:

This is a complex task to create a comprehensive correlation engine web application for OpenSearch Security Analytics. Let me break down the requirements:
- Core Functionality:
- Integrate with OpenSearch Findings API
- Fetch findings, alerts, and threat intel data
- Build correlation graphs based on related fields (domain, email, hosts, ip, user)
- Support custom correlation fields
- Temporal analysis with timeline playback
- Features from CAMCE (Cam Correlation Engine):
- Timeline with playback controls (scrubbing, forward/backward)
- Pivots (statistically interesting fields)
- Connection settings (username, password, host endpoint)
- Query panel with filters (detector type, severity, log type)
- Correlation panel with checkboxes for default fields
- Story windows (temporal bridge threshold)
- Entity co-occurrence mesh
- Toggle between findings and alerts
- Hunt section with labeled nodes
- Export/import capability
- Investigation workbench with per-node notes
- Legend map with toggles
- Statistics panel
- Graph interactions (click to select, shift-click for shortest path)
- Layout modes (concentric, grid, story-chain)
- Raw payload panels
- Best features from POCs:
- Temporal node splitting (same entity reappears after time window gets new node instance)
- Runtime filters (base data never mutated)
- requestAnimationFrame-based playback
- nodeVisibility/linkVisibility callbacks
- Severity-colored edges with directional particles
- focusNode with animated camera
- Tab system (Pivots vs Telemetry)
- Glassmorphism panels
- Best complementary pairs for correlations
- Fetchless re-rendering
- Design Requirements:
- Bold, distinctive aesthetic
- Not generic "AI slop"
- Production-grade
- Visually stunning
- Dark theme suitable for security operations center

I'll focus on creating an immersive, high-performance cybersecurity visualization interface. The design will leverage cutting-edge web technologies to deliver a sleek, intuitive experience for security analysts. Key priorities include real-time data interaction, dynamic graph representations, and seamless user controls that make complex security data immediately comprehensible.
- The architecture will prioritize modularity, ensuring each component can be independently developed and tested. Performance optimization will be critical, with efficient data rendering and minimal latency in user interactions.


---

# CURRENT_ERRORS_TO_RESOLVE:

Resolved 2026-04-06:
- The three recorded panel syntax errors were caused by duplicated trailing JSX/export fragments appended to:
  - `src/components/panels/PivotsPanel.tsx`
  - `src/components/panels/SelectionDetail.tsx`
  - `src/components/panels/Statistics.tsx`
- After removing those corrupt tails, a few follow-up TypeScript issues were also fixed:
  - removed an unused `getLayoutOptions` helper from `src/App.tsx`
  - removed an unused `useCallback` import and corrected Cytoscape transition typing in `src/components/graph/GraphVisualization.tsx`
  - narrowed the node-type toggle action to `NodeType` and removed an unused persist callback arg in `src/store/index.ts`
  - removed the duplicate `LayoutType` export in `src/types/index.ts`
- Current status: `npm run build` now completes successfully and outputs the production static site in `dist/`.

## Progress Notes

- 2026-04-06: Installed existing dependencies with `npm ci` before trusting local build/lint output. Initial `eslint` / Node type failures were environment setup issues in the sandbox, not missing project files.
- 2026-04-06: Verified the built app manually via `npm run preview -- --host 0.0.0.0 --port 4173`.
- 2026-04-06: Confirmed the polished UI shell and working demo mode in the browser with populated graph stats, pivots, legend, and timeline.

## Learnings / Notes To Self

- If the compiler starts throwing impossible-looking JSX parser errors near the end of a panel file, check for accidental duplicate fragments appended after the correct `export default` line before assuming the component logic is broken.
- Build validation for this project is `npm run build` (`tsc -b && vite build`). This is the command that proves the static-html output is healthy.
- Manual verification is easiest with `npm run preview -- --host 0.0.0.0 --port 4173`, then load demo data to confirm the graph renders with meaningful counts and pivot content.
