export function buildAdjacency(graph) {
  const adj = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

export function shortestPath(graph, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return [];
  const adj = buildAdjacency(graph);
  const q = [fromId];
  const prev = new Map([[fromId, null]]);
  while (q.length) {
    const cur = q.shift();
    if (cur === toId) break;
    for (const nxt of (adj.get(cur) || [])) {
      if (prev.has(nxt)) continue;
      prev.set(nxt, cur);
      q.push(nxt);
    }
  }
  if (!prev.has(toId)) return [];
  const path = [];
  let cur = toId;
  while (cur) { path.push(cur); cur = prev.get(cur); }
  return path.reverse();
}

export function kHopNeighborhood(graph, centerId, k = 2) {
  const adj = buildAdjacency(graph);
  const kept = new Set([centerId]);
  let frontier = new Set([centerId]);
  for (let i = 0; i < k; i++) {
    const next = new Set();
    for (const id of frontier) for (const n of (adj.get(id) || [])) if (!kept.has(n)) { kept.add(n); next.add(n); }
    frontier = next;
  }
  return kept;
}

export function topPivots(graph, limit = 12) {
  return [...graph.nodes]
    .filter((n) => n.type === 'hub' || n.centrality > 0.2)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, limit)
    .map((n) => ({ id: n.id, label: n.label, degree: n.degree, severity: n.severity }));
}
