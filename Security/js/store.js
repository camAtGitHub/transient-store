import { deepGet, normalizeArray, severityFromTags } from './utils.js';

export function buildSecurityStore(findingsPayload = {}, iocPayload = {}) {
  const store = {
    findingsById: new Map(),
    documentsById: new Map(),
    iocsById: new Map(),
    findings: [],
    iocs: [],
  };

  const findings = findingsPayload.findings || [];
  for (const finding of findings) {
    const parsedDocs = (finding.document_list || []).map((doc) => {
      const parsed = safelyParse(doc.document);
      const cleanId = String(doc.id || '').split(':')[0];
      const enriched = { ...doc, parsed, cleanId };
      store.documentsById.set(cleanId, enriched);
      return enriched;
    });
    const severity = severityFromTags((finding.queries || []).flatMap((q) => q.tags || []));
    const enrichedFinding = { ...finding, parsedDocs, severity };
    store.findingsById.set(finding.id, enrichedFinding);
    store.findings.push(enrichedFinding);
  }

  const iocs = iocPayload.findings || iocPayload.threat_intel_findings || [];
  for (const item of iocs) {
    const related = normalizeArray(item.related_doc_ids).map((id) => String(id).split(':')[0]);
    const resolvedDocs = related.map((id) => store.documentsById.get(id)).filter(Boolean);
    const enriched = { ...item, resolvedDocs, severity: item.severity || 'high' };
    store.iocsById.set(item.id || `ioc-${store.iocs.length}`, enriched);
    store.iocs.push(enriched);
  }

  return store;
}

export function buildGraphFromStore(store, options) {
  const {
    correlateFields,
    storyWindowMinutes,
    noiseFloor,
    hubThreshold,
    timeStart,
    timeEnd,
  } = options;

  const nodes = new Map();
  const edges = new Map();
  const valueIndex = new Map();

  for (const finding of store.findings) {
    if (finding.timestamp < timeStart || finding.timestamp > timeEnd) continue;
    nodes.set(finding.id, {
      id: finding.id,
      type: 'finding',
      label: finding.queries?.[0]?.name || finding.id,
      severity: finding.severity,
      timestamp: finding.timestamp,
      raw: finding,
      degree: 0,
    });

    for (const doc of finding.parsedDocs) {
      for (const field of correlateFields) {
        const vals = normalizeArray(deepGet(doc.parsed, field));
        for (const val of vals) {
          if (val == null || val === '') continue;
          const key = `${field}:${String(val).toLowerCase()}`;
          if (!valueIndex.has(key)) valueIndex.set(key, []);
          valueIndex.get(key).push({ findingId: finding.id, ts: finding.timestamp, field, value: String(val) });
        }
      }
    }
  }

  for (const [key, sightings] of valueIndex.entries()) {
    if (sightings.length < 2) continue;
    if (sightings.length >= hubThreshold) {
      const hubId = `hub:${key}`;
      const [field, value] = key.split(':');
      nodes.set(hubId, {
        id: hubId,
        type: 'hub',
        label: `${field}=${value}`,
        severity: 'medium',
        timestamp: Math.min(...sightings.map((s) => s.ts)),
        raw: { sightings },
        degree: 0,
      });
      for (const s of sightings) addEdge(edges, s.findingId, hubId, 1, { field: s.field, value: s.value, inferred: true });
      continue;
    }

    sightings.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < sightings.length; i++) {
      for (let j = i + 1; j < sightings.length; j++) {
        const gapMin = Math.abs(sightings[j].ts - sightings[i].ts) / 60000;
        if (gapMin > storyWindowMinutes) continue;
        addEdge(edges, sightings[i].findingId, sightings[j].findingId, 1, { field: sightings[i].field, value: sightings[i].value, inferred: false });
      }
    }
  }

  const finalEdges = [];
  for (const edge of edges.values()) {
    if (edge.weight < noiseFloor) continue;
    finalEdges.push(edge);
    nodes.get(edge.source).degree += edge.weight;
    nodes.get(edge.target).degree += edge.weight;
  }

  const finalNodes = Array.from(nodes.values());
  const maxDegree = Math.max(...finalNodes.map((n) => n.degree), 1);
  for (const n of finalNodes) {
    n.centrality = n.degree / maxDegree;
    n.radius = 3 + Math.sqrt(n.degree + 1) * 2;
  }

  return { nodes: finalNodes, edges: finalEdges };
}

function addEdge(edgeMap, a, b, weight = 1, meta = {}) {
  if (a === b) return;
  const [s, t] = a < b ? [a, b] : [b, a];
  const id = `${s}|${t}`;
  if (!edgeMap.has(id)) edgeMap.set(id, { id, source: s, target: t, weight: 0, meta: [] });
  const edge = edgeMap.get(id);
  edge.weight += weight;
  edge.meta.push(meta);
}

function safelyParse(doc) {
  try { return typeof doc === 'string' ? JSON.parse(doc) : (doc || {}); }
  catch { return {}; }
}
