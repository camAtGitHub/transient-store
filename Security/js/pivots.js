import { fuzzyIncludes } from './utils.js';

export function rarityPivots(nodes, limit = 30) {
  const entities = nodes.filter((n) => n.type === 'entity');
  const freq = new Map();
  for (const n of entities) freq.set(n.label, (freq.get(n.label) ?? 0) + 1);
  const counts = [...freq.values()];
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  const variance = counts.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / Math.max(1, counts.length);
  const std = Math.sqrt(variance || 1);

  return [...freq.entries()]
    .map(([label, count]) => ({ label, count, z: (count - mean) / std }))
    .sort((a, b) => a.z - b.z)
    .slice(0, limit);
}

export function shortestPath(nodes, edges, startId, endId) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  const q = [startId];
  const prev = new Map([[startId, null]]);
  while (q.length) {
    const cur = q.shift();
    if (cur === endId) break;
    for (const nxt of adj.get(cur) || []) {
      if (prev.has(nxt)) continue;
      prev.set(nxt, cur);
      q.push(nxt);
    }
  }
  if (!prev.has(endId)) return [];
  const path = [];
  let cur = endId;
  while (cur) { path.push(cur); cur = prev.get(cur); }
  return path.reverse();
}

export function kHopNeighbors(nodes, edges, seedId, hops = 2) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  const visited = new Set([seedId]);
  let frontier = [seedId];
  for (let i = 0; i < hops; i += 1) {
    const next = [];
    for (const nodeId of frontier) {
      for (const nb of adj.get(nodeId) || []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return [...visited];
}

export function searchNodeIds(nodes, term) {
  return nodes.filter((n) => fuzzyIncludes(n.label, term) || fuzzyIncludes(n.id, term)).map((n) => n.id);
}
