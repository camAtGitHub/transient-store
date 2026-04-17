export function computeStats(graph, visibleNodeIds) {
  const nodeCount = visibleNodeIds ? visibleNodeIds.size : graph.nodes.length;
  const edgeCount = graph.edges.filter((e) => !visibleNodeIds || (visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))).length;
  const times = graph.nodes.filter((n) => !visibleNodeIds || visibleNodeIds.has(n.id)).map((n) => n.timestamp).filter(Boolean);
  return {
    nodeCount,
    edgeCount,
    minTs: times.length ? Math.min(...times) : null,
    maxTs: times.length ? Math.max(...times) : null
  };
}

export function degreeCentrality(graph, visibleNodeIds) {
  const d = new Map();
  for (const n of graph.nodes) if (!visibleNodeIds || visibleNodeIds.has(n.id)) d.set(n.id, 0);
  for (const e of graph.edges) {
    if (d.has(e.source) && d.has(e.target)) {
      d.set(e.source, d.get(e.source) + e.weight);
      d.set(e.target, d.get(e.target) + e.weight);
    }
  }
  return d;
}

export function rarityPivots(graph, visibleNodeIds) {
  const vals = graph.nodes.filter((n) => n.type === 'hub' && (!visibleNodeIds || visibleNodeIds.has(n.id)));
  const counts = vals.map((n) => ({ id: n.id, label: n.label, score: n.degree || 0 }));
  const mean = counts.reduce((a, b) => a + b.score, 0) / Math.max(1, counts.length);
  const variance = counts.reduce((a, b) => a + ((b.score - mean) ** 2), 0) / Math.max(1, counts.length);
  const std = Math.sqrt(variance) || 1;
  return counts
    .map((c) => ({ ...c, z: (c.score - mean) / std }))
    .sort((a, b) => a.z - b.z)
    .slice(0, 12);
}
