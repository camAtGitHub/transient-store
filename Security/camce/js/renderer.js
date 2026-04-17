import { severityColors } from './utils.js';

export class GraphRenderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext('2d');
    this.graph = { nodes: [], edges: [] };
    this.positions = new Map();
    this.camera = { x: 0, y: 0, z: 1 };
    this.hovered = null;
    this.selected = new Set();
    this.visibleNodeIds = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.wireInteractions();
    requestAnimationFrame(() => this.draw());
  }

  wireInteractions() {
    let dragging = false, px = 0, py = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true; px = e.clientX; py = e.clientY;
      const hit = this.hitTest(e.offsetX, e.offsetY);
      if (hit) {
        if (e.shiftKey) this.selected.add(hit.id); else this.selected = new Set([hit.id]);
        this.onSelect?.(hit);
      }
    });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        this.camera.x += (e.clientX - px) / this.camera.z;
        this.camera.y += (e.clientY - py) / this.camera.z;
        px = e.clientX; py = e.clientY;
      }
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.camera.z = Math.max(0.15, Math.min(6, this.camera.z * delta));
    }, { passive: false });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  update(graph, positioned, visibleNodeIds = null) {
    this.graph = graph;
    this.positions = new Map(positioned.map((p) => [p.id, p]));
    this.visibleNodeIds = visibleNodeIds;
  }

  resetCamera() { this.camera = { x: 0, y: 0, z: 1 }; }

  worldToScreen(p) {
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;
    return {
      x: (p.x + this.camera.x) * this.camera.z + w / 2,
      y: (p.y + this.camera.y) * this.camera.z + h / 2
    };
  }

  hitTest(x, y) {
    const vis = this.getVisibleNodes();
    for (let i = vis.length - 1; i >= 0; i--) {
      const n = vis[i]; const p = this.worldToScreen(this.positions.get(n.id) || { x: 0, y: 0 });
      const r = this.radius(n);
      if (((x - p.x) ** 2) + ((y - p.y) ** 2) < r * r) return n;
    }
    return null;
  }

  getVisibleNodes() {
    return this.graph.nodes.filter((n) => !this.visibleNodeIds || this.visibleNodeIds.has(n.id));
  }

  radius(node) {
    return Math.min(18, 4 + Math.sqrt(node.degree || 1));
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const nodes = this.getVisibleNodes();
    const viewportPad = 80;

    // Progressive edge rendering + viewport culling + LOD
    const edgeBudget = this.camera.z < 0.45 ? 1200 : 8000;
    let drawnEdges = 0;
    for (const e of this.graph.edges) {
      if (drawnEdges > edgeBudget) break;
      if (this.visibleNodeIds && (!this.visibleNodeIds.has(e.source) || !this.visibleNodeIds.has(e.target))) continue;
      const a = this.positions.get(e.source); const b = this.positions.get(e.target);
      if (!a || !b) continue;
      const A = this.worldToScreen(a), B = this.worldToScreen(b);
      if ((A.x < -viewportPad && B.x < -viewportPad) || (A.y < -viewportPad && B.y < -viewportPad) || (A.x > w + viewportPad && B.x > w + viewportPad) || (A.y > h + viewportPad && B.y > h + viewportPad)) continue;
      if (this.camera.z < 0.45 && (e.weight || 1) < 2) continue;
      ctx.globalAlpha = e.kind === 'temporal' ? 0.22 : 0.35;
      ctx.strokeStyle = e.kind === 'ioc' ? '#ff355e' : '#4e77b9';
      ctx.lineWidth = Math.min(3.5, 0.3 + (e.weight || 1) * 0.25);
      ctx.beginPath();
      const mx = (A.x + B.x) / 2; const my = (A.y + B.y) / 2;
      const bend = e.kind === 'temporal' ? 12 : 4;
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(mx + bend, my - bend, B.x, B.y);
      ctx.stroke();
      drawnEdges++;
    }

    // Progressive node rendering (central/high degree first)
    const sorted = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
    const nodeBudget = this.camera.z < 0.45 ? 3500 : 20000;
    let drawnNodes = 0;
    for (const node of sorted) {
      if (drawnNodes > nodeBudget) break;
      const p = this.positions.get(node.id); if (!p) continue;
      const P = this.worldToScreen(p);
      if (P.x < -viewportPad || P.y < -viewportPad || P.x > w + viewportPad || P.y > h + viewportPad) continue;

      const r = this.radius(node);
      ctx.globalAlpha = this.selected.size && !this.selected.has(node.id) ? 0.25 : 0.95;
      const fill = severityColors[node.severity] || '#8091b3';
      ctx.fillStyle = fill;
      ctx.beginPath();
      if (node.type === 'hub') {
        ctx.rect(P.x - r, P.y - r, r * 2, r * 2);
      } else if (node.type === 'ioc') {
        ctx.moveTo(P.x, P.y - r);
        ctx.lineTo(P.x + r, P.y);
        ctx.lineTo(P.x, P.y + r);
        ctx.lineTo(P.x - r, P.y);
        ctx.closePath();
      } else {
        ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      if (this.camera.z > 0.9 || this.selected.has(node.id)) {
        ctx.fillStyle = '#d7ebff';
        ctx.font = '11px "IBM Plex Sans"';
        ctx.fillText(node.label.slice(0, 42), P.x + r + 3, P.y + 4);
      }

      drawnNodes++;
    }

    this.overlay.textContent = `Nodes ${nodes.length} • Edges ${drawnEdges}/${this.graph.edges.length} • Zoom ${this.camera.z.toFixed(2)}`;
    requestAnimationFrame(() => this.draw());
  }
}
