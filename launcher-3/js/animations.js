// js/animations.js
// Coordinates visual flourishes that ride on top of the physics simulation.
// Physics still drives position; animations add opacity / blur / brief
// transforms to create the "variant" feel.

import { flowField } from './noise.js';
import { GLRenderer } from './gl.js';

const VARIANTS = ['undertow', 'dissolve', 'ripple', 'vapor'];

export class Animations {
  constructor(app) {
    this.app = app;
    this.canvas = document.getElementById('backdrop');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.particles = [];
    this._ripples = [];
    this._flowTrails = [];
    this.bgPaused = false;
    this.bgSleeping = false;
    this._lastHueA = null;
    this._lastHueB = null;

    this.glr = null;
    this.ctx = null;
    if (this.app.perf?.useWebGL) {
      this.glr = new GLRenderer(this.canvas, this.app.perf.particleBudget, this.dpr);
      if (!this.glr?.ready) this.glr = null;
    }
    if (!this.glr) {
      this.ctx = this.canvas.getContext('2d');
    }

    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
    this.startBackdrop();
  }

  resizeCanvas() {
    const c = this.canvas;
    c.width = window.innerWidth * this.dpr;
    c.height = window.innerHeight * this.dpr;
    c.style.width = window.innerWidth + 'px';
    c.style.height = window.innerHeight + 'px';
    if (this.glr) {
      this.glr.resize(window.innerWidth, window.innerHeight, this.dpr);
      return;
    }
    if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---------- variant selection ----------
  pickVariant() {
    const v = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    this.variant = v;
    this.glr?.setVariant(v);
    return v;
  }

  // ---------- initial field reveal ----------
  reveal() {
    const nodes = this.app.physics.nodes;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    nodes.forEach((n, i) => {
      if (!n.el) return;
      n.el.style.opacity = '0';
      // Start at origin of bloom
      n.x = cx + (Math.random() - .5) * 50;
      n.y = cy + (Math.random() - .5) * 50;
      // Staggered fade-in following spiral order
      const delay = 60 + i * 6;
      setTimeout(() => {
        if (!n.el) return;
        n.el.animate([
          { opacity: 0, filter: 'blur(8px)' },
          { opacity: 1, filter: 'blur(0)' },
        ], { duration: 680, fill: 'forwards', easing: 'cubic-bezier(.2, .9, .25, 1)' });
        n.el.style.opacity = '1';
      }, delay);
    });
  }

  // ---------- filter flourish ----------
  onFilter(matched, unmatched) {
    const variant = this.app.variant;
    const tier = this.app.perf?.tier || 'full';

    // Matches: opacity 1, small pulse on top-rank
    matched.forEach((n, i) => {
      if (!n.el) return;
      n.el.style.opacity = '1';
      if (tier === 'minimal') {
        n.el.style.filter = '';
      } else {
        n.el.style.filter = '';
        if (i === 0) {
          n.el.animate([
            { filter: 'brightness(1)' },
            { filter: 'brightness(1.5)' },
            { filter: 'brightness(1)' },
          ], { duration: 420, easing: 'ease-out' });
        }
      }
    });

    // Un-matches: per-variant treatment
    if (variant === 'ripple' && this.app.perf?.ripplesEnabled !== false) this.spawnRipple();
    unmatched.forEach((n, i) => {
      if (!n.el) return;
      // base opacity fade
      const target = variant === 'dissolve' ? 0.06 : (variant === 'vapor' ? 0 : 0.1);
      n.el.style.transition = 'opacity .55s ease, filter .55s ease';
      n.el.style.opacity = String(target);

      if (variant === 'dissolve' && this.app.perf?.dustEnabled) {
        // spawn a few particles on canvas at the item's current position
        this._spawnDust(n.x, n.y, 5);
      }
      if (tier !== 'full') {
        n.el.style.filter = '';
        return;
      }
      if (variant === 'vapor') {
        n.el.style.filter = 'blur(10px) brightness(1.5)';
      }
      if (variant === 'undertow') {
        n.el.style.filter = 'saturate(.4) brightness(.8)';
      }
    });
  }

  // ---------- reform (when user types less or backspaces) ----------
  onReform() {
    this.app.physics.nodes.forEach((n) => {
      if (!n.el) return;
      n.el.style.opacity = '1';
      n.el.style.filter = '';
      n.el.style.transition = 'opacity .6s ease, filter .6s ease';
    });
  }

  // ---------- escape release ----------
  onEscape() {
    // Big outward sigh, then settle.
    if (this.app.perf?.ripplesEnabled !== false) this.spawnRipple(2);
    const stage = document.getElementById('stage');
    if (stage) {
      stage.animate(
        [
          { filter: 'blur(0) brightness(1)' },
          { filter: 'blur(3px) brightness(1.18)' },
          { filter: 'blur(0) brightness(1)' },
        ],
        { duration: 720, easing: 'cubic-bezier(.65, 0, .35, 1)' }
      );
    }
    this.onReform();
  }

  // ---------- launch splash ----------
  onLaunch(node) {
    if (!node.el) return;
    const rect = node.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const tier = this.app.perf?.tier || 'full';
    if (tier === 'full') this._spawnDust(cx, cy, 24, 'launch');
    if (tier === 'reduced') this._spawnDust(cx, cy, Math.ceil(24 / 2), 'launch');
    node.el.animate(
      [
        { transform: node.el.style.transform + ' ', filter: 'brightness(1)' },
        { filter: 'brightness(1.8)' },
        { opacity: 0, filter: tier === 'minimal' ? 'brightness(1)' : 'brightness(2.2) blur(6px)' },
      ],
      { duration: 260, fill: 'forwards', easing: 'ease-in' }
    );
  }

  // ---------- canvas ambient ----------
  startBackdrop() {
    this._bgTick = this._bgTick.bind(this);
    this._bgLast = performance.now();
    requestAnimationFrame(this._bgTick);
  }

  pause() {
    // tab hidden — stop the backdrop loop entirely
    this.bgPaused = true;
  }

  resume() {
    if (!this.bgPaused) return;
    this.bgPaused = false;
    this.bgSleeping = false;
    this._bgLast = performance.now();
    requestAnimationFrame(this._bgTick);
  }

  // Wake the backdrop from its slow-idle if something started happening
  _bgWake() {
    if (this.bgSleeping && !this.bgPaused) {
      this.bgSleeping = false;
      this._bgLast = performance.now();
      requestAnimationFrame(this._bgTick);
    }
  }

  _bgTick(now) {
    if (this.bgPaused || this.bgSleeping) return;
    const dt = Math.min(40, now - this._bgLast);
    this._bgLast = now;

    if (this.glr) {
      try {
        const theme = getComputedStyle(document.body);
        const ha = parseFloat(theme.getPropertyValue('--canvas-hue-a').trim() || '210');
        const hb = parseFloat(theme.getPropertyValue('--canvas-hue-b').trim() || '285');
        if (ha !== this._lastHueA || hb !== this._lastHueB) {
          this._lastHueA = ha;
          this._lastHueB = hb;
          this.glr.updateHues(ha, hb);
        }
        this.glr.tick(now, dt);
      } catch {
        this.glr.destroy();
        this.glr = null;
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
      }
    }

    if (!this.glr) {
      const ctx = this.ctx;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Trail fade — slight see-through clear
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = document.body.classList.contains('theme-light')
        ? 'rgba(246, 236, 223, 0.12)'
        : 'rgba(11, 16, 22, 0.11)';
      ctx.fillRect(0, 0, w, h);

      // Flow-field wisps — sparse particles following the same field as items
      ctx.globalCompositeOperation = 'lighter';
      const theme = getComputedStyle(document.body);
      const ha = theme.getPropertyValue('--canvas-hue-a').trim() || '210';
      const hb = theme.getPropertyValue('--canvas-hue-b').trim() || '285';
      const flowBudget = this.app.perf?.particleBudget || 60;

      // Maintain a pool of trail particles
      if (this._flowTrails.length < flowBudget) {
        for (let i = this._flowTrails.length; i < flowBudget; i++) {
          this._flowTrails.push({
            x: Math.random() * w, y: Math.random() * h, life: Math.random() * 500,
          });
        }
      }
      for (const p of this._flowTrails) {
        const [fx, fy] = flowField(p.x, p.y, now);
        p.x += fx * 1.2;
        p.y += fy * 1.2;
        p.life -= dt;
        if (p.life <= 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.life = 400 + Math.random() * 600;
        }
        const hue = ((p.x / w) * 40 + parseFloat(ha)) | 0;
        const sat = document.body.classList.contains('theme-light') ? 55 : 45;
        const lig = document.body.classList.contains('theme-light') ? 60 : 55;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lig}%, .08)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Transient dust particles (from dissolve / launch)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy;
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        const alpha = Math.max(0, p.life / p.maxLife);
        const col = p.kind === 'launch' ? hb : ha;
        ctx.fillStyle = `hsla(${col}, 70%, 65%, ${alpha * 0.55})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ripples
      ctx.globalCompositeOperation = 'lighter';
      for (let i = this._ripples.length - 1; i >= 0; i--) {
        const r = this._ripples[i];
        r.r += (r.target - r.r) * 0.06;
        r.life -= dt;
        if (r.life <= 0) { this._ripples.splice(i, 1); continue; }
        const alpha = Math.max(0, r.life / r.maxLife) * 0.35;
        ctx.strokeStyle = `hsla(${ha}, 70%, 65%, ${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (this.bgPaused) return;
    // Idle mode: no particles, no ripples → 20fps is plenty for ambient wisps
    const idle = this.particles.length === 0 && this._ripples.length === 0;
    if (idle) {
      setTimeout(() => {
        if (!this.bgPaused && !this.bgSleeping) requestAnimationFrame(this._bgTick);
      }, 50);
    } else {
      requestAnimationFrame(this._bgTick);
    }
  }

  spawnRipple(intensity = 1) {
    if (this.app.perf?.ripplesEnabled === false) return;
    const cx = window.innerWidth / 2;
    const cy = 90;
    if (this.glr) {
      for (let i = 0; i < 2 * intensity; i++) this.glr.addRipple(cx, cy);
      return;
    }
    for (let i = 0; i < 2 * intensity; i++) {
      this._ripples.push({
        x: cx, y: cy,
        r: 0,
        target: 0.8 * Math.min(this.canvas.width, this.canvas.height) / this.dpr,
        life: 1600,
        maxLife: 1600,
      });
    }
  }

  _spawnDust(x, y, count, kind = 'dissolve') {
    const tier = this.app.perf?.tier || 'full';
    if (kind === 'dissolve' && tier !== 'full') return;
    if (kind === 'launch' && tier === 'minimal') return;

    if (this.glr) {
      this.glr.addBurst(x, y, count, kind);
      return;
    }

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = kind === 'launch' ? 2 + Math.random() * 4 : .5 + Math.random() * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: .6 + Math.random() * 1.4,
        life: 600 + Math.random() * 400,
        maxLife: 1000,
        kind,
      });
    }
  }
}
