import { deepGet, normalizeArray, sanitizeId, validateEdges } from './utils.js';

function addNode(nodesById, node) {
  const existing = nodesById.get(node.id);
  if (!existing) {
    nodesById.set(node.id, { ...node, degree: 0, weight: 1 });
    return;
  }
  existing.weight += 1;
  if (node.risk && (existing.risk ?? 0) < node.risk) existing.risk = node.risk;
}

function addEdge(edgesById, source, target, meta = {}) {
  if (source === target) return;
  const id = `${source}->${target}`;
  const existing = edgesById.get(id);
  if (existing) {
    existing.weight += 1;
    existing.timestamps.push(meta.timestamp);
    return;
  }
  edgesById.set(id, { id, source, target, weight: 1, timestamps: [meta.timestamp], relation: meta.relation, severity: meta.severity ?? 'unknown' });
}

export function buildGraph(store, options) {
  const nodesById = new Map();
  const edgesById = new Map();
  const fields = options.fields;
  const storyWindowMs = options.storyWindowMin * 60e3;

  for (const event of store.allEvents) {
    const rootId = sanitizeId(`${event.type}_${event.id}`);
    addNode(nodesById, {
      id: rootId,
      label: event.id,
      type: event.type === 'ioc' ? 'ioc' : 'finding',
      timestamp: event.timestamp,
      severity: event.severity || event.queries?.[0]?.tags?.[0] || 'unknown',
      raw: event,
    });

    const docs = event.documents?.length ? event.documents : event.resolvedDocs ?? [];
    for (const d of docs) {
      const doc = d.doc || d;
      const docId = sanitizeId(`doc_${d.id ?? doc._id ?? event.id}`);
      addNode(nodesById, {
        id: docId,
        label: doc.host?.name || doc.source?.ip || d.id || 'document',
        type: 'document',
        timestamp: event.timestamp,
        raw: doc,
      });
      addEdge(edgesById, rootId, docId, { relation: 'has_doc', timestamp: event.timestamp, severity: event.severity });

      for (const field of fields) {
        for (const val of normalizeArray(deepGet(doc, field))) {
          if (val == null || val === '') continue;
          const v = String(val).trim();
          const entId = sanitizeId(`ent_${field}_${v}`);
          addNode(nodesById, { id: entId, label: v, type: 'entity', field, timestamp: event.timestamp, raw: { field, value: v } });
          addEdge(edgesById, docId, entId, { relation: field, timestamp: event.timestamp, severity: event.severity });
        }
      }
    }
  }

  const nodes = Array.from(nodesById.values()).sort((a, b) => (b.weight - a.weight));
  const edges = Array.from(edgesById.values()).sort((a, b) => (b.weight - a.weight));

  const byEntityLabel = new Map();
  for (const n of nodes) {
    if (n.type !== 'entity') continue;
    const key = n.label;
    if (!byEntityLabel.has(key)) byEntityLabel.set(key, []);
    byEntityLabel.get(key).push(n);
  }

  for (const [_, arr] of byEntityLabel.entries()) {
    arr.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < arr.length; i += 1) {
      const prev = arr[i - 1];
      const next = arr[i];
      if ((next.timestamp - prev.timestamp) <= storyWindowMs) {
        addEdge(edgesById, prev.id, next.id, { relation: 'temporal_bridge', timestamp: next.timestamp, severity: 'medium' });
      }
    }
  }

  const finalEdges = validateEdges(nodes, Array.from(edgesById.values()));
  const degree = new Map();
  for (const e of finalEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + e.weight);
    degree.set(e.target, (degree.get(e.target) ?? 0) + e.weight);
  }
  for (const n of nodes) {
    n.degree = degree.get(n.id) ?? 0;
    n.radius = Math.max(2, Math.min(20, 3 + Math.log2(1 + n.degree)));
    n.centrality = n.degree;
  }

  return { nodes, edges: finalEdges };
}

export function clusterByGrid(nodes, cell = 220) {
  const clusters = new Map();
  for (const n of nodes) {
    const cx = Math.floor(n.x / cell);
    const cy = Math.floor(n.y / cell);
    const key = `${cx}:${cy}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(n);
  }
  return clusters;
}
