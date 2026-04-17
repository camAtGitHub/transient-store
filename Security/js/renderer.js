const severityColor = {
  critical: '#f94144', high: '#f3722c', medium: '#f9c74f', low: '#577590'
};

export class GraphRenderer {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.transform = { x: 0, y: 0, k: 1 };
    this.nodes = [];
    this.links = [];
    this.position = new Map();
    this.selection = new Set();
    this.hoverId = null;
    this.labelMode = true;
    this.reducedMotion = false;
    this.progress = 0.15;
    this.gridIndex = new Map();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.#bindEvents();
    this.#tick();
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  setGraph(nodes, links, positions) {
    this.nodes = nodes;
    this.links = links;
    this.position = new Map(positions.map((p) => [p.id, p]));
    this.#buildGrid();
    this.progress = 0.12;
  }

  setSelection(ids) { this.selection = new Set(ids); }
  focusOn(id) {
    const p = this.position.get(id);
    if (!p) return;
    this.transform.x = -p.x * this.transform.k + this.canvas.clientWidth / 2;
    this.transform.y = -p.y * this.transform.k + this.canvas.clientHeight / 2;
  }

  #buildGrid() {
    this.gridIndex.clear();
    const cell = 120;
    for (const n of this.nodes) {
      const p = this.position.get(n.id); if (!p) continue;
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
      const key = `${gx},${gy}`;
      if (!this.gridIndex.has(key)) this.gridIndex.set(key, []);
      this.gridIndex.get(key).push(n.id);
    }
  }

  screenToWorld(x, y) {
    return { x: (x - this.transform.x) / this.transform.k, y: (y - this.transform.y) / this.transform.k };
  }

  #bindEvents() {
    let dragging = false, lx = 0, ly = 0;
    this.canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        this.transform.x += e.clientX - lx;
        this.transform.y += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
      }
      this.#hoverAt(e.offsetX, e.offsetY);
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const z = Math.exp(-e.deltaY * 0.0012);
      const wx = (e.offsetX - this.transform.x) / this.transform.k;
      const wy = (e.offsetY - this.transform.y) / this.transform.k;
      this.transform.k = Math.max(0.08, Math.min(8, this.transform.k * z));
      this.transform.x = e.offsetX - wx * this.transform.k;
      this.transform.y = e.offsetY - wy * this.transform.k;
    }, { passive: false });
  }

  #hoverAt(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    let best = null;
    let bestD = 18 / this.transform.k;
    const cell = 120;
    const gx = Math.floor(w.x / cell), gy = Math.floor(w.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const bucket = this.gridIndex.get(`${gx + dx},${gy + dy}`) || [];
      for (const id of bucket) {
        const p = this.position.get(id);
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    this.hoverId = best;
    if (best) {
      const n = this.nodes.find((x) => x.id === best);
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = `${sx + 14}px`; this.tooltip.style.top = `${sy + 12}px`;
      this.tooltip.textContent = `${n.label}\n${n.type} | ${n.severity} | degree:${n.degree}`;
    } else this.tooltip.classList.add('hidden');
  }

  #tick = () => {
    requestAnimationFrame(this.#tick);
    if (!this.reducedMotion) this.progress = Math.min(1, this.progress + 0.03);
    else this.progress = 1;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    const minX = (-this.transform.x) / this.transform.k - 120;
    const minY = (-this.transform.y) / this.transform.k - 120;
    const maxX = (w - this.transform.x) / this.transform.k + 120;
    const maxY = (h - this.transform.y) / this.transform.k + 120;
    const visibleNodes = this.nodes.filter((n) => {
      const p = this.position.get(n.id); if (!p) return false;
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    });
    const visibleSet = new Set(visibleNodes.map((n) => n.id));

    // progressive edge rendering + LOD
    const drawEdges = this.links
      .filter((e) => visibleSet.has(e.source) && visibleSet.has(e.target))
      .sort((a, b) => (b.weight || 1) - (a.weight || 1))
      .slice(0, Math.floor(this.links.length * this.progress * (this.transform.k < 0.4 ? 0.3 : 1)));

    ctx.globalAlpha = 0.35;
    for (const e of drawEdges) {
      const a = this.position.get(e.source), b = this.position.get(e.target);
      if (!a || !b) continue;
      const strong = this.selection.has(e.source) || this.selection.has(e.target);
      ctx.strokeStyle = strong ? '#8ed4ff' : (e.inferred ? '#4f6980' : '#395264');
      ctx.lineWidth = Math.max(0.6, Math.min(3, 0.8 + (e.weight || 1) * 0.22));
      ctx.beginPath();
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const c = 0.08 * (a.id < b.id ? 1 : -1);
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx + (b.y - a.y) * c, my + (a.x - b.x) * c, b.x, b.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    const drawNodes = visibleNodes.sort((a,b) => b.centrality - a.centrality).slice(0, Math.floor(visibleNodes.length * this.progress));
    for (const n of drawNodes) {
      const p = this.position.get(n.id); if (!p) continue;
      const r = Math.max(3.2, Math.min(17, 3 + Math.sqrt(n.degree + 1) * 1.2));
      const selected = this.selection.has(n.id);
      ctx.fillStyle = severityColor[n.severity] || '#8aa6b8';
      ctx.beginPath();
      if (n.type === 'threat') ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      else { ctx.arc(p.x, p.y, r, 0, Math.PI * 2); }
      ctx.fill();

      if (selected || n.id === this.hoverId) {
        ctx.strokeStyle = '#d8f2ff'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (this.labelMode && this.transform.k > 0.45 && (selected || n.centrality > 0.6 || n.id === this.hoverId)) {
        ctx.fillStyle = '#d7e8f7';
        ctx.font = `${11 / this.transform.k}px IBM Plex Sans`;
        ctx.fillText(n.label.slice(0, 28), p.x + r + 2, p.y - r - 2);
      }
    }

    ctx.restore();
  }
}
