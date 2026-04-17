export class TimelineController {
  constructor(container) {
    this.container = container;
    this.nodes = [];
    this.range = { min: 0, max: 1 };
    this.playhead = 1;
    this.raf = null;
    this.onTick = null;
  }

  setNodes(nodes) {
    this.nodes = nodes.filter((n) => n.timestamp);
    this.range.min = Math.min(...this.nodes.map((n) => n.timestamp), Date.now() - 3600_000);
    this.range.max = Math.max(...this.nodes.map((n) => n.timestamp), Date.now());
    this.playhead = this.range.max;
    this.render();
  }

  play(durationSec = 20) {
    const start = performance.now();
    const span = this.range.max - this.range.min || 1;
    const step = (t) => {
      const p = Math.min(1, (t - start) / (durationSec * 1000));
      this.playhead = this.range.min + span * p;
      this.onTick?.(this.playhead);
      this.render();
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(step);
  }

  pause() { cancelAnimationFrame(this.raf); }
  reset() { this.pause(); this.playhead = this.range.max; this.onTick?.(this.playhead); this.render(); }

  render() {
    const p = (this.playhead - this.range.min) / ((this.range.max - this.range.min) || 1);
    this.container.innerHTML = `<div style="height:100%; position:relative;">
      <div style="position:absolute;left:0;right:0;top:50%;height:2px;background:#2a4a7b"></div>
      <div style="position:absolute;left:${(p * 100).toFixed(2)}%;top:6px;bottom:6px;width:2px;background:#14f1ff"></div>
      <div style="position:absolute;left:8px;top:8px;font-size:11px;color:#9ec7f9">${new Date(this.playhead).toISOString()}</div>
    </div>`;
  }
}
