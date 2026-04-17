
## INSTRUCTIONS:

THINK HARD ABOUT THIS:

# Your Task:
 I want you to create the best CORRELATION Network Graph / GraphRenderer / GraphNode / EdgeNode application that integrates with the OpenSearch API's (findings to bring the user an interactive and comprehensive and visually appealing correlation engine for dealing with cyber security and IT ops issues.  I have included the documentation for the findings API. You should familiarize yourself with how to both request data from it and that data format that returns back to you. You should make to make interacting with the API easy for the user, you should consider having be it filters or buttons or input values that adjust and help the user both hunt and search and correlate on what they need You can use whatever React / JavaScript libraries you deem fit (The only requirement is the final product must be portable html/js/css compiled or otherwise).  I have included a Python example, more so to help you understand how to interact with the API. But feel free to ignore it obviously and go in a completely different direction. additionally to what the python program has in it there are a number of fields for you to correlate on or against they all start with related and they are the following terms related.domain, related.email, related.hosts, related.ip, related.user. Perhaps having the user input to the web app additional fields to correlate on and have them animate and render in front of the user would be helpful as well. Possibly taking @timestamps into consideration to animate and create a security story would all so be helpful!

THE AMOUNT OF NODES TO HANDLE IS EASILY 5000 TO 20000 NODES! YOU MUST UTILISE OPTIMATISATIONS LISTED IN OPTIMIZATIONS.md!!!

# Security Analytic (SA) Concepts
OpenSearch stores every log as a document with a document ID.

SA comes with 2000 preloaded `sigma` rules, known as `Detector rules` which define what to look for.  
Threat detectors schedule those `detector rules` to run as searches every minute; each run may match documents.  
Any matches creates `findings` a log with detector infomation, tags, etc along with the document ID AND the Document ID data retrived in the `finding`.

Separately, threat intel feeds (IOC lists of IPs, hashes, domains) are downloaded / configured; they run saved searches against the same documents.  
When an IOC hits, another `finding` event, containing (threat) detector infomation, tags, etc along with the document ID, however it DOES NOT contain the actual Document ID data.

Thus both detector findings and threat intel findings contain `related_doc_ids` for their associated (triggering ) log.

# Highlevel - how data intersects and overlaps across the API responses
If you look at the detector findings, you will note the fact that there is the `findings[].document_list[].document` field which contains escaped JSON. In that escaped JSON is actually the raw event data which matches the related doc IDs in the event.

Now what pretty much needs to be done is for that escaped JSON to be no longer escaped and then also passed as JSON for the finding, added to the event as additional attributes. From there we can actually do correlation of the event data such as related.ip or whatever the user actually chooses to correlate the fields on. By default it should probably be related.ip to begin with; you don't want to add too many correlating fields by default as it isn't very useful and just adds to overhead.

# In memory data store design 
Think hard about how to store the escaped `findings[].document_list[].document` once its parsed etc, one suggestion on how to do it is:

For the security findings and IOC payloads (2000+ findings in memory), the preferred approach is a single normalized securityStore object that uses Maps for all primary keys.
Process the two input payloads separately but in one pass: first load and enrich the findings payload, parsing every document_list[].document string into a real object exactly once and storing it in a dedicated documentsById map; then load the IOC payload and, for each IOC, resolve its related_doc_ids against that same document map (stripping any optional ":index" suffix). Attach the resolved references as an array of lightweight objects on each enriched IOC so the relationship is immediately available without further lookup.
Reasoning & motivation:
This normalized Map-based design eliminates all data duplication, guarantees O(1) lookup time for any finding, document, or IOC by ID, and gracefully degrades when a related_doc_id points to something that wasn’t loaded. It keeps memory footprint minimal, makes the store trivial to extend with secondary indexes later (by IP, tag, timestamp, etc.), and turns the enriched payloads into a ready-to-analyze dataset that is excellent for generating pivot tables and statistical insights (ML.Array stats such as mean/median/mode/stdDev, distance/similarity scoring, KMeans/HClust clustering, KNN outlier detection, rarity scoring, z-scores, and bucket comparisons).
This is the production-grade pattern for security tooling workloads — fast, predictable, maintainable, and directly supports both investigation and advanced analytics.


# Timerange picker / filter
Configure a time range picker where the user can select either the absolute date range or relative to now (now = endTime) (eg, 4 hours ago, 1 day ago, 1 week ago, being the startTime, etc) those dates should be configured to UTC timezone and in the 'Epoch milliseconds' format. Typically detect the browsers timezone and use that to adjust to UTC.
You will then need to filter against the .timestamp field in the findings results.

# Pivots - statistically interesting fields or values

Investigate using the following machine learning JavaScript libraries if they are needed to be manually imported to serve locally onto the web server that's okay just let me know and I can download them and serve them from the same web server directory if needed

ML.Array.* (https://github.com/mljs/array)
ML.Distance / ML.distanceMatrix ( https://github.com/mljs/distance / https://github.com/mljs/distance-matrix)
ML.HClust (https://github.com/mljs/hclust)
ML.KMeans (https://github.com/mljs/kmeans)
ML.KNN (https://github.com/mljs/knn)


1. ML.Array.*

This is probably the most useful starting point for what you described.

Use:

ML.Array.mean
ML.Array.median
ML.Array.mode
ML.Array.standardDeviation
ML.Array.variance
also min / max where helpful.

Why it fits:

count field values
compute expected frequencies
detect rare/unique values
z-score or “N standard deviations from normal”
compare current bucket vs historical bucket

For your examples, this is ideal for things like:

rare source.ip
unusual user.name
spikes in event.action=ssh_login
rare host.name + message signature
unusual number of Segmentation Fault messages on one host

2. ML.Distance / ML.Similarity / ML.distanceMatrix

These are the next most useful once you move beyond raw counts.

Why they fit:

turn each event into a feature vector
compare one event to others
score “how different is this event from the rest?”

This is good for:

finding the odd log line in a batch
detecting unusual field combinations
grouping events that are almost the same except one field changed

For logs, this is often more useful than jumping straight to a classifier.

3. ML.KMeans

Good for finding common patterns and then flagging items far from cluster centers.

Why it fits:

cluster “normal” event shapes
detect small weird clusters
detect singletons or events far from any normal cluster

Good examples:

most auth failures cluster one way, but a few have unusual user/source/host combinations
most apache errors cluster by module/message, but some are structurally different

4. ML.HClust

Very useful for exploration and “show me families of related events.”

Why it fits:

helps you see near-duplicates vs outliers
good when you do not know how many clusters exist
useful for small-to-medium batches like 100–2000 events

This is often a better analyst tool than KMeans early on because it is easier to inspect.

5. ML.KNN

Useful as a simple local outlier detector once events are encoded numerically.

Why it fits:

“distance to nearest neighbors” is a good anomaly score
catches events that are weird relative to nearby patterns, not just globally rare

This is good for:

one strange ssh failure among many normal ssh failures
odd combinations that do not show up often

 
 
# Here is a list of features that would make the best correlation engine app in the world! (IMHO). If you have good ideas add them in too.

I should also mentioned the creation of My App (Called C.A.M.C.E (Cam Correlation Engine)) included the best features from 3 different Proof of Concepts (POC). I must include what the best parts were, to hopefully inspire and be included where needed (nothing forgotten).
Additionally C.A.M.C.E, includes a timeline feature allowing replaying of events etc, scrubbing back and forth. playback controls etc.
Other important parts in C.A.M.C.E are 'Pivots' statistically interesting fields or values, all calculated in browser, allowing clicking on the Pivots and nodes highlighted etc, again I'm starting to blur the lines between CAMCE and New Layout Engine!
---
More ideas while I remember:

The CAM correlation engine has so many features I haven’t even mentioned yet.
- Connection and data inputs: username, password, host endpoint; it connects and downloads the data. (username, and hostname browser persistent storage)
  - input fields / connection section - collapses / hides after successful connect - freeing up UI space.
- TIME-RANGE Picker - Limit data to timerange!!  
- Findings query panel:
  - Shows all findings and retrieval details
  - Max Findings and Threat Intel records
  - Filter by detector type, severity, log type
  - Sorting options
- Correlation panel:
  - Checkboxes for default fields: related.domain, related.email, related.hosts, related.ip (default), related.user
  - Input boxes for additional fields like process.name
  - Story window in minutes (temporal bridge threshold, rolling window size)
  - Max co-occurrence values for max edges
  - Toggle node types: finding nodes, document nodes, detector query/tag context
  - Advanced options:
    - Build entity co-occurrence mesh for relationship discovery
    - Build temporal bridges between nearby sightings (node-to-node within story windows)
- Toggle findings off, alert results on
- Sliding story windows for correlation distance
- Pivot tables: statistical outliers, rare results, KNN, HLCluster, other ML stats on any field
- Hunt section:
  - Label nodes
  - Saved to browser persistent storage
  - Export/import capability
    - export PNG
    - export full state
    - import full state
- Graph defaults:
  - Easily enabled correlations + Pivot tables
  - Best complementary pairs:
    - related.user + related.hosts (lateral movement, account-to-host)
    - related.ip + temporal bridges (shared infrastructure over time)
    - document nodes + temporal bridges (storytelling)
    - co-occurrence mesh + custom fields (non-common schema pivots)
    - Other?
- Fetchless re-rendering: no re-fetch required to redraw
- Investigation workbench: per-node notes, saved per entity
- Legend map: toggle IP, users, hosts, emails, findings, threats, IOCs
- Statistics:
  - Visible nodes/edges
  - Counts: findings, documents, entities, correlated alerts
  - Time span
- Graph interactions:
  - Click node to select/highlight
  - Shift-click two nodes for shortest visible route
  - Quick filters
- Layout modes:
  - Denser, smaller, progressive views
  - Concentric, grid-based, story-chain
  - Timeline modes with playback controls
  - OPTIMIZED! See OPTIMIZATIONS.md !!!
- Raw payload panels: view raw data powering each node

---

# API ENDPOINT infomation


## (Detector) Findings
PRIMARY API FOR RESULTS OF OUR SIGMA RULES THAT ARE RUNNING AS `DETECTORS`. RESULTS VARY IN RISK LEVELS BUT HELP PAINT THE SECURITY PICTURE FOR THE ORGANISATION.
### Endpoints examples
```
GET /_plugins/_security_analytics/findings/_search
GET /_plugins/_security_analytics/findings/_search?size=10000&sortOrder=desc
GET /_plugins/_security_analytics/findings/_search?size=200&startIndex=0&sortOrder=desc
GET /_plugins/_security_analytics/findings/_search?size=200&startIndex=1&sortOrder=desc

```
### Timestamps
`.timestamp` field is epoch milliseconds. Manually filtering required 
###  Path Parameters

| Parameter       | Description                                                                                                                                                                                                                                           |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detector_id`   | The ID of the detector used to fetch alerts. Optional.                                                                                                                                                                                                |
| `detectorType`  | The type of detector used to fetch alerts. Optional.                                                                                                                                                                                                  |
| `sortOrder`     | The order used to sort the list of findings. Possible values are `asc` or `desc`. Optional.                                                                                                                                                           |
| `size`          | An optional limit for the maximum number of results returned in the response. Optional.                                                                                                                                                               |
| `startIndex`    | The pagination indicator. Optional.                                                                                                                                                                                                                   |
| `detectionType` | The detection rule type that dictates the retrieval type for the findings. When the detection type is `threat`, it fetches threat intelligence feeds. When the detection type is `rule`, findings are fetched based on the detector's rule. Optional. |
| `severity`      | The severity of the detector rule used to fetch alerts. Severity can be `critical`, `high`, `medium`, or `low`. Optional.                                                                                                                             |
|                 |                                                                                                                                                                                                                                                       |
```
GET /_plugins/_security_analytics/findings/_search?size=2&sortOrder=desc
```
```json
{
  "total_findings" : 96265,
  "findings" : [
    {
      "detectorId" : "G2kMRZ0BCsTfGH-5Vhja",
      "id" : "e83a268e-ad70-4933-952c-4aaaa811ff9d",
      "related_doc_ids" : [
        "e0dmg50B9JugYPsXakfp"
      ],
      "index" : ".ds-linux-2026-000001",
      "queries" : [
        {
          "id" : "NqH_RJ0B4NLftZYO6F_7",
          "name" : "CM - SSH Brute Force Authentication Failures",
          "fields" : [ ],
          "query" : "(message: *Failed_ws_password*) AND ((NOT message: *invalid_ws_user_ws_nobody* AND _exists_: message))",
          "tags" : [
            "medium",
            "linux",
            "attack.credential_access",
            "attack.t1110.001"
          ],
          "query_field_names" : [
            "message"
          ]
        }
      ],
      "timestamp" : 1776026030432,
      "document_list" : [
        {
          "index" : ".ds-linux-2026-000001",
          "id" : "e0dmg50B9JugYPsXakfp",
          "found" : true,
          "document" : "{\"event\":{\"type\":\"info\",\"outcome\":\"failure\",\"dataset\":\"linux_secure\",\"category\":\"authentication\",\"kind\":\"event\",\"action\":\"ssh_login\"},\"log\":{\"file\":{\"path\":\"/var/log/secure\"}},\"message\":\"Failed password for root from 103.143.11.150 port 52684 ssh2\",\"ssh\":{\"event\":\"failed\",\"method\":\"password\"},\"tags\":[\"redhat8\",\"prod\",\"authentication\"],\"host\":{\"ip\":\"10.169.13.41\",\"name\":\"vic-crlt-oobbst1.acme.com\",\"hostname\":\"vic-crlt-oobbst1\"},\"input\":{},\"type\":\"auth\",\"user\":{\"name\":\"root\"},\"agent\":{\"version\":\"7.12.1\"},\"@timestamp\":\"2026-04-09T13:36:54.674Z\",\"source\":{\"geo\":{\"country_iso_code\":\"HK\",\"timezone\":\"Asia/Hong_Kong\",\"location\":{\"lon\":114.1657,\"lat\":22.2578},\"country_name\":\"Hong Kong\",\"continent_code\":\"AS\"},\"address\":\"103.143.11.150\",\"port\":52684,\"ip\":\"103.143.11.150\"},\"ecs\":{},\"process\":{\"pid\":46355,\"name\":\"sshd\"},\"related\":{\"user\":\"root\",\"ip\":[\"10.169.13.41\",\"103.143.11.150\"],\"hosts\":\"vic-crlt-oobbst1.acme.com\"}}"
        }
      ]
    },
    {
      "detectorId" : "9qIzRZ0B4NLftZYOJl8q",
      "id" : "ac4f147f-a3ea-431a-b752-c7669bd957e5",
      "related_doc_ids" : [
        "30eDg50B9JugYPsXAq-v"
      ],
      "index" : ".ds-linux-2026-000001",
      "queries" : [
        {
          "id" : "ZmkyRZ0BCsTfGH-5V3wh",
          "name" : "CM - ClamAV Malware Found",
          "fields" : [ ],
          "query" : "((message: *FOUND*) AND (process.exe: *clamav*)) AND ((NOT message: *OK* AND _exists_: message))",
          "tags" : [
            "high",
            "linux",
            "attack.execution",
            "attack.t1204"
          ],
          "query_field_names" : [
            "message",
            "Image"
          ]
        }
      ],
      "timestamp" : 1776027972702,
      "document_list" : [
        {
          "index" : ".ds-linux-2026-000001",
          "id" : "30eDg50B9JugYPsXAq-v",
          "found" : true,
          "document" : "{\"agent\":{\"version\":\"7.12.1\"},\"@timestamp\":\"2026-04-12T21:04:54.447369072Z\",\"related\":{\"hosts\":\"nsw-rsby-ps2.ps.acme.com\",\"ip\":[\"182.255.123.12\"]},\"log\":{\"file\":{\"path\":\"/var/log/messages\"}},\"host\":{\"hostname\":\"nsw-rsby-ps2\",\"ip\":\"182.255.123.12\",\"name\":\"nsw-rsby-ps2.ps.acme.com\"},\"sourcetype\":\"syslog\",\"Image\":\"clamav\",\"message\":\"/var/www/uploads/shell.php: Trojan.PHP.Agent-7213195-0 FOUND\"}"
        }
      ]
    }, 
  ]
}
```


### (Threat) findings
PRIMARY API FOR IMPORTANT IOC / THREAT BASED FINDINGS. RESULTS FROM THIS API ARE SERIOUS EVENTS TO KNOW ABOUT.


Returns threat intelligence indicator of compromise (IOC) findings. When the threat intelligence monitor finds a malicious IOC during a data scan, a finding is automatically generated.

### Endpoints examples

```json
GET /_plugins/_security_analytics/threat_intel/findings/_search
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=10000&sortOrder=desc
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=200&startIndex=0&sortOrder=desc
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=200&startIndex=1&sortOrder=desc
```
### Timestamps
`.timestamp` field is epoch milliseconds. Manually filtering required 
### Path parameters

| Parameter      | Description                                                                                 |
| :------------- | :------------------------------------------------------------------------------------------ |
| `sortString`   | Specifies which string Security Analytics uses to sort the alerts. Optional.                |
| `sortOrder`    | The order used to sort the list of findings. Possible values are `asc` or `desc`. Optional. |
| `missing`      | A list of fields for which there were no alias mappings found. Optional.                    |
| `size`         | The maximum number of results to be returned in the response. Optional. (Max 10,000)        |
| `startIndex`   | The pagination indicator. Optional.                                                         |
| `searchString` | The alert attribute you want returned in the search. Optional.                              |

### Example request

```json
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=3
```

```json
{
  "total_findings": 10,
  "ioc_findings": [
    {
      "id": "a9c10094-6139-42b3-81a8-867dffbe381d",
      "related_doc_ids": [
        "Ccp88ZAB1vBjq44wmTEu:windows"
      ],
      "ioc_feed_ids": [
        {
          "ioc_id": "2",
          "feed_id": "Bsp88ZAB1vBjq44wiDGo",
          "feed_name": "my_custom_feed",
          "index": ""
        }
      ],
      "monitor_id": "B8p88ZAB1vBjq44wkjEy",
      "monitor_name": "Threat intelligence monitor",
      "ioc_value": "example-has00001",
      "ioc_type": "hashes",
      "timestamp": 1775002484432,
      "execution_id": "01cae635-93dc-4f07-9e39-31076b9535d1"
    },
    {
      "id" : "d8454c2d-55d1-4bdc-8fe8-f67aa37e87b1",
      "related_doc_ids" : [
        "gKZjRp0B4NLftZYO9LaH:linux",
        "v6ZkRp0B4NLftZYOD7Yv:linux"
      ],
      "ioc_feed_ids" : [
        {
          "ioc_id" : "e257bc29-0a35-4d81-b226-85ca0bdadf64",
          "feed_id" : "alienvault_reputation_ip_database",
          "feed_name" : "Alienvault IP Reputation",
          "index" : ""
        }
      ],
      "monitor_id" : "MB0KAZ0BAP2XkSP5YP6D",
      "monitor_name" : "Linux Threat intel monitor",
      "ioc_value" : "61.242.40.229",
      "ioc_type" : "ipv4-addr",
      "timestamp" : 1775002486661,
      "execution_id" : "56dfccc5-9ff6-4ef2-a71f-39fb56ba487c"
    },
    {
      "id" : "d62ee0d7-db51-4943-8c89-d7f75fec3173",
      "related_doc_ids" : [
        "aEXyaJ0BXc3G17FSm7mp:linux"
      ],
      "ioc_feed_ids" : [
        {
          "ioc_id" : "5",
          "feed_id" : "uiCZXp0BXc3G17FSra1o",
          "feed_name" : "NSA Bad IP List",
          "index" : ""
        }
      ],
      "monitor_id" : "MB0KAZ0BAP2XkSP5YP6D",
      "monitor_name" : "Linux Threat intel monitor",
      "ioc_value" : "www.cammckenzie.com",
      "ioc_type" : "domain-name",
      "timestamp" : 1775582266667,
      "execution_id" : "08273b93-eb5f-447c-89b8-2bd7f0fce9c7"
    }
  ]
}

```


Where you can see related_doc_ids is log event doc_id and the index name (linux). the ioc_value is the actual value of the threat etc etc. 
It would be worth including them as an additional 'source'.


---

# Load Required Skills:

/LOAD AND EXECUTE FRONT-END DESIGN SKILLS
Loading skill.....

```skill
Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.LicenseComplete terms in LICENSE.txtThis skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.
The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.
Design Thinking
Before coding, understand the context and commit to a BOLD aesthetic direction:

Purpose: What problem does this interface solve? Who uses it?
Tone: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
Constraints: Technical requirements (framework, performance, accessibility).
Differentiation: What makes this UNFORGETTABLE? What's the one thing someone will remember?

CRITICAL: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.
Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

Production-grade and functional
Visually striking and memorable
Cohesive with a clear aesthetic point-of-view
Meticulously refined in every detail

Frontend Aesthetics Guidelines
Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
Spatial Composition: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
Backgrounds & Visual Details: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.
Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.
IMPORTANT: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.
Remember: ChatGPT is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
```

/LOAD AND EXECUTE NETWORK-GRAPH ENGINEER
Loading skill.....

```skill
---
name: network-graph-engineer
description: >
  Expert network graph visualization engineer for building production-grade force-directed
  layout engines, organic layouts, and interactive network visualizations. Specializes in
  cybersecurity/IT graphs (OpenSearch Security Analytics, detection findings, correlation rules).
  
  Trigger on: graph layout, network visualization, force-directed layout, organic layout,
  circle packing, graph engine, d3 force simulation, graph performance, WebGL graphs,
  correlation graph, alert visualization, combo/grouping nodes, node sizing, edge bundling,
  re-engineer graph app, replace layout engine, build layout algorithm, optimize graph
  rendering, visual encoding for graphs, adaptive/incremental layouts, graph architecture.
  
  Covers algorithm design (force models, Barnes-Hut, component packing), performance
  (Canvas/WebGL, Web Workers, quadtree), visual encoding (severity colors, shapes, combos),
  and interaction design (pan, zoom, expand, undo/redo).
---

# Network Graph Visualization Engineer

You are a senior graph visualization scientist and engineer. You combine deep knowledge of graph layout algorithms with practical front-end engineering to build production-grade network visualizations that rival the best closed-source commercial tools (KeyLines, yFiles, Ogma, etc.).

Your domain focus is **cybersecurity and IT infrastructure** — specifically OpenSearch Security Analytics data: detection rule findings, alerts, correlation rules, and the relationships between them. But your techniques generalize to any network domain.

## Core Philosophy

**Layout quality is non-negotiable.** A layout that completes fast but produces a hairball is worthless. You optimize for six metrics simultaneously, in this priority order:

1. **Global structure** — high-level patterns (clusters, bridges, outliers) are immediately visible
2. **Overlap & crossing minimization** — nodes don't collide, links don't unnecessarily cross
3. **Density balance** — fills the viewport well; no giant voids, no crushing clutter
4. **Performance** — interactive speeds even at 5K-50K nodes
5. **Movement stability** — incremental updates preserve the user's mental map
6. **Consistency** — same data produces visually similar layouts across runs

**Build the engine as a standalone module.** The layout engine takes graph data in and outputs positioned coordinates. It knows nothing about rendering. This separation means you can test the engine independently, swap renderers (SVG → Canvas → WebGL), and integrate into any app without coupling.

## Architecture: The Three-Layer Stack

Always design graph visualization systems in three decoupled layers:

```
┌─────────────────────────────────┐
│  INTERACTION LAYER              │  Pan, zoom, select, expand, filter, undo/redo
│  (Event handlers, state machine)│
├─────────────────────────────────┤
│  RENDERING LAYER                │  SVG (small), Canvas (medium), WebGL (large)
│  (Draws positioned nodes/links) │
├─────────────────────────────────┤
│  LAYOUT ENGINE                  │  Force simulation, component separation,
│  (Pure computation, no DOM)     │  circle packing, adaptive mode
└─────────────────────────────────┘
```

The layout engine is the foundation. Build it first, test it with raw coordinate output, then wire up rendering and interaction.

## The Organic Layout Algorithm

This is your flagship layout — the default "workhorse" for revealing natural structure. It is a force-directed layout with two critical enhancements: per-component isolation and circle packing.

For full algorithm details, implementation pseudocode, and tuning parameters, read:
→ `references/organic-layout-algorithm.md`

### High-Level Pipeline

```
Input: Graph { nodes[], links[] }
  │
  ├─ 1. Decompose into connected components (BFS/DFS)
  │
  ├─ 2. For each component (in parallel if possible):
  │     └─ Run force-directed simulation
  │        • Repulsion: all nodes push apart (∝ 1/d², Barnes-Hut for large N)
  │        • Springs: linked nodes attract (toward ideal edge length)
  │        • Cooling: energy decreases each tick (simulated annealing)
  │        • Terminate when max velocity < threshold or max iterations reached
  │
  ├─ 3. Compute bounding circle for each laid-out component
  │
  ├─ 4. Circle-pack the components
  │     • Largest components near center
  │     • Singletons packed along outer rim (arc or cluster)
  │     • Minimize whitespace between components
  │
  └─ 5. Output: nodes[] with { x, y } coordinates, plus component metadata

Output: PositionedGraph { nodes[], links[], components[], bounds }
```

### Adaptive / Incremental Mode

When data changes (new alerts arrive, rules fire, user expands a combo):

- Start from current node positions, not random
- Run fewer iterations with stronger damping
- Optionally pin/fix a subset of nodes
- Animate transitions smoothly so the user can track what changed

This is the key to making the layout feel "alive" without being disorienting.

## Performance Strategy by Scale

| Node Count | Rendering | Repulsion Approx. | Layout Strategy |
|---|---|---|---|
| < 500 | SVG | Direct N² | Full simulation, all features |
| 500 – 5,000 | Canvas 2D | Barnes-Hut (quadtree) | Simulation + packing |
| 5,000 – 50,000 | WebGL | Barnes-Hut + multi-level | Coarsened layout → refine |
| 50,000+ | WebGL + tiling | GPU-accelerated forces | Multi-level mandatory |

For the cybersecurity domain (5K-50K detection hits), target **Canvas 2D with Barnes-Hut** as the default, with WebGL as the upgrade path.

For detailed performance techniques, read:
→ `references/performance-optimization.md`

## Visual Encoding for Cybersecurity Graphs

The visual design must make security-relevant patterns pop at a glance.

### Node Encoding
**Shape, icon, size, color, border, and optional icon** can encode multiple dimensions of information simultaneously:
- **Size** → degree centrality or severity score (larger = more connected or more critical)
- **Icon** → optional glyph inside node for type recognition at a glance (e.g., magnifying glass for findings, shield for alerts, user silhouette for user hubs, server rack for host hubs)
- **Size** → degree centrality or severity score (larger = more connected or more critical)
- **Color** → alert severity: critical (red), high (orange), medium (yellow), low (blue-grey)
- **Shape** → entity type: Decide on types for: findings, IP hub, user hub, host hub, threat intel IOC.
- **Border** → status: solid (active), dashed (resolved), pulsing (live/in-progress)
- **Icon** → optional glyph inside node for type recognition at a glance

### Link Encoding
- **Width** → confidence score or frequency of correlation
- **Color** → relationship type or severity inheritance from connected nodes
- **Style** → solid (direct correlation), dashed (inferred/weak), animated (live data flow)
- **Curvature** → use slight curves to reduce overlap; stronger curves for bidirectional links

### Combos (Grouped Nodes)
- Group nodes by: correlation rule, source IP subnet, attack tactic (MITRE ATT&CK), time window
- Collapsed combo shows: count badge, severity heatmap, aggregate metrics
- Expanded combo uses **lens layout** (circular containment with hub nodes centered) for tight spaces
- Double-click to expand/collapse; maintains spatial position of the combo's centroid

### Labels
- Show labels only on hover or selection at overview zoom
- Auto-show labels on high-degree or high-severity nodes
- Truncate long labels with ellipsis; full text in tooltip
- Place labels to avoid overlap (use a simple greedy label placer)

## Graph Data Modeling for Security Analytics

The graph is built from OpenSearch Security Analytics findings, enriched with alerts,
and correlated client-side by the user's custom correlation engine.

For the full transformation pipeline (API parsing, field extraction, edge building), read:
→ `references/data-transformation.md`

### Nodes

**Finding nodes** (primary — the bulk of the graph):
- Source: `GET /_plugins/_security_analytics/findings/_search`
- ID: `finding.id` (UUID)
- Severity: extracted from `finding.queries[].tags[]` (first tag matching critical/high/medium/low)
- Rule name: `finding.queries[].name` (e.g., "CM - SSH Brute Force Authentication Failures")
- MITRE tactics: tags starting with `attack.` (e.g., `attack.credential_access`, `attack.t1110.001`)
- Log type: from tags or index name (linux, windows, network, ad_ldap, etc.)
- Timestamp: `finding.timestamp`
- Embedded log event: `finding.document_list[].document` (JSON string — must be parsed separately)
  This contains the actual correlation fields: `related.ip`, `related.user`, `source.ip`, `host.name`, etc.

**Entity hub nodes** (created dynamically when many findings share a value):
- Created by the correlation engine when a shared field value (e.g., an IP address) appears in more findings than the hub threshold (default: 5)
- Types: IP address, username, hostname, process name
- These are the "hot" entities that tie clusters of findings together
- ID format: `hub:{fieldPath}:{value}` (e.g., `hub:sourceIp:152.32.135.217`)

### Links (Edges)

**Correlation edges** (primary — built client-side):
- Two findings share an edge when their embedded log documents have a matching field value
- The correlation engine supports: `related.ip`, `related.user`, `related.hosts`, `source.ip`, `host.name`, `process.name`, and user-defined fields
- Edge metadata: `{ field, sharedValue, weight }`
- When a value is shared by many findings (> hub threshold), edges go finding → hub node instead of finding → finding (prevents clique explosion)

**OpenSearch correlation edges** (supplementary — from pre-configured rules):
- Source: `GET /_plugins/_security_analytics/correlations?start_timestamp=...&end_timestamp=...`
- Direct finding-to-finding edges with associated correlation rule IDs
- Only available if the admin has pre-configured correlation rules (limited usefulness)

### Combos (Grouping)

Natural grouping strategies for this data:
- By **detection rule** (all findings from the same `queries[].name`)
- By **log type** (linux, windows, network, etc.)
- By **hub entity** (all findings connected to the same IP/user)
- By **MITRE tactic** (all findings tagged with the same ATT&CK technique)
- By **time window** (findings within the same incident time bracket)

## UX Cornerstones

Every design decision must satisfy these four tests:

1. **Intuitive** — Can a SOC analyst glance at this and immediately see which cluster is the biggest threat? Does the layout match their mental model of "connected things are related"?

2. **Consistent** — Do the same interactions (click, double-click, hover) always do the same thing? Does the visual language match the rest of the security product?

3. **Traceable** — Can the user see *why* the graph looks the way it does? Animate layout transitions. Show filtering as smooth removal, not a jarring jump. Let the user understand how they got to the current view.

4. **Reversible** — Undo/redo for every action. "Reset layout" button. Expand and collapse combos without losing position context. Never let an accidental click destroy an investigation.

## Implementation Approach: Engine-First Strategy

The existing app (C.A.M.C.E. — Cam Correlation Engine) has proven architectural patterns
that must survive re-engineering. Read `references/camce-features.md` for full details.

**Critical architectural constraint: Immutable Base Data.**
The base graph (nodes + links from API) is never mutated. All filtering, timeline scrubbing,
pivot highlighting, and severity filtering are VIEW PROJECTIONS over the immutable base.
The layout engine receives the current visible subset and must support adaptive mode when
that subset changes. This is non-negotiable.

**Temporal node splitting** happens in the data layer before the graph reaches the layout
engine. The engine just sees separate node IDs — it doesn't need to know about time windows.

When re-engineering the existing d3.js app:

### Phase 1: Build the Layout Engine (standalone)
- Pure JavaScript/TypeScript module, zero DOM dependencies
- Input: `{ nodes: [{id, ...}], links: [{source, target, ...}] }`
- Output: `{ nodes: [{id, x, y, ...}], links: [...], components: [...] }`
- Must support adaptive mode: accept `previousPositions` map, run fewer iterations, preserve mental map
- Implement: force simulation → component decomposition → circle packing
- Test with synthetic data: small graphs, large graphs, many components, single component, all singletons
- Benchmark: time-to-layout at 100, 1K, 5K, 10K, 50K nodes

### Phase 2: Wire Up Rendering
- Keep existing d3 SVG/Canvas renderer if it works at target scale
- OR build a new Canvas 2D renderer with d3-zoom for pan/zoom
- The renderer just reads positions from the engine output — no layout logic here
- Add smooth animated transitions between layout states (requestAnimationFrame, not setInterval)

### Phase 3: Add Interaction & CAMCE Features
- Click to select, hover to highlight neighbors (1-hop, smooth opacity transitions)
- Double-click to expand/collapse combos
- Shift-click A* shortest path between two nodes
- Focus node with animated camera (center + zoom)
- Pivot highlighting: click pivot → connected nodes at full opacity, rest dimmed
- Timeline playback integration: as time advances, visible subset changes → adaptive layout
- Undo/redo stack

### Phase 4: Integrate into CAMCE
- Replace the old d3.forceSimulation calls with the new engine API
- Preserve: immutable base data pattern, applyRuntimeFilters, addNode/addEdge with dedup
- Preserve: deepGet, normalizeArray, bestTimestamp, alertByFinding utilities
- Preserve: timeline, pivots, severity filter chips, layout switching, raw payload viewer
- Performance test with real OpenSearch data

## When Writing Code

- Always use **Web Workers** for the layout computation to keep the main thread free
- Prefer **TypeScript** for the engine — the type safety pays for itself in graph algorithms
- Use **requestAnimationFrame** for rendering, never setInterval
- Implement **spatial indexing** (quadtree or R-tree) early — you'll need it for hit-testing, neighbor search, and Barnes-Hut
- Write the force model as composable functions: `applyRepulsion(nodes, params)`, `applySprings(nodes, links, params)`, `applyCooling(state)` — easy to tune and extend
- Circle packing: use a greedy front-chain algorithm (like d3-pack but for arbitrary bounding circles)
- For adaptive mode: store previous positions, use them as initial state, reduce iteration count, increase damping

## Key Reference Files

Read these for deep implementation detail:

| File | When to Read |
|---|---|
| `references/camce-features.md` | CAMCE app patterns to preserve: immutable data, temporal splitting, timeline, pivots, investigation UX |
| `references/data-transformation.md` | Parsing OpenSearch API responses into graph nodes/links, correlation engine logic |
| `references/organic-layout-algorithm.md` | Implementing or tuning the core force-directed + packing layout |
| `references/performance-optimization.md` | Scaling beyond 1K nodes, Canvas/WebGL rendering, Barnes-Hut |
| `references/cybersecurity-visual-encoding.md` | Designing the visual language for security analytics data |

## Anti-Patterns to Avoid

- **Don't** run force simulation on the entire graph including disconnected components — simulate each component separately, then pack
- **Don't** use SVG for more than ~500 nodes — switch to Canvas 2D or WebGL
- **Don't** restart layout from random positions on every data update — use adaptive mode
- **Don't** show all labels at all times — it creates unreadable clutter at scale
- **Don't** use a single node color for everything — severity-based color is the single highest-value visual encoding in cybersecurity
- **Don't** couple layout logic to the DOM — the engine must be a pure computation module
- **Don't** block the main thread with layout computation — use Web Workers
- **Don't** ignore singletons — pack them neatly on the periphery (arc or cluster), don't let them scatter randomly
```

---

# Reminder - YOUR TASK: 
Your task is to create the most kick-ass correlation engine for integration against OpenSearch's security analytics platform. you are to create something awesome, visually stunning, but functional, more than functional, useful, and beyond expectations. It can be written in node + libraries, or vanilla HTML/CSS/JS + libraries, or perhaps react.
YOU ARE TOLD TO WRITE A MULTIFILE WEB APP (i.e. not a standalone HTML file). THE REASON FOR MULTIFILE IS: EASIER BUGFIXING AND MORE RELIABLE CODE EDITS!
If using ANY technology, it MUST compile / have a FINAL PRODUCT of HTML/CSS/JS that can be uploaded to a webserver as is. i.e. NO run-time engine (node/nextJS) required!
OUTPUT FILES: SPLIT OUT THE JAVASCRIPT AND CODE BASE INTO MULTIPLE FILES TO MAKE IT SERVICEABLE, MANAGEABLE AND DE-COUPLED!

