import { NODE_TYPES, SEVERITY_COLOR } from './config.js';
import { clusterByGrid } from './correlation.js';

export class GraphRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.visibleNodes = [];
    this.visibleEdges = [];
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.highlight = new Set();
    this.timelineRatio = 1;
    this.maxInitialEdges = 3000;
    this.drag = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInteractions();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(200, rect.width);
    this.canvas.height = Math.max(200, rect.height);
    this.render();
  }

  bindInteractions() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const next = this.camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1);
      this.camera.zoom = Math.min(3.5, Math.max(0.2, next));
      this.render();
    });
    this.canvas.addEventListener('mousedown', (e) => { this.drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => { this.drag = null; });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      const dx = (e.clientX - this.drag.x) / this.camera.zoom;
      const dy = (e.clientY - this.drag.y) / this.camera.zoom;
      this.camera.x += dx;
      this.camera.y += dy;
      this.drag = { x: e.clientX, y: e.clientY };
      this.render();
    });
  }

  setData(nodes, edges, maxInitialEdges = 3000) {
    this.maxInitialEdges = maxInitialEdges;
    this.nodes = nodes;
    this.edges = edges;
    this.initialLayout();
    this.progressiveRender();
  }

  initialLayout() {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const total = Math.max(1, this.nodes.length);
    for (let i = 0; i < this.nodes.length; i += 1) {
      const angle = (Math.PI * 2 * i) / total;
      const r = 80 + Math.sqrt(i) * 10;
      this.nodes[i].x = cx + Math.cos(angle) * r;
      this.nodes[i].y = cy + Math.sin(angle) * r;
    }
    for (let tick = 0; tick < 55; tick += 1) this.forceStep();
  }

  forceStep() {
    const repulsion = 1600;
    const spring = 0.0022;
    const damping = 0.82;
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const clusters = clusterByGrid(this.nodes, 190);

    for (const n of this.nodes) {
      n.vx = (n.vx ?? 0) * damping;
      n.vy = (n.vy ?? 0) * damping;
    }

    for (const group of clusters.values()) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i], b = group[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = repulsion / d2;
          a.vx += (dx / Math.sqrt(d2)) * f;
          a.vy += (dy / Math.sqrt(d2)) * f;
          b.vx -= (dx / Math.sqrt(d2)) * f;
          b.vy -= (dy / Math.sqrt(d2)) * f;
        }
      }
    }

    for (const e of this.edges) {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const rest = 32 + Math.log2(1 + e.weight) * 20;
      const f = (dist - rest) * spring;
      const ux = dx / dist, uy = dy / dist;
      s.vx += ux * f; s.vy += uy * f;
      t.vx -= ux * f; t.vy -= uy * f;
    }

    for (const n of this.nodes) {
      n.x += Math.max(-8, Math.min(8, n.vx));
      n.y += Math.max(-8, Math.min(8, n.vy));
    }
  }

  progressiveRender() {
    const sortedNodes = [...this.nodes].sort((a, b) => b.centrality - a.centrality);
    const sortedEdges = [...this.edges].sort((a, b) => b.weight - a.weight);
    this.visibleNodes = [];
    this.visibleEdges = [];
    let i = 0;
    const drawChunk = () => {
      const nodeChunk = sortedNodes.slice(i, i + 1200);
      const edgeChunk = sortedEdges.slice(0, Math.min(this.maxInitialEdges, (i + 1) * 1500));
      this.visibleNodes.push(...nodeChunk);
      this.visibleEdges = edgeChunk;
      this.applyViewportAndTimeline();
      this.render();
      i += 1200;
      if (i < sortedNodes.length) requestAnimationFrame(drawChunk);
    };
    drawChunk();
  }

  applyViewportAndTimeline() {
    const maxTs = Math.max(...this.visibleNodes.map((n) => n.timestamp || 0), 1);
    const minTs = Math.min(...this.visibleNodes.map((n) => n.timestamp || 0), maxTs);
    const threshold = minTs + (maxTs - minTs) * this.timelineRatio;
    const view = { left: -120, top: -120, right: this.canvas.width + 120, bottom: this.canvas.height + 120 };

    this.culledNodes = this.visibleNodes.filter((n) => {
      if ((n.timestamp || 0) > threshold) return false;
      const sx = (n.x + this.camera.x) * this.camera.zoom;
      const sy = (n.y + this.camera.y) * this.camera.zoom;
      return sx >= view.left && sx <= view.right && sy >= view.top && sy <= view.bottom;
    });
    const idSet = new Set(this.culledNodes.map((n) => n.id));
    this.culledEdges = this.visibleEdges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
  }

  setTimelineRatio(ratio) {
    this.timelineRatio = ratio;
    this.applyViewportAndTimeline();
    this.render();
  }

  setHighlight(ids) {
    this.highlight = new Set(ids);
    this.render();
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.culledNodes) this.applyViewportAndTimeline();
    const byId = new Map(this.nodes.map((n) => [n.id, n]));

    const zoom = this.camera.zoom;
    const showLabels = zoom > 0.7;

    for (const e of this.culledEdges ?? []) {
      const s = byId.get(e.source), t = byId.get(e.target);
      if (!s || !t) continue;
      const sx = (s.x + this.camera.x) * zoom;
      const sy = (s.y + this.camera.y) * zoom;
      const tx = (t.x + this.camera.x) * zoom;
      const ty = (t.y + this.camera.y) * zoom;
      ctx.strokeStyle = SEVERITY_COLOR[e.severity] || SEVERITY_COLOR.unknown;
      ctx.globalAlpha = this.highlight.size && !(this.highlight.has(e.source) || this.highlight.has(e.target)) ? 0.08 : 0.35;
      ctx.lineWidth = Math.max(0.35, Math.min(5, Math.log2(1 + e.weight) * zoom));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    for (const n of this.culledNodes ?? []) {
      const x = (n.x + this.camera.x) * zoom;
      const y = (n.y + this.camera.y) * zoom;
      ctx.globalAlpha = this.highlight.size && !this.highlight.has(n.id) ? 0.2 : 1;
      ctx.fillStyle = NODE_TYPES[n.type] || '#9fb3d6';
      const r = Math.max(1, n.radius * zoom * (zoom < 0.45 ? 0.7 : 1));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (showLabels && r >= 4) {
        ctx.fillStyle = '#dce8ff';
        ctx.font = `${Math.max(10, 10 * zoom)}px sans-serif`;
        ctx.fillText(n.label.slice(0, 38), x + r + 2, y - 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}
