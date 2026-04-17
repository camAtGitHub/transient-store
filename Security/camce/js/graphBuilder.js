import { deepGet, inferSeverity, normalizeArray, sanitizeId } from './utils.js';

function edgeId(a, b, k) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return sanitizeId(`${x}|${y}|${k}`);
}

export function buildGraphFromStore(store, opts) {
  const nodes = [];
  const edgesMap = new Map();
  const nodeById = new Map();
  const entityMentions = new Map();

  const addNode = (node) => {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node);
      nodes.push(node);
    }
  };

  for (const finding of store.findingsById.values()) {
    const tags = finding.queries?.[0]?.tags || [];
    const node = {
      id: finding.id,
      label: finding.queries?.[0]?.name || finding.id,
      type: 'finding',
      severity: inferSeverity(tags),
      timestamp: Number(finding.timestamp) || 0,
      raw: finding
    };
    addNode(node);

    for (const field of opts.correlationFields) {
      for (const doc of finding.parsed_documents || []) {
        for (const val of normalizeArray(deepGet(doc.parsed, field))) {
          if (val == null || val === '') continue;
          const key = `${field}:${String(val).toLowerCase()}`;
          if (!entityMentions.has(key)) entityMentions.set(key, []);
          entityMentions.get(key).push({ findingId: node.id, ts: node.timestamp, value: String(val), field });
        }
      }
    }
  }

  for (const [entityKey, mentions] of entityMentions.entries()) {
    if (mentions.length < 2) continue;
    const [field, value] = entityKey.split(':');
    if (mentions.length >= opts.hubThreshold) {
      const hubId = sanitizeId(`hub:${field}:${value}`);
      addNode({ id: hubId, label: value, type: 'hub', severity: 'medium', timestamp: mentions[0].ts, field });
      for (const m of mentions) {
        const id = edgeId(hubId, m.findingId, field);
        const prev = edgesMap.get(id);
        if (prev) prev.weight += 1;
        else edgesMap.set(id, { id, source: hubId, target: m.findingId, kind: 'hub', field, weight: 1 });
      }
      continue;
    }

    if (opts.buildCooccurrenceMesh) {
      for (let i = 0; i < mentions.length; i++) {
        for (let j = i + 1; j < mentions.length; j++) {
          const a = mentions[i].findingId; const b = mentions[j].findingId;
          const id = edgeId(a, b, field);
          const prev = edgesMap.get(id);
          if (prev) prev.weight += 1;
          else edgesMap.set(id, { id, source: a, target: b, kind: 'correlates', field, weight: 1 });
        }
      }
    }

    if (opts.buildTemporalBridges) {
      const sorted = [...mentions].sort((a, b) => a.ts - b.ts);
      const gap = opts.storyWindowMinutes * 60 * 1000;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].ts - sorted[i - 1].ts <= gap) {
          const a = sorted[i - 1].findingId; const b = sorted[i].findingId;
          const id = edgeId(a, b, `${field}:t`);
          if (!edgesMap.has(id)) edgesMap.set(id, { id, source: a, target: b, kind: 'temporal', field, weight: 1, inferred: true });
        }
      }
    }
  }

  for (const threat of store.threatById.values()) {
    const id = sanitizeId(`ioc:${threat.id}`);
    addNode({ id, label: threat.threat_type || 'IOC', type: 'ioc', severity: 'critical', timestamp: Number(threat.timestamp) || 0, raw: threat });
    for (const rd of threat.resolvedDocs || []) {
      for (const finding of store.findingsById.values()) {
        const matches = (finding.related_doc_ids || []).some((d) => sanitizeId(d) === rd.id);
        if (matches) {
          const eid = edgeId(id, finding.id, 'ioc');
          if (!edgesMap.has(eid)) edgesMap.set(eid, { id: eid, source: id, target: finding.id, kind: 'ioc', field: 'related_doc_ids', weight: 2 });
        }
      }
    }
  }

  const validIds = new Set(nodes.map((n) => n.id));
  const edges = [...edgesMap.values()].filter((e) => validIds.has(e.source) && validIds.has(e.target));

  return { nodes, edges };
}
