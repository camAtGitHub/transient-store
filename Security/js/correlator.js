import { inRange } from './store.js';

const get = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
const asArray = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);

function addEdge(edgeMap, a, b, meta) {
  if (a === b) return;
  const [s, t] = a < b ? [a, b] : [b, a];
  const key = `${s}|${t}|${meta.kind}`;
  const prev = edgeMap.get(key);
  if (prev) prev.weight += meta.weight || 1;
  else edgeMap.set(key, { source: s, target: t, weight: meta.weight || 1, ...meta });
}

export function buildGraphFromStore(store, cfg, timeRange) {
  const nodes = new Map();
  const valueToFindings = new Map();
  const edgeMap = new Map();
  const findings = [...store.findingsById.values()].filter((f) => inRange(f.ts, timeRange));

  for (const f of findings) {
    nodes.set(`finding:${f.id}`, {
      id: `finding:${f.id}`,
      type: 'finding',
      label: f.queries?.[0]?.name || f.id,
      severity: f.severity,
      ts: f.ts,
      raw: f,
      pinned: false,
    });

    const doc = f.docs?.[0]?.doc || {};
    const fields = [...cfg.fields, ...cfg.customFields].filter(Boolean);
    for (const field of fields) {
      for (const value of asArray(get(doc, field))) {
        if (value == null || value === '') continue;
        const key = `${field}:${String(value).toLowerCase()}`;
        if (!valueToFindings.has(key)) valueToFindings.set(key, []);
        valueToFindings.get(key).push({ findingId: f.id, field, value, ts: f.ts });
      }
    }
  }

  for (const [key, occurrences] of valueToFindings.entries()) {
    if (occurrences.length >= cfg.hubThreshold) {
      const [field, val] = key.split(':');
      const hubId = `hub:${field}:${val}`;
      nodes.set(hubId, { id: hubId, type: 'hub', label: `${field}=${val}`, severity: 'medium', ts: Math.min(...occurrences.map((o) => o.ts)), raw: { field, val } });
      for (const o of occurrences) addEdge(edgeMap, `finding:${o.findingId}`, hubId, { kind: 'hub', field: o.field, shared: o.value, inferred: false });
    } else {
      for (let i = 0; i < occurrences.length; i++) {
        for (let j = i + 1; j < occurrences.length; j++) {
          addEdge(edgeMap, `finding:${occurrences[i].findingId}`, `finding:${occurrences[j].findingId}`, {
            kind: 'cooccur', field: occurrences[i].field, shared: occurrences[i].value, inferred: false,
          });
        }
      }
    }

    const sorted = occurrences.slice().sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].ts - sorted[i - 1].ts <= cfg.storyWindowMinutes * 60 * 1000) {
        addEdge(edgeMap, `finding:${sorted[i - 1].findingId}`, `finding:${sorted[i].findingId}`, {
          kind: 'temporal', field: sorted[i].field, shared: sorted[i].value, inferred: true, weight: 0.5,
        });
      }
    }
  }

  for (const t of store.threatsById.values()) {
    if (!inRange(t.ts, timeRange)) continue;
    const id = `threat:${t.id}`;
    nodes.set(id, { id, type: 'threat', label: t.threat_type || 'IOC hit', severity: 'critical', ts: t.ts, raw: t });
    for (const ref of t.refs) {
      for (const f of findings) if (f.related_doc_ids?.includes(ref.id)) addEdge(edgeMap, id, `finding:${f.id}`, { kind: 'ioc', inferred: false });
    }
  }

  const nodeList = [...nodes.values()];
  const links = [...edgeMap.values()];

  const degree = new Map(nodeList.map((n) => [n.id, 0]));
  for (const e of links) { degree.set(e.source, (degree.get(e.source) || 0) + 1); degree.set(e.target, (degree.get(e.target) || 0) + 1); }
  for (const n of nodeList) n.degree = degree.get(n.id) || 0;

  const p95 = nodeList.map((n) => n.degree).sort((a,b)=>a-b)[Math.floor(nodeList.length*0.95)] || 1;
  for (const n of nodeList) n.centrality = n.degree / Math.max(1, p95);

  return { nodes: nodeList, links };
}

export function applyRuntimeFilters(graph, ui) {
  const endTs = Math.min(...graph.nodes.map((n) => n.ts)) + (Math.max(...graph.nodes.map((n) => n.ts)) - Math.min(...graph.nodes.map((n) => n.ts))) * (ui.timelinePercent / 100);
  const allowed = new Set(graph.nodes.filter((n) => n.ts <= endTs && (!ui.highRiskOnly || n.severity === 'high' || n.severity === 'critical')).map((n) => n.id));
  const nodes = graph.nodes.filter((n) => allowed.has(n.id));
  const links = graph.links.filter((e) => allowed.has(e.source) && allowed.has(e.target));
  return { nodes, links };
}

export function shortestPath(graph, start, end) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.links) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const q = [start];
  const prev = new Map([[start, null]]);
  while (q.length) {
    const cur = q.shift();
    if (cur === end) break;
    for (const nxt of (adj.get(cur) || [])) if (!prev.has(nxt)) { prev.set(nxt, cur); q.push(nxt); }
  }
  if (!prev.has(end)) return [];
  const path = [];
  for (let x = end; x != null; x = prev.get(x)) path.push(x);
  return path.reverse();
}
