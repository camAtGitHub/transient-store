const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

export function computePivots(graph) {
  const deg = graph.nodes.map((n) => n.degree);
  const m = mean(deg), s = std(deg) || 1;

  const rare = graph.nodes
    .map((n) => ({ node: n, z: (n.degree - m) / s }))
    .sort((a, b) => a.z - b.z)
    .slice(0, 10)
    .map((x) => ({ type: 'rarity', label: `${x.node.label} rarity z=${x.z.toFixed(2)}`, nodeId: x.node.id }));

  const bridge = graph.nodes
    .map((n) => ({ n, score: (n.centrality || 0) * Math.log(1 + n.degree) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => ({ type: 'bridge', label: `${x.n.label} influence ${x.score.toFixed(2)}`, nodeId: x.n.id }));

  return [...bridge, ...rare];
}
