self.onmessage = (event) => {
  const { nodes, edges, width, height, previous = {} } = event.data;
  const positioned = layout(nodes, edges, width, height, previous);
  self.postMessage(positioned);
};

function layout(nodes, edges, width, height, previous) {
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
  for (const n of nodeMap.values()) {
    const p = previous[n.id];
    n.x = p?.x ?? ((hash(n.id) % width) - width / 2);
    n.y = p?.y ?? ((hash(`${n.id}y`) % height) - height / 2);
    n.vx = 0;
    n.vy = 0;
  }

  const links = edges.map((e) => ({ ...e, s: nodeMap.get(e.source), t: nodeMap.get(e.target) }));
  const alphaStart = Object.keys(previous).length ? 0.45 : 0.8;
  let alpha = alphaStart;
  for (let i = 0; i < 180; i++) {
    tick(nodeMap, links, alpha);
    alpha *= 0.985;
    if (alpha < 0.02) break;
  }

  // component based ring packing keeps isolated islands separated
  const components = connectedComponents(Array.from(nodeMap.values()), links);
  packComponents(components);

  return { nodes: Array.from(nodeMap.values()), edges };
}

function tick(nodeMap, links, alpha) {
  const nodes = Array.from(nodeMap.values());
  const repel = 700;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy + 0.01;
      const f = repel / d2;
      dx /= Math.sqrt(d2);
      dy /= Math.sqrt(d2);
      a.vx -= dx * f;
      a.vy -= dy * f;
      b.vx += dx * f;
      b.vy += dy * f;
    }
  }

  for (const l of links) {
    const dx = l.t.x - l.s.x;
    const dy = l.t.y - l.s.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = 20 + Math.min(l.weight * 5, 80);
    const pull = (d - ideal) * 0.015 * alpha;
    const ux = dx / d, uy = dy / d;
    l.s.vx += ux * pull;
    l.s.vy += uy * pull;
    l.t.vx -= ux * pull;
    l.t.vy -= uy * pull;
  }

  for (const n of nodes) {
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
  }
}

function connectedComponents(nodes, links) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const l of links) {
    adj.get(l.s.id).push(l.t.id);
    adj.get(l.t.id).push(l.s.id);
  }
  const seen = new Set();
  const comps = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const q = [n.id], ids = [];
    seen.add(n.id);
    while (q.length) {
      const id = q.pop();
      ids.push(id);
      for (const nxt of adj.get(id)) if (!seen.has(nxt)) { seen.add(nxt); q.push(nxt); }
    }
    const compNodes = ids.map((id) => nodes.find((x) => x.id === id));
    comps.push(compNodes);
  }
  return comps;
}

function packComponents(components) {
  components.sort((a, b) => b.length - a.length);
  let angle = 0;
  let ring = 0;
  let slot = 0;
  for (const comp of components) {
    if (slot > 8 + ring * 4) { ring += 1; slot = 0; }
    const radius = 300 + ring * 380;
    angle = (Math.PI * 2 * slot) / (8 + ring * 4);
    slot += 1;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    const centroid = comp.reduce((acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }), { x: 0, y: 0 });
    centroid.x /= comp.length;
    centroid.y /= comp.length;
    for (const n of comp) {
      n.x += cx - centroid.x;
      n.y += cy - centroid.y;
    }
  }
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}
