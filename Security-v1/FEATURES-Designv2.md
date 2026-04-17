# C.A.M.C.E - CAM CORRELATION ENGINE
# FULL FEATURE SPECIFICATION

---

**CORE ARCHITECTURE**
- Base data store for findings, documents, IOCs, and entities
- Base nodes and links remain unchanging after initial build
- All filtering produces view projections without modifying source data
- Normalized data store eliminates duplication and provides fast lookup
- Document JSON strings parsed once on initial load

**DATA SOURCES**
- OpenSearch Security Analytics Findings API: GET /_plugins/_security_analytics/findings/_search
- Threat Intel Findings API: GET /_plugins/_security_analytics/threat_intel/findings/_search
- Free-form search: POST /_search with query_string queries
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"user.name: mirror +process.pid:3623680","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}]}}}`
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"$USER_INPUT_HERE$ ","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}]}}}`  modify `now-1h` to match time range filter
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"$USER_INPUT_HERE$ ","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"1776181210000"}}}]}}}` where `1776181210000` is the epoch milliseconds for the absolute time range filter
- All three sources merge into unified graph
- Supplemental hunt data adds to, never replaces, findings

**CONNECTION & AUTH**
- Host endpoint, username, password inputs
- Basic Auth headers
- Credentials saved to browser storage
- Auto-fill on load
- Status indicator for connection state
- Connection panel hides after successful connect

**TIME RANGE FILTERING**
- Relative presets: 1h, 4h, 12h, 1d, 7d, 30d
- Absolute datetime pickers
- Browser timezone detection, converts to UTC epoch milliseconds
- Filters against finding.timestamp field
- Client-side filtering before building any correlation or graphs

**CORRELATION ENGINE**
- Default fields: related.ip, related.user, related.hosts
- Optional: related.email, related.domain
- Custom field input (comma-separated, supports dot notation), inputs can be toggled/removed
- Story window (minutes, default 30) for temporal bridging
- Hub threshold (default 5) — entities exceeding threshold become hub nodes instead of clique edges
- Build co-occurrence mesh toggle
- Build temporal bridges toggle
- Re-correlate without re-fetching data
- Support for dot-notation field paths
- Normalize array handling for ECS fields

**TEMPORAL NODE SPLITTING**
- Tracks lastSeen timestamp per entity
- When same entity reappears after story window gap, creates new instance
- Naming: "jsmith [Inst 2]", "jsmith [Inst 3]"
- Preserves session boundaries in graph

**GRAPH VISUALIZATION**
- Graph rendering that scales to 5K+ nodes on standard hardware
- Layout computation runs off the main thread
- Layout algorithm: decompose into components, apply force-directed layout per component, arrange components spatially
- Component isolation prevents混乱
- Layouts: organic, concentric, breadthfirst, grid, and other suitable arrangements
- Adjustable layout parameters
- Animations enabled for layout changes and interactions
- Layout recalculates on filter changes while preserving positions where possible

**NODE TYPES & ENCODINGS TO DEFINE**
- Findings
- IP hub
- User hub
- Host hub
- IOC/Threat Intel
- Supplemental (hunt)
- Size scales with degree centrality
- Borders: active / resolved / temporal
- Severity colors: critical, high, medium, low

**EDGE ENCODING**
- Width scales with weight/count
- Color inherits from source severity
- Style: solid (direct), dashed (inferred)
- Animated flow on high-severity edges
- Curvature reduces overlap
- Bidirectional links use stronger curves

**INTERACTIONS**
- Click node: select, highlight 1-hop neighbors with smooth opacity transition
- Shift-click two nodes: shortest path highlight
- Double-click: focus node with animated camera (center + zoom)
- Hover: tooltip with key fields
- Drag to reposition
- Mouse wheel/pinch to zoom
- Pan to navigate
- Legend toggles per type with counts
- Quick filter chips
- Explanations for ML flags: click pivot to show exact rarity score, cluster distance, etc
- Tooltips and hover states for settings and discoverability

**TIMELINE**
- Time axis at bottom of view
- Shows all findings as ticks
- Hover over info for findings in timeline
- Scrubber with play/pause
- Playback speed: regardless of timeline length, completes in configurable time
- Stop / Reset buttons to end playback and return to initial state
- Animation frame-based timing, properly cancellable
- As time advances, nodeVisibility/linkVisibility callbacks hide/show nodes
- No data mutation during playback
- Temporal filtering without graph rebuild

**MACHINE LEARNING - 5 METHODS**

1. RARITY SCORING (z-scores)
- Calculates frequency distributions for users, IPs, hosts, actions, pairs
- Computes mean (μ) and standard deviation (σ)
- z-score = (x - μ) / σ
- Flags values with z < -1.5 (rare) and z < -2 (very rare)
- Composite rarity score: weighted sum of z-scores plus unique bonuses
- Detects: rare source.ip, unusual user.name, rare user@host pairs
- Time-based rarity: flags unusual hour of day activity

2. KMEANS CLUSTERING
- Builds 6-dimensional feature vectors
- k = min(5, floor(sqrt(n/2)))
- Flags top 5% farthest from centroids as outliers
- Good for: finding common patterns, detecting small weird clusters

3. KNN (K-NEAREST NEIGHBORS)
- For each point, finds k=5 nearest neighbors
- Score = average distance to kNN
- Local outlier detection (not global)
- Catches: one strange event among many similar ones
- Interactive: click to highlight point plus its 5 neighbors
- LOF approximation included

4. HIERARCHICAL CLUSTERING (HClust)
- Agglomerative clustering with Ward linkage
- Builds full dendrogram
- Cuts into families (max 8 clusters)
- Shows natural groupings without pre-specifying k
- Displays common signatures per family
- Flags singleton families as investigate-worthy
- Better than KMeans for exploration

5. DISTANCE MATRIX SIMILARITY
- Computes full pairwise Euclidean distance matrix
- Converts to similarity scores: 1/(1+distance)
- Shows top 20 most similar finding pairs
- Good for: finding near-duplicates, detecting odd one out
- Click pair to highlight both nodes

**PIVOTS PANEL**
- Tabbed interface: Rarity, KMeans, KNN, Families, Similarity, Stats
- Each method shows ranked results
- Click any pivot to highlight related nodes in graph
- CRIT badges for critical severity
- Sortable tables
- Real-time recalculation on filter changes

**TELEMETRY PANEL**
- Visible nodes/edges count
- Findings count, documents count, entities count
- Time span of current view
- Raw payload viewer (JSON tree)
- Adjacency table for selected node
- Per-node investigation notes (saved to localStorage)
- Full document data from parsed document_list

**HUNT WORKFLOW**
- Free-form Lucene query bar
- Example: "username:cam AND event.type:authentication"
- Searches supplement findings data
- Shows where else entities appear
- Reveals lateral movement paths
- Visual distinction for hunt-derived nodes

**STATISTICS DASHBOARD**
- Degree centrality ranking
- Top pivots by connection count
- Rare value detection
- Spike detection in event.action
- Unusual host+message combinations
- Bucket comparisons (current vs historical)
- Mean, median, mode, standard deviation, variance

**EXPORT/IMPORT**
- Export PNG of current graph view
- Export full state JSON (includes filters, notes, positions)
- Import state JSON to restore investigation
- Save to browser localStorage
- Per-entity notes persist across sessions

**PERFORMANCE**
- Layout computation runs off main thread
- Approximation algorithm for repulsion calculation
- Rendering optimized for medium to large graphs
- Handles 5K nodes interactively
- Immutable data prevents unnecessary re-renders
- Re-rendering without refetching for filter changes

**VISUAL DESIGN**
- Dark mode color palette
- Panels with subtle background effects
- High information density typography
- Background pattern in graph area
- Subtle effects on nodes
- Smooth transitions
- Professional appearance without generic aesthetics

**INVESTIGATION FEATURES**
- Investigation workbench per node
- Label nodes for tracking
- Saved hunts in localStorage
- Undo/redo for actions
- Reset layout button
- Focus mode isolates subgraphs
- Pathfinding between any two nodes
- Neighbor highlighting
- Raw data access for every node

**COMPLEMENTARY CORRELATION PAIRS**
- related.user + related.ip: lateral movement detection
- related.ip + temporal bridges: shared infrastructure over time
- document nodes + temporal bridges: storytelling
- co-occurrence mesh + custom fields: non-standard schema pivots

**BENEFITS**
- See attack chains instantly via temporal splitting
- Find patient zero via rarity scoring
- Discover lateral movement via user@host correlation
- Identify C2 infrastructure via IP hub analysis
- Detect data exfiltration via rare pair detection
- Hunt without writing queries via visual pivoting
- No server required for analysis (runs in browser)
- Works offline with exported data
- Preserves investigation context across sessions
- Reduces MTTR by making relationships visible

**COOL SHIT**
- Animated particles flow along critical edges
- Nodes pulse when selected
- Timeline scrubbing rewinds attacks like video
- Shift-click pathfinding shows attack paths
- Singleton families automatically flagged as suspicious
- 3am login gets flagged with high rarity score
- Same user appearing hours later becomes new node instance
- Hover over rarity bar shows exact statistical deviation
- KNN highlights local neighborhood in different colors
- UI stays responsive during large layout computations
- Panels blur the graph behind them
- Every filter is instant, no loading spinners
