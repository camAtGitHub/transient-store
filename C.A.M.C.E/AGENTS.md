

THINK HARD ABOUT THIS:

# Your Task:
 I want you to create the best CORRELATION GraphRenderer or GraphNode application that integrates with the OpenSearch Findings API to bring the user an interactive and comprehensive and visually appealing correlation engine for dealing with cyber security and IT ops issues. I have included the documentation for the findings API. You should familiarize yourself with how to both request data from it and that data format that returns back to you. You should make to make interacting with the API easy for the user, you should consider having be it filters or buttons or input values that adjust and help the user both hunt and search and correlate on what they need You can use whatever JavaScript libraries you deem fit. I have included a Python example, more so to help you understand how to interact with the API. But feel free to ignore it obviously and go in a completely different direction. additionally to what the python program has in it there are a number of fields for you to correlate on or against they all start with related and they are the following terms related.domain, related.email, related.hosts, related.ip, related.user. Perhaps having the user input to the web app additional fields to correlate on and have them animate and render in front of the user would be helpful as well. Possibly taking @timestamps into consideration to animate and create a security story would all so be helpful!
 
 
# Here is a list of features that would make the best correlation engine app in the world! (IMHO). If you have good ideas add them in too.

I should also mentioned the creation of My App (Called C.A.M.C.E (Cam Correlation Engine)) included the best features from 3 different Proof of Concepts (POC). I must include what the best parts were, to hopefully inspire and be included where needed (nothing forgotten).
Additionally C.A.M.C.E, includes a timeline feature allowing replaying of events etc, scrubbing back and forth. playback controls etc.
Other important parts in C.A.M.C.E are 'Pivots' statistically interesting fields or values, all calculated in browser, allowing clicking on the Pivots and nodes highlighted etc, again I'm starting to blur the lines between CAMCE and New Layout Engine!
RESULTS from POCs:
Strengths:
Best algorithm concept: temporal node splitting — when the same entity reappears after the time window, it gets a new node instance (jsmith [Inst 2]). This is analytically powerful for attack chains that reuse the same credential in separate sessions.
applyRuntimeFilters pattern — base data never mutated, all filtering is a view projection over baseNodes/baseLinks. Filters change, base stays. This is the right architecture.
requestAnimationFrame-based playback (smoother than setInterval, properly cancellable).
nodeVisibility/linkVisibility callbacks for temporal filtering without data mutation.
Severity-colored edges (critical=red, high=amber) and directional particles on critical edges.
focusNode with animated camera for both 2D (center+zoom) and 3D.
Tab system in right panel (Pivots vs Telemetry) cleanly separates concerns.
Top pivots with degree-based ranking and CRIT badge.
Strengths:
Best visual design of the three — gorgeous radial gradient background, glassmorphism panels, Bricolage Grotesque + Chakra Petch typography pairing. Everything looks intentional.
Most complete API integration: findings + alerts, proper auth headers, cURL snippet generator.
Strongest data model: addNode/addEdge with deduplication, weight/count accumulation, multi-timestamp tracking. This is production-grade.
deepGet utility handles dot-notation paths robustly. normalizeArray correctly handles ECS array fields. bestTimestamp cascade across @timestamp, event.created, winlog.time_created etc. is excellent.
alertByFinding map for overlaying alert context on finding nodes.
Shift-click A* shortest path between two nodes — genuinely useful investigation feature.
Quick filter chips, layout switching (fcose/concentric/breadthfirst/grid), selection detail with adjacency table, raw payload viewer.
Strengths: (weakest POC)
Animated edge particles (flow effect) that visually communicate active correlation paths.
Node radius scales with connection count — encodes centrality without cluttering.
Clickable legend with per-type counts for toggling visibility.
1-hop neighbor highlighting on search with smooth opacity transitions — the right UX.
SVG <defs> glow filter + grid pattern in the graph background — both great visual touches.
D3 canvas-based timeline bar (correct approach for a real time axis).
Status pill in topbar with coloured dot (live/demo/error).

---

More ideas while I remember:


The CAM correlation engine has so many features I haven’t even mentioned yet.
- Connection and data inputs: username, password, host endpoint; it connects and downloads the data.
- Findings query panel:
  - Shows all findings and retrieval details
  - Batch sizes, pagination index
  - Filter by detector type, severity, log type
  - Sorting options
- Correlation panel:
  - Checkboxes for default fields: related.domain, related.email, related.hosts, related.ip, related.user
  - Input boxes for additional fields like process.name
  - Story window in minutes (temporal bridge threshold, rolling window size)
  - Max co-occurrence values for max edges
  - Toggle node types: finding nodes, document nodes, detector query/tag context
  - Advanced options:
    - Build entity co-occurrence mesh for relationship discovery
    - Build temporal bridges between nearby sightings (node-to-node within story windows)
- Toggle findings off, alert results on
- Sliding story windows for correlation distance
- Pivot tables: statistical outliers, rare results
- Hunt section:
  - Label nodes
  - Saved to browser persistent storage
  - Export/import capability
    - export full state
    - export PNG
    - import full state
- Graph defaults:
  - Easily enabled correlations
  - Best complementary pairs:
    - related.user + related.hosts (lateral movement, account-to-host)
    - related.ip + temporal bridges (shared infrastructure over time)
    - document nodes + temporal bridges (storytelling)
    - co-occurrence mesh + custom fields (non-common schema pivots)
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
- Raw payload panels: view raw data powering each node

---

# Findings API Documentation

---
layout: default
title: Alerts and findings APIs
parent: API tools
nav_order: 50
---


# Alerts and findings APIs

The following APIs can be used for tasks related to alerts and findings.

---

## Get alerts

Provides an option for retrieving alerts related to a specific detector type or detector ID.

### Parameters

You can specify the following parameters when requesting an alert.

Parameter | Description 
:--- | :---
`detector_id` | The ID of the detector used to fetch alerts. Optional when the `detectorType` is specified. Otherwise required.
`detectorType` | The type of detector used to fetch alerts. Optional when the `detector_Id` is specified. Otherwise required.
`severityLevel` | Used to filter by alert severity level. Optional.
`alertState` | Used to filter by alert state. Possible values are ACTIVE, ACKNOWLEDGED, COMPLETED, ERROR, or DELETED. Optional.
`sortString` | This field specifies which string Security Analytics uses to sort the alerts. Optional.
`sortOrder` | The order used to sort the list of findings. Possible values are `asc` or `desc`. Optional.
`missing` | A list of fields for which there are no found alias mappings. Optional.
`size` | An optional limit for the maximum number of results returned in the response. Optional.
`startIndex` | The pagination indicator. Optional.
`searchString` | The alert attribute you want returned in the search. Optional.

### Example request

```json
GET /_plugins/_security_analytics/alerts?detectorType=windows
```

### Example response

```json
{
    "alerts": [{
        "detector_id": "detector_12345",
        "id": "alert_id_1",
        "version": -3,
        "schema_version": 0,
        "trigger_id": "trigger_id_1",
        "trigger_name": "my_trigger",
        "finding_ids": ["finding_id_1"],
        "related_doc_ids": ["docId1"],
        "state": "ACTIVE",
        "error_message": null,
        "alert_history": [],
        "severity": null,
        "action_execution_results": [{
            "action_id": "action_id_1",
            "last_execution_time": 1665693544996,
            "throttled_count": 0
        }],
        "start_time": "2022-10-13T20:39:04.995023Z",
        "last_notification_time": "2022-10-13T20:39:04.995028Z",
        "end_time": "2022-10-13T20:39:04.995027Z",
        "acknowledged_time": "2022-10-13T20:39:04.995028Z"
    }],
    "total_alerts": 1,
    "detectorType": "windows"
}
```

#### Response body fields

Alerts persist until you resolve the root cause and have the following states:

State | Description
:--- | :---
`ACTIVE` | The alert is ongoing and unacknowledged. Alerts remain in this state until you acknowledge them, delete the trigger associated with the alert, or delete the monitor entirely.
`ACKNOWLEDGED` | Someone has acknowledged the alert but not fixed the root cause.
`COMPLETED` | The alert is no longer ongoing. Alerts enter this state after the corresponding trigger evaluates to false.
`ERROR` | An error occurred while executing the trigger. This error is usually the result of a bad trigger or destination.
`DELETED` | Someone deleted the detector or trigger associated with this alert while the alert was ongoing.

---

## Acknowledge alerts

Sends an acknowledgement when an alert is triggered.

### Example request

```json
POST /_plugins/_security_analytics/detectors/<detector_id>/_acknowledge/alerts

{"alerts":["4dc7f5a9-2c82-4786-81ca-433a209d5205"]}
```

### Example response

```json
{
  "acknowledged": [
    {
      "detector_id": "8YT5fYQBZ8IUM4axics6",
      "id": "4dc7f5a9-2c82-4786-81ca-433a209d5205",
      "version": 1,
      "schema_version": 4,
      "trigger_id": "1TP5fYQBMkkIGY6Pg-q8",
      "trigger_name": "test-trigger",
      "finding_ids": [
        "2e167f4b-8063-40ef-80f8-2afd9bf095b8"
      ],
      "related_doc_ids": [
        "1|windows"
      ],
      "state": "ACTIVE",
      "error_message": null,
      "alert_history": [],
      "severity": "1",
      "action_execution_results": [
        {
          "action_id": "BopdoIJKXd",
          "last_execution_time": 1668560817925,
          "throttled_count": 0
        }
      ],
      "start_time": "2022-11-16T01:06:57.748Z",
      "last_notification_time": "2022-11-16T01:06:57.748Z",
      "end_time": null,
      "acknowledged_time": null
    }
  ],
  "failed": [],
  "missing": []
}
```

---

## Get findings

The Get Findings API returns findings based on the detector attributes.

### Parameters

You can specify the following parameters when getting findings.

Parameter | Description 
:--- | :---
`detector_id` | The ID of the detector used to fetch alerts. Optional.
`detectorType` | The type of detector used to fetch alerts. Optional.
`sortOrder` | The order used to sort the list of findings. Possible values are `asc` or `desc`. Optional.
`size` | An optional limit for the maximum number of results returned in the response. Optional.
`startIndex` | The pagination indicator. Optional.
`detectionType` |  The detection rule type that dictates the retrieval type for the findings. When the detection type is `threat`, it fetches threat intelligence feeds. When the detection type is `rule`, findings are fetched based on the detector's rule. Optional.
`severity` |  The severity of the detector rule used to fetch alerts. Severity can be `critical`, `high`, `medium`, or `low`. Optional.

### Example request

```json
GET /_plugins/_security_analytics/findings/_search
{
  "total_findings": 2,
  "findings": [
    {
      "detectorId": "b9ZN040Bjlggkcgx1d1W",
      "id": "35efb736-c5d9-499d-b9b5-31f0a7d61251",
      "related_doc_ids": [
        "1"
      ],
      "index": "smallidx",
      "queries": [
        {
          "id": "QdZN040Bjlggkcgxdd3X",
          "name": "QdZN040Bjlggkcgxdd3X",
          "fields": [],
          "query": "field1: *value1*",
          "tags": [
            "high",
            "ad_ldap"
          ]
        }
      ],
      "timestamp": 1708647166500,
      "document_list": [
        {
          "index": "smallidx",
          "id": "1",
          "found": true,
          "document": "{\n  \"field1\": \"value1\"\n}\n"
        }
      ]
    },
    {
      "detectorId": "O9ZM040Bjlggkcgx6N1S",
      "id": "a5022930-4503-4ca8-bf0a-320a2b1fb433",
      "related_doc_ids": [
        "1"
      ],
      "index": "smallidx",
      "queries": [
        {
          "id": "KtZM040Bjlggkcgxkd04",
          "name": "KtZM040Bjlggkcgxkd04",
          "fields": [],
          "query": "field1: *value1*",
          "tags": [
            "critical",
            "ad_ldap"
          ]
        }
      ],
      "timestamp": 1708647166500,
      "document_list": [
        {
          "index": "smallidx",
          "id": "1",
          "found": true,
          "document": "{\n  \"field1\": \"value1\"\n}\n"
        }
      ]
    }
  ]
}

```

```json
GET /_plugins/_security_analytics/findings/_search?severity=high
{
    "total_findings": 1,
    "findings": [
        {
            "detectorId": "b9ZN040Bjlggkcgx1d1W",
            "id": "35efb736-c5d9-499d-b9b5-31f0a7d61251",
            "related_doc_ids": [
                "1"
            ],
            "index": "smallidx",
            "queries": [
                {
                    "id": "QdZN040Bjlggkcgxdd3X",
                    "name": "QdZN040Bjlggkcgxdd3X",
                    "fields": [],
                    "query": "field1: *value1*",
                    "tags": [
                        "high",
                        "ad_ldap"
                    ]
                }
            ],
            "timestamp": 1708647166500,
            "document_list": [
                {
                    "index": "smallidx",
                    "id": "1",
                    "found": true,
                    "document": "{\n  \"field1\": \"value1\"\n}\n"
                }
            ]
        }
    ]
}
        
```

```json
GET /_plugins/_security_analytics/findings/_search?detectionType=rule
{
    "total_findings": 2,
    "findings": [
        {
            "detectorId": "b9ZN040Bjlggkcgx1d1W",
            "id": "35efb736-c5d9-499d-b9b5-31f0a7d61251",
            "related_doc_ids": [
                "1"
            ],
            "index": "smallidx",
            "queries": [
                {
                    "id": "QdZN040Bjlggkcgxdd3X",
                    "name": "QdZN040Bjlggkcgxdd3X",
                    "fields": [],
                    "query": "field1: *value1*",
                    "tags": [
                        "high",
                        "ad_ldap"
                    ]
                }
            ],
            "timestamp": 1708647166500,
            "document_list": [
                {
                    "index": "smallidx",
                    "id": "1",
                    "found": true,
                    "document": "{\n  \"field1\": \"value1\"\n}\n"
                }
            ]
        },
        {
            "detectorId": "O9ZM040Bjlggkcgx6N1S",
            "id": "a5022930-4503-4ca8-bf0a-320a2b1fb433",
            "related_doc_ids": [
                "1"
            ],
            "index": "smallidx",
            "queries": [
                {
                    "id": "KtZM040Bjlggkcgxkd04",
                    "name": "KtZM040Bjlggkcgxkd04",
                    "fields": [],
                    "query": "field1: *value1*",
                    "tags": [
                        "critical",
                        "ad_ldap"
                    ]
                }
            ],
            "timestamp": 1708647166500,
            "document_list": [
                {
                    "index": "smallidx",
                    "id": "1",
                    "found": true,
                    "document": "{\n  \"field1\": \"value1\"\n}\n"
                }
            ]
        }
    ]
}


```
```json
GET /_plugins/_security_analytics/findings/_search?detectionType=rule&severity=high
{
    "total_findings": 1,
    "findings": [
        {
            "detectorId": "b9ZN040Bjlggkcgx1d1W",
            "id": "35efb736-c5d9-499d-b9b5-31f0a7d61251",
            "related_doc_ids": [
                "1"
            ],
            "index": "smallidx",
            "queries": [
                {
                    "id": "QdZN040Bjlggkcgxdd3X",
                    "name": "QdZN040Bjlggkcgxdd3X",
                    "fields": [],
                    "query": "field1: *value1*",
                    "tags": [
                        "high",
                        "ad_ldap"
                    ]
                }
            ],
            "timestamp": 1708647166500,
            "document_list": [
                {
                    "index": "smallidx",
                    "id": "1",
                    "found": true,
                    "document": "{\n  \"field1\": \"value1\"\n}\n"
                }
            ]
        }
    ]
}
        
```

```json
GET /_plugins/_security_analytics/findings/_search?*detectorType*=
{
    "total_findings":2,
    "findings":[
       {
            "detectorId":"12345",
            "id":"2b9663f4-ae77-4df8-b84f-688a0195723b",
            "related_doc_ids":[
                "5"
            ],
            "index":"sbwhrzgdlg",
            "queries":[
                {
                    "id":"f1bff160-587b-4500-b60c-ab22c7abc652",
                    "name":"3",
                    "query":"test_field:\"us-west-2\"",
                    "tags":[
                        
                    ]
                }
            ],
            "timestamp":1664401088804,
            "document_list":[
                {
                    "index":"sbwhrzgdlg",
                    "id":"5",
                    "found":true,
                    "document":"{\n            \"message\" : \"This is an error from IAD region\",\n            \"test_strict_date_time\" : \"2022-09-28T21:38:02.888Z\",\n            \"test_field\" : \"us-west-2\"\n        }"
                }
            ]
        },
        {
            "detectorId":"12345",
            "id":"f43a2701-0ef5-4931-8254-bdf510f73952",
            "related_doc_ids":[
                "1"
            ],
            "index":"sbwhrzgdlg",
            "queries":[
                {
                    "id":"f1bff160-587b-4500-b60c-ab22c7abc652",
                    "name":"3",
                    "query":"test_field:\"us-west-2\"",
                    "tags":[
                        
                    ]
                }
            ],
            "timestamp":1664401088746,
            "document_list":[
                {
                    "index":"sbwhrzgdlg",
                    "id":"1",
                    "found":true,
                    "document":"{\n            \"message\" : \"This is an error from IAD region\",\n            \"test_strict_date_time\" : \"2022-09-28T21:38:02.888Z\",\n            \"test_field\" : \"us-west-2\"\n        }"
                }
            ]
        }
    ]
}
```

`GET /_plugins/_security_analytics/threat_intel/findings/_search?sortOrder=desc&size=10000&startIndex=0&startTime=1775228979000&endTime=1776401779960&size=2`   (limiting returned results to only 2)

```
{
  "total_findings" : 60,
  "ioc_findings" : [
    {
      "id" : "3bb5b8cf-13ca-4ab9-b53a-fcf839c565cf",
      "related_doc_ids" : [
        "OCCcXp0BXc3G17FS87r9:linux"
      ],
      "ioc_feed_ids" : [
        {
          "ioc_id" : "ac445c78-76c4-4c74-beaa-3b7350679806",
          "feed_id" : "alienvault_reputation_ip_database",
          "feed_name" : "Alienvault IP Reputation",
          "index" : ""
        }
      ],
      "monitor_id" : "MB0KAZ0BAP2XkSP5YP6D",
      "monitor_name" : "Linux Threat intel monitor",
      "ioc_value" : "211.47.83.200",
      "ioc_type" : "ipv4-addr",
      "timestamp" : 1775408866660,
      "execution_id" : "ab6695a2-9712-42fb-b562-c03235f8cb73"
    },
    {
      "id" : "cfc4e1a1-f0f1-431a-9a30-82b7497d6f4e",
      "related_doc_ids" : [
        "OCCcXp0BXc3G17FS87r9:linux"
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
      "timestamp" : 1775408866660,
      "execution_id" : "d465a20c-4a6a-4fd2-8b32-c235aadb34e6"
    }
  ]
}
```


Where you can see related_doc_ids is log event doc_id and the index name (linux). the ioc_value is the actual value of the threat etc etc. 
It would be worth including them as an additional 'source', but again I'm not sure how much of this information is more useful towards 'MY-APP', which already utilises it.


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


# Very basic working example (feel free to ignore and not use!)

```
import requests
import json
import networkx as nx
from pyvis.network import Network
from getpass import getpass
import warnings
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# ========================= CONFIG =========================
print("=== OpenSearch Findings API Graph Builder ===\n")

HOST = input("OpenSearch endpoint (e.g. https://your-opensearch:9200): ").strip() or "http://localhost:9200"
USERNAME = input("Username: ").strip()
PASSWORD = getpass("Password: ")

# Optional filters (press Enter for defaults)
SIZE = input("Max findings to fetch (default 50): ").strip() or "50"
DETECTOR_ID = input("Filter by detector_id (optional): ").strip() or None
SEVERITY = input("Filter by severity (critical/high/medium/low, optional): ").strip() or None
# =======================================================

print(f"\nFetching up to {SIZE} findings...")

url = f"{HOST}/_plugins/_security_analytics/findings/_search"

params = {
    "size": int(SIZE),
    "sortOrder": "desc"
}
if DETECTOR_ID:
    params["detector_id"] = DETECTOR_ID
if SEVERITY:
    params["severity"] = SEVERITY

try:
    resp = requests.get(
        url,
        auth=(USERNAME, PASSWORD),
        params=params,
        verify=False,          # change to True if you have valid cert
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
except Exception as e:
    print(f"Error calling API: {e}")
    exit(1)

findings = data.get("findings", [])
print(f"Received {len(findings)} findings (total available: {data.get('total_findings', 0)})")

# ========================= BUILD GRAPH =========================
G = nx.Graph()

entity_count = 0
edge_count = 0

for finding in findings:
    finding_id = finding.get("id", "unknown")
    for doc_entry in finding.get("document_list", []):
        doc_str = doc_entry.get("document")
        if not doc_str:
            continue
        try:
            doc = json.loads(doc_str)
        except json.JSONDecodeError:
            continue

        # Pull ECS-style related fields (handles string or list)
        related = doc.get("related", {})
        
        users = related.get("user") or []
        if isinstance(users, str):
            users = [users]
        ips = related.get("ip") or []
        if isinstance(ips, str):
            ips = [ips]
        emails = related.get("email") or []
        if isinstance(emails, str):
            emails = [emails]

        # Add nodes with type for coloring
        for u in users:
            if u:
                G.add_node(u, type="user", label=f"👤 {u}", title=f"User: {u}\nFinding: {finding_id}")
                entity_count += 1
        for ip in ips:
            if ip:
                G.add_node(ip, type="ip", label=f"🌐 {ip}", title=f"IP: {ip}\nFinding: {finding_id}")
                entity_count += 1
        for e in emails:
            if e:
                G.add_node(e, type="email", label=f"✉️ {e}", title=f"Email: {e}\nFinding: {finding_id}")
                entity_count += 1

        # Connect entities that appear together in this document/finding
        for u in users:
            for ip in ips:
                if u and ip:
                    G.add_edge(u, ip, title=f"Co-occur in finding {finding_id}")
                    edge_count += 1
            for e in emails:
                if u and e:
                    G.add_edge(u, e, title=f"Co-occur in finding {finding_id}")
                    edge_count += 1
        for ip in ips:
            for e in emails:
                if ip and e:
                    G.add_edge(ip, e, title=f"Co-occur in finding {finding_id}")
                    edge_count += 1

print(f"\nGraph built — {entity_count} entities, {edge_count} relationships")


# ========================= VISUALISE (interactive) =========================
net = Network(
    height="900px", 
    width="100%", 
    directed=False, 
    notebook=False,
    cdn_resources='local'   # 'remote' also works if you have internet
)

net.from_nx(G)

# Nice styling
net.set_options("""
{
  "nodes": {
    "font": {"size": 14},
    "scaling": {"min": 10, "max": 30}
  },
  "edges": {
    "color": {"inherit": true},
    "smooth": false
  },
  "physics": {
    "forceAtlas2Based": {"gravitationalConstant": -50},
    "solver": "forceAtlas2Based",
    "timestep": 0.35
  }
}
""")

# Color by type
for node in net.nodes:
    t = G.nodes[node["id"]].get("type", "")
    if t == "user":
        node["color"] = "#4A90E2"
    elif t == "ip":
        node["color"] = "#E24A4A"
    elif t == "email":
        node["color"] = "#4AE24A"

net.show("security_findings_relationship_graph.html", notebook=False)
print("\n✅ Interactive graph saved as security_findings_relationship_graph.html")
print("   Open it in your browser — zoom, hover, drag nodes!")

```

---

# Reminder - YOUR TASK: 
Your task is to create the most kick-ass correlation engine for integration against OpenSearch's security analytics platform. you are to create something awesome, visually stunning, but functional, more than functional, useful, and beyond expectations. it should either exist as an all-in-one HTML file or if you find the need to use node libraries and npm placed code. Just ensure that the final deliverable will compile a static HTML file.

IF /C.A.M.C.E/TODO.md EXISTS THEN YOU MUST READ THAT FILE NEXT, AS IT WILL CONTAIN YOUR CURRENT PROGRESS! SO READ IT AND CONTINUE WHERE YOU LEFT OFF FROM!
 