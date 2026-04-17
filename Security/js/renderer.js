const severityColor = {
  critical: '#ff3b58',
  high: '#ff9f2f',
  medium: '#ffe066',
  low: '#6bc8ff',
};

export class GraphRenderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext('2d');
    this.octx = overlay.getContext('2d');
    this.transform = { x: 0, y: 0, k: 1 };
    this.visibleTypes = new Set(['finding', 'hub']);
    this.last = null;
    this.progressiveFactor = 0.15;
    this.initEvents();
    this.resize();
  }

  resize() {
    const dpr = devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    for (const c of [this.canvas, this.overlay]) {
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoom = Math.exp(-e.deltaY * 0.0012);
      this.transform.k = Math.max(0.1, Math.min(4, this.transform.k * zoom));
      this.render(this.last);
    }, { passive: false });

    let dragging = false;
    let lx = 0, ly = 0;
    this.canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.transform.x += e.clientX - lx;
      this.transform.y += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.render(this.last);
    });
  }

  setVisibleTypes(types) { this.visibleTypes = new Set(types); this.render(this.last); }

  render(graph) {
    if (!graph) return;
    this.last = graph;
    const { ctx } = this;
    const { width, height } = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    const visibleNodes = graph.nodes.filter((n) => this.visibleTypes.has(n.type) && this.isInViewport(n, width, height));
    const nodeSet = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = graph.edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

    const sortedNodes = [...visibleNodes].sort((a, b) => b.centrality - a.centrality);
    const sortedEdges = [...visibleEdges].sort((a, b) => b.weight - a.weight);
    const edgeCap = Math.max(300, Math.floor(sortedEdges.length * this.progressiveFactor));
    const nodeCap = Math.max(500, Math.floor(sortedNodes.length * this.progressiveFactor));

    this.drawEdges(sortedEdges.slice(0, edgeCap));
    this.drawNodes(sortedNodes.slice(0, nodeCap));
    this.drawOverlay(width, height, graph);

    if (this.progressiveFactor < 1) {
      this.progressiveFactor = Math.min(1, this.progressiveFactor + 0.12);
      requestAnimationFrame(() => this.render(graph));
    }
  }

  drawEdges(edges) {
    const { ctx } = this;
    const lod = this.transform.k;
    ctx.save();
    this.applyTransform(ctx);
    for (const e of edges) {
      const s = this.last.nodeById[e.source], t = this.last.nodeById[e.target];
      if (!s || !t) continue;
      ctx.strokeStyle = '#75c7ff22';
      ctx.lineWidth = lod < 0.35 ? 0.5 : Math.min(3, 0.4 + Math.log2(e.weight + 1));
      ctx.beginPath();
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const bend = lod < 0.4 ? 0 : 6;
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(mx + bend, my - bend, t.x, t.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawNodes(nodes) {
    const { ctx } = this;
    const lod = this.transform.k;
    ctx.save();
    this.applyTransform(ctx);
    for (const n of nodes) {
      const r = lod < 0.4 ? 2.4 : n.radius;
      ctx.fillStyle = severityColor[n.severity] || '#93a5ff';
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (lod > 0.9 && (n.centrality > 0.35 || n.type === 'hub')) {
        ctx.fillStyle = '#dce9ff';
        ctx.font = '11px "IBM Plex Sans"';
        ctx.fillText(n.label.slice(0, 44), n.x + r + 2, n.y - 2);
      }
    }
    ctx.restore();
  }

  drawOverlay(width, height, graph) {
    const stats = `Visible ${graph.visibleNodes || graph.nodes.length} nodes / ${graph.visibleEdges || graph.edges.length} edges`;
    this.octx.clearRect(0, 0, width, height);
    this.octx.fillStyle = '#9cb7ff';
    this.octx.font = '12px "IBM Plex Sans"';
    this.octx.fillText(stats, 12, 18);
  }

  applyTransform(ctx) {
    const { width, height } = this.canvas.getBoundingClientRect();
    ctx.translate(width / 2 + this.transform.x, height / 2 + this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);
  }

  isInViewport(node, w, h) {
    const x = (node.x * this.transform.k) + w / 2 + this.transform.x;
    const y = (node.y * this.transform.k) + h / 2 + this.transform.y;
    return x > -120 && x < w + 120 && y > -120 && y < h + 120;
  }

  resetView() {
    this.transform = { x: 0, y: 0, k: 1 };
    this.progressiveFactor = 0.2;
    this.render(this.last);
  }
}
