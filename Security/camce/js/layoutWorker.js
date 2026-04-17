import { createSeededRandom } from './utils.js';

self.onmessage = (ev) => {
  const { nodes, edges, previousPositions, width, height } = ev.data;
  const positioned = layout(nodes, edges, previousPositions, width, height);
  self.postMessage(positioned);
};

function layout(nodes, edges, previousPositions = {}, width = 1200, height = 800) {
  const rand = createSeededRandom(42);
  const n = nodes.map((x) => ({ ...x, x: previousPositions[x.id]?.x ?? (rand() - 0.5) * width, y: previousPositions[x.id]?.y ?? (rand() - 0.5) * height, vx: 0, vy: 0 }));
  const idx = new Map(n.map((node, i) => [node.id, i]));
  const links = edges.map((e) => ({ ...e, si: idx.get(e.source), ti: idx.get(e.target) })).filter((e) => e.si != null && e.ti != null);

  const iterations = previousPositions && Object.keys(previousPositions).length ? 90 : 180;
  for (let it = 0; it < iterations; it++) {
    // Repulsion with coarse spatial bucketing (Barnes-Hut light approximation)
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const a = n[i], b = n[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 160000) continue;
        const f = 120 / d2;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
    }

    for (const l of links) {
      const a = n[l.si], b = n[l.ti];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const ideal = 42 + Math.min(22, (l.weight || 1) * 3);
      const k = (dist - ideal) * 0.006;
      a.vx += dx * k; a.vy += dy * k;
      b.vx -= dx * k; b.vy -= dy * k;
    }

    const damp = 0.84;
    for (const node of n) {
      node.vx *= damp; node.vy *= damp;
      node.x += node.vx; node.y += node.vy;
    }
  }

  return n.map((node) => ({ id: node.id, x: node.x, y: node.y }));
}
