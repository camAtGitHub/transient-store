# AGENTS.md - Designv2

## INSTRUCTIONS:

# Your Task:
Create a correlation network graph application that integrates with OpenSearch Security Analytics findings APIs to provide an interactive and visually appealing correlation engine for cybersecurity and IT operations issues.

Familiarize yourself with how to request data from the APIs and the data format they return. Make interacting with the API easy for the user through filters, buttons, and input values that help the user hunt, search, and correlate on what they need.

The application must be portable HTML/CSS/JS (compiled or otherwise) that can run on any web server.

Correlation fields available in the data: related.domain, related.email, related.hosts, related.ip, related.user. Users should be able to input additional fields to correlate on. Consider incorporating @timestamps to animate and create a security story.

---

# Security Analytic (SA) Concepts
OpenSearch stores every log as a document with a document ID.

SA comes with preloaded sigma rules, known as detector rules, which define what to look for.
Threat detectors schedule those detector rules to run as searches every minute; each run may match documents.
Any matches create findings with detector information, tags, etc along with the document ID and the Document ID data retrieved in the finding.

Separately, threat intel feeds (IOC lists of IPs, hashes, domains) are downloaded and configured; they run saved searches against the same documents.
When an IOC hits, another finding event is created containing (threat) detector information, tags, etc along with the document ID, however it does NOT contain the actual Document ID data.

Thus both detector findings and threat intel findings contain related_doc_ids for their associated (triggering) log.

# Highlevel - how data intersects and overlaps across the API responses
Detector findings contain the findings[].document_list[].document field which contains escaped JSON. In that escaped JSON is the raw event data which matches the related doc IDs in the event.

The escaped JSON needs to be unescaped and passed as JSON for the finding, added to the event as additional attributes. From there correlation of the event data can be done using related.ip or whatever fields the user chooses to correlate on. By default it should probably be related.ip to begin with; adding too many correlating fields by default is not useful and just adds overhead.

# In memory data store design
For the security findings and IOC payloads, the recommended approach is a single normalized securityStore object.

Process the two input payloads separately but in one pass: first load and enrich the findings payload, parsing every document_list[].document string into a real object exactly once and storing it in a dedicated documentsById map; then load the IOC payload and, for each IOC, resolve its related_doc_ids against that same document map (stripping any optional ":index" suffix). Attach the resolved references as an array of lightweight objects on each enriched IOC so the relationship is immediately available without further lookup.

This normalized design eliminates data duplication, provides fast lookup time for any finding, document, or IOC by ID, and gracefully degrades when a related_doc_id points to something that wasn't loaded. It keeps memory footprint minimal, makes the store trivial to extend with secondary indexes later, and turns the enriched payloads into a ready-to-analyze dataset that supports pivot tables and statistical insights.

# Time range picker / filter
Configure a time range picker where the user can select either the absolute date range or relative to now (now = endTime) (eg, 4 hours ago, 1 day ago, 1 week ago, being the startTime, etc). Those dates should be configured to UTC timezone and in the Epoch milliseconds format. Detect the browser's timezone and use that to adjust to UTC.
Filter against the .timestamp field in the findings results.

# Pivots - statistically interesting fields or values

Consider using the following machine learning JavaScript libraries:

ML.Array.* - For statistical calculations: mean, median, mode, standardDeviation, variance, min, max.

Why it fits:
- count field values
- compute expected frequencies
- detect rare/unique values
- z-score or N standard deviations from normal
- compare current bucket vs historical bucket

This is ideal for:
- rare source.ip
- unusual user.name
- spikes in event.action=ssh_login
- rare host.name + message signature
- unusual number of Segmentation Fault messages on one host

ML.Distance / ML.distanceMatrix - These are useful for moving beyond raw counts.

Why they fit:
- turn each event into a feature vector
- compare one event to others
- score how different is this event from the rest?

This is good for:
- finding the odd log line in a batch
- detecting unusual field combinations
- grouping events that are almost the same except one field changed

For logs, this is often more useful than jumping straight to a classifier.

ML.KMeans - Good for finding common patterns and then flagging items far from cluster centers.

Why it fits:
- cluster normal event shapes
- detect small weird clusters
- detect singletons or events far from any normal cluster

Good examples:
- most auth failures cluster one way, but a few have unusual user/source/host combinations
- most apache errors cluster by module/message, but some are structurally different

ML.HClust - Very useful for exploration and show me families of related events.

Why it fits:
- helps you see near-duplicates vs outliers
- good when you do not know how many clusters exist
- useful for small-to-medium batches like 100-2000 events

This is often a better analyst tool than KMeans early on because it is easier to inspect.

ML.KNN - Useful as a simple local outlier detector once events are encoded numerically.

Why it fits:
- distance to nearest neighbors is a good anomaly score
- catches events that are weird relative to nearby patterns, not just globally rare

This is good for:
- one strange ssh failure among many normal ssh failures
- odd combinations that do not show up often

---

# Features that would make the best correlation engine app

The app should include features from multiple Proof of Concepts (POC). Include the best features from each POC.

Include a timeline feature allowing replaying of events, scrubbing back and forth, playback controls.

Include Pivots - statistically interesting fields or values, all calculated in browser, allowing clicking on the Pivots and nodes highlighted.

POC RESULTS:

POC 1 Strengths:
- Temporal node splitting - when the same entity reappears after the time window, it gets a new node instance (jsmith [Inst 2]). This is analytically powerful for attack chains that reuse the same credential in separate sessions.
- applyRuntimeFilters pattern - base data never mutated, all filtering is a view projection over baseNodes/baseLinks. Filters change, base stays.
- Animation frame-based playback that is smoother and properly cancellable.
- nodeVisibility/linkVisibility callbacks for temporal filtering without data mutation.
- Severity-colored edges (critical=red, high=amber) and directional particles on critical edges.
- focusNode with animated camera.
- Tab system in right panel (Pivots vs Telemetry) cleanly separates concerns.
- Top pivots with degree-based ranking and CRIT badge.

POC 2 Strengths:
- Best visual design.
- Most complete API integration: findings + alerts, proper auth headers.
- Strongest data model: addNode/addEdge with deduplication, weight/count accumulation, multi-timestamp tracking.
- deepGet utility handles dot-notation paths. normalizeArray correctly handles ECS array fields. bestTimestamp cascade across multiple timestamp fields.
- alertByFinding map for overlaying alert context on finding nodes.
- Shift-click shortest path between two nodes.
- Quick filter chips, layout switching, selection detail with adjacency table, raw payload viewer.

POC 3 Strengths:
- Animated edge particles (flow effect) that visually communicate active correlation paths.
- Node radius scales with connection count - encodes centrality without cluttering.
- Clickable legend with per-type counts for toggling visibility.
- 1-hop neighbor highlighting on search with smooth opacity transitions.
- Glow filter and grid pattern in the graph background.
- Canvas-based timeline bar with real time axis.
- Status indicator in topbar with colored dot (live/loading/error).

---

More ideas:

The correlation engine has many features:
- Connection and data inputs: username, password, host endpoint; credentials saved to browser persistent storage.
- Input fields / connection section - collapses or hides after successful connect.
- Time range picker - limit data to time range.
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
  - Easily enabled correlations + Pivot tables
  - Best complementary pairs:
    - related.user + related.hosts (lateral movement, account-to-host)
    - related.ip + temporal bridges (shared infrastructure over time)
    - document nodes + temporal bridges (storytelling)
    - co-occurrence mesh + custom fields (non-common schema pivots)
- Re-rendering without refetching: no re-fetch required to redraw
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

# API ENDPOINT information

## (Detector) Findings
Primary API for results of sigma rules running as detectors. Results vary in risk levels but help paint the security picture for the organisation.

### Endpoints examples
```
GET /_plugins/_security_analytics/findings/_search
GET /_plugins/_security_analytics/findings/_search?size=10000&sortOrder=desc
GET /_plugins/_security_analytics/findings/_search?size=200&startIndex=0&sortOrder=desc
GET /_plugins/_security_analytics/findings/_search?size=200&startIndex=1&sortOrder=desc
```

### Timestamps
.timestamp field is epoch milliseconds. Manual filtering required.

### Path Parameters

| Parameter       | Description                                                                                                                                                                                                                                           |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detector_id`   | The ID of the detector used to fetch alerts. Optional.                                                                                                                                                                                                |
| `detectorType`  | The type of detector used to fetch alerts. Optional.                                                                                                                                                                                                  |
| `sortOrder`     | The order used to sort the list of findings. Possible values are `asc` or `desc`. Optional.                                                                                                                                                           |
| `size`          | An optional limit for the maximum number of results returned in the response. Optional.                                                                                                                                                               |
| `startIndex`    | The pagination indicator. Optional.                                                                                                                                                                                                                   |
| `detectionType` | The detection rule type that dictates the retrieval type for the findings. When the detection type is `threat`, it fetches threat intelligence feeds. When the detection type is `rule`, findings are fetched based on the detector's rule. Optional. |
| `severity`      | The severity of the detector rule used to fetch alerts. Severity can be `critical`, `high`, `medium`, or `low`. Optional.                                                                                                                             |

### Example request
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
          "document" : "{\"event\":{\"type\":\"info\",\"outcome\":\"failure\",\"dataset\":\"linux_secure\",\"category\":\"authentication\",\"kind\":\"event\",\"action\":\"ssh_login\"},\"log\":{\"file\":{\"path\":\"/var/log/secure\"}},\"message\":\"Failed password for root from 103.143.11.150 port 52684 ssh2\",\"ssh\":{\"event\":\"failed\",\"method\":\"password\"},\"tags\":[\"redhat8\",\"prod\",\"authentication\"],\"host\":{\"ip\":\"10.169.13.41\",\"name\":\"vic-crlt-oobbst1.aarnet.net.au\",\"hostname\":\"vic-crlt-oobbst1\"},\"input\":{},\"type\":\"auth\",\"user\":{\"name\":\"root\"},\"agent\":{\"version\":\"7.12.1\"},\"@timestamp\":\"2026-04-09T13:36:54.674Z\",\"source\":{\"geo\":{\"country_iso_code\":\"HK\",\"timezone\":\"Asia/Hong_Kong\",\"location\":{\"lon\":114.1657,\"lat\":22.2578},\"country_name\":\"Hong Kong\",\"continent_code\":\"AS\"},\"address\":\"103.143.11.150\",\"port\":52684,\"ip\":\"103.143.11.150\"},\"ecs\":{},\"process\":{\"pid\":46355,\"name\":\"sshd\"},\"related\":{\"user\":\"root\",\"ip\":[\"10.169.13.41\",\"103.143.11.150\"],\"hosts\":\"vic-crlt-oobbst1.aarnet.net.au\"}}"
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
          "document" : "{\"agent\":{\"version\":\"7.12.1\"},\"@timestamp\":\"2026-04-12T21:04:54.447369072Z\",\"related\":{\"hosts\":\"nsw-rsby-ps2.ps.aarnet.net.au\",\"ip\":[\"182.255.123.12\"]},\"log\":{\"file\":{\"path\":\"/var/log/messages\"}},\"host\":{\"hostname\":\"nsw-rsby-ps2\",\"ip\":\"182.255.123.12\",\"name\":\"nsw-rsby-ps2.ps.aarnet.net.au\"},\"sourcetype\":\"syslog\",\"Image\":\"clamav\",\"message\":\"/var/www/uploads/shell.php: Trojan.PHP.Agent-7213195-0 FOUND\"}"
        }
      ]
    }
  ]
}
```

## (Threat) findings
Primary API for important IOC / threat based findings. Results from this API are serious events to know about.

Returns threat intelligence indicator of compromise (IOC) findings. When the threat intelligence monitor finds a malicious IOC during a data scan, a finding is automatically generated.

### Endpoints examples
```json
GET /_plugins/_security_analytics/threat_intel/findings/_search
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=10000&sortOrder=desc
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=200&startIndex=0&sortOrder=desc
GET /_plugins/_security_analytics/threat_intel/findings/_search?size=200&startIndex=1&sortOrder=desc
```

### Timestamps
.timestamp field is epoch milliseconds. Manual filtering required.

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
        "gKZjRp0B4NLftYO9LaH:linux",
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

The related_doc_ids contains the log event doc_id and the index name (linux). The ioc_value is the actual value of the threat. Include them as an additional source.

---

# Additional Data Sources

Free-form search: POST /_search with query_string queries
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"user.name: mirror +process.pid:3623680","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}]}}}`
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"$USER_INPUT_HERE$ ","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"now-1h"}}}]}}}` modify `now-1h` to match time range filter
  - eg. `{"query":{"bool":{"must":[{"query_string":{"query":"$USER_INPUT_HERE$ ","analyze_wildcard":true,"time_zone":"UTC"}}],"filter":[{"range":{"@timestamp":{"gte":"1776181210000"}}}]}}}` where `1776181210000` is the epoch milliseconds for the absolute time range filter

All three sources (detector findings, threat intel findings, free-form search) merge into unified graph. Supplemental hunt data adds to, never replaces, findings.
