/* eslint-disable no-restricted-globals */
function seedRand(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
}

function components(nodes, links) {
  const map = new Map(nodes.map((n, i) => [n.id, i]));
  const adj = Array.from({ length: nodes.length }, () => []);
  for (const e of links) {
    const a = map.get(e.source), b = map.get(e.target);
    if (a == null || b == null) continue;
    adj[a].push(b); adj[b].push(a);
  }
  const seen = new Uint8Array(nodes.length);
  const comps = [];
  for (let i = 0; i < nodes.length; i++) {
    if (seen[i]) continue;
    const c = [];
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const x = q.pop(); c.push(x);
      for (const y of adj[x]) if (!seen[y]) { seen[y] = 1; q.push(y); }
    }
    comps.push(c);
  }
  return { comps, adj };
}

function runForce(nodes, links, prevPositions, seed = 1337, iterations = 220) {
  const rand = seedRand(seed);
  const idToI = new Map(nodes.map((n, i) => [n.id, i]));
  const pos = nodes.map((n, i) => {
    const p = prevPositions?.[n.id];
    return p ? { x: p.x, y: p.y } : { x: (rand() - 0.5) * 800, y: (rand() - 0.5) * 800 };
  });
  const vel = nodes.map(() => ({ x: 0, y: 0 }));

  for (let tick = 0; tick < iterations; tick++) {
    const alpha = 1 - tick / iterations;

    for (let i = 0; i < nodes.length; i++) {
      // sampled repulsion for scale (O(N*k) instead of O(N^2))
      for (let s = 0; s < Math.min(24, nodes.length - 1); s++) {
        const j = (i + 1 + ((s * 37) % (nodes.length - 1))) % nodes.length;
        if (i === j) continue;
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy + 0.01;
        const f = 1200 / d2;
        vel[i].x += (dx / Math.sqrt(d2)) * f * alpha;
        vel[i].y += (dy / Math.sqrt(d2)) * f * alpha;
      }
    }

    for (const e of links) {
      const a = idToI.get(e.source), b = idToI.get(e.target);
      if (a == null || b == null) continue;
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
      const d = Math.hypot(dx, dy) + 0.01;
      const target = 90;
      const k = 0.011 * (e.weight || 1);
      const f = (d - target) * k;
      const nx = dx / d, ny = dy / d;
      vel[a].x += nx * f; vel[a].y += ny * f;
      vel[b].x -= nx * f; vel[b].y -= ny * f;
    }

    for (let i = 0; i < nodes.length; i++) {
      vel[i].x *= 0.82; vel[i].y *= 0.82;
      pos[i].x += vel[i].x; pos[i].y += vel[i].y;
    }
  }

  return pos;
}

self.onmessage = (ev) => {
  const { nodes, links, prevPositions, seed, iterations } = ev.data;
  const { comps } = components(nodes, links);
  const out = nodes.map((n) => ({ id: n.id, x: 0, y: 0 }));
  let angle = 0;
  const ordered = comps.sort((a, b) => b.length - a.length);

  for (const comp of ordered) {
    const compNodes = comp.map((i) => nodes[i]);
    const compIds = new Set(compNodes.map((n) => n.id));
    const compLinks = links.filter((e) => compIds.has(e.source) && compIds.has(e.target));
    const compPos = runForce(compNodes, compLinks, prevPositions, seed + comp.length, iterations);

    const cx = compPos.reduce((s, p) => s + p.x, 0) / Math.max(1, compPos.length);
    const cy = compPos.reduce((s, p) => s + p.y, 0) / Math.max(1, compPos.length);
    const r = Math.max(120, Math.sqrt(comp.length) * 42);
    const ox = Math.cos(angle) * (350 + r * 0.7);
    const oy = Math.sin(angle) * (260 + r * 0.7);
    angle += 0.9;

    for (let i = 0; i < compNodes.length; i++) {
      const gi = nodes.findIndex((n) => n.id === compNodes[i].id);
      out[gi].x = compPos[i].x - cx + ox;
      out[gi].y = compPos[i].y - cy + oy;
    }
  }

  self.postMessage({ positions: out });
};
