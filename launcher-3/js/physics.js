// js/physics.js
// A lightweight physics simulation that places items organically —
// no grid, no rows, no columns. Each item has:
//   homeX, homeY   — its "natural rest" target driven by relevance
//   x, y           — current position
//   vx, vy         — velocity
//   state          — 'idle' | 'match' | 'unmatch'
//
// Forces per tick:
//   1. Spring toward (homeX, homeY)
//   2. Flow-field drift (Perlin) — keeps everything breathing
//   3. Neighbor repulsion via spatial hash
//   4. Velocity damping

import { flowField } from './noise.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5°
const SKIP_THRESHOLD = 0.05;

export class Physics {
  constructor(app) {
    this.app = app;
    this.nodes = [];            // live physics nodes (parallel to app.bookmarks)
    this.idIndex = new Map();   // id → node
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.t = 0;
    this.running = false;
    this.paused = false;        // document.hidden → true
    this.sleeping = false;      // deep idle: rAF not scheduled until _wake()
    this.lastFrameTime = 0;
    this.idleSince = 0;

    // tunables
    this.config = {
      spring:        0.010,     // pull toward home
      damp:          0.88,
      drift:         0.14,      // idle flow strength
      repel:         36,        // neighbor push magnitude
      repelR:        86,        // neighbor push radius (px)
      searchSpring:  0.055,     // stronger pull when searching
      sleepEpsilon:  0.015,     // when avg speed below this, allow sleep
    };

    // For per-item shape variance
    this.rnd = mulberry32(0x2a5f1c3d);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    this._loop = this._loop.bind(this);
  }

  onResize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }

  build(bookmarks, scoreMap) {
    // Stable ordering by score desc, but with a tiny hash-based jitter
    // so ties produce an organic feel rather than a column.
    const sorted = [...bookmarks].sort((a, b) => {
      const sa = scoreMap[a.id]?.total || 0;
      const sb = scoreMap[b.id]?.total || 0;
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    });

    this.nodes = [];
    this.idIndex.clear();

    const cx = this.w / 2;
    const cy = this.h / 2;
    // keep items clear of the top search bar
    const topGuard = 150;
    const bottomGuard = 60;
    const safeH = this.h - topGuard - bottomGuard;
    // Area-proportional spiral: radius grows ∝ √i so density is uniform.
    // Scaled to roughly fit viewport without off-screen spread at idle.
    const maxR = Math.min(this.w, safeH) * 0.48;
    const n = sorted.length;

    for (let i = 0; i < n; i++) {
      const b = sorted[i];
      // Phyllotaxis position (sunflower)
      const angle = i * GOLDEN_ANGLE + this.rnd() * 0.25;
      const t = Math.sqrt(i / Math.max(n - 1, 1));
      const r = maxR * t;
      const hx = cx + Math.cos(angle) * r * (this.w / this.h > 1.4 ? 1.25 : 1);
      const hy = (topGuard + bottomGuard) / 2 + this.h / 2 + Math.sin(angle) * r * 0.88;

      // Start slightly off the home position for a subtle reveal
      const startR = this.rnd() * 40 + 20;
      const startA = this.rnd() * TAU;

      const node = {
        id: b.id,
        bookmark: b,
        i,
        // current position
        x: hx + Math.cos(startA) * startR,
        y: hy + Math.sin(startA) * startR,
        vx: 0, vy: 0,
        // home position
        homeX: hx, homeY: hy,
        // baseline home (so we can restore after search)
        baseX: hx, baseY: hy,
        // physics state
        state: 'idle',
        matchRank: -1,
        score: scoreMap[b.id]?.total || 0,
        reasons: scoreMap[b.id]?.reasons || [],
        topReason: scoreMap[b.id]?.topReason,
        // visual
        rel: relevanceBucket(scoreMap, b.id, scoreMap[b.id]?.total || 0),
        shape: randomShape(this.rnd),
        angle: angle, // remembered for ordering when re-laying out
        // DOM element (attached later)
        el: null,
      };
      this.nodes.push(node);
      this.idIndex.set(b.id, node);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.sleeping = false;
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

  pause() {
    // called when tab goes hidden — halt rAF loop entirely
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (!this.running) return;
    this.lastFrameTime = performance.now();
    this.idleSince = 0;
    this.sleeping = false;
    requestAnimationFrame(this._loop);
  }

  // Move items to accommodate a search event.
  // matchList: array of nodes in rank order (top first), non-matches excluded
  applySearch(matchList, unmatchList) {
    const cx = this.w / 2;
    const topOfField = 170; // just below search bar
    const n = matchList.length;

    if (n === 0) {
      // Nothing matched — push all nodes off-screen
      for (const node of this.nodes) {
        node.state = 'unmatch';
        node.homeX = cx + (Math.random() > 0.5 ? 1 : -1) * (this.w * 0.8);
        node.homeY = this.h + 200;
      }
      this._wake();
      return;
    }

    if (n === 1) {
      // Hero: single result sits just below search bar, grand
      const node = matchList[0];
      node.state = 'match';
      node.matchRank = 0;
      node.homeX = cx;
      node.homeY = topOfField + 110;
    } else if (n <= 9) {
      // Serpentine curve: items arranged on a gentle S-curve
      const amp = Math.min(this.w * 0.28, 320);
      const verticalSpacing = Math.min(88, (this.h - topOfField - 120) / n);
      for (let i = 0; i < n; i++) {
        const node = matchList[i];
        const frac = n === 1 ? .5 : i / (n - 1);
        const x = cx + Math.sin(frac * Math.PI * 1.6) * amp * (i % 2 === 0 ? 1 : -1) * 0.6;
        const y = topOfField + 90 + i * verticalSpacing;
        node.state = 'match';
        node.matchRank = i;
        node.homeX = x;
        node.homeY = y;
      }
    } else {
      // Many matches: a tightened phyllotaxis, best in center
      const cy = (topOfField + this.h) / 2 + 20;
      const maxR = Math.min(this.w, this.h - topOfField) * 0.42;
      for (let i = 0; i < n; i++) {
        const node = matchList[i];
        const angle = i * GOLDEN_ANGLE;
        const t = Math.sqrt(i / Math.max(n - 1, 1));
        const r = maxR * t;
        node.state = 'match';
        node.matchRank = i;
        node.homeX = cx + Math.cos(angle) * r * (this.w / this.h > 1.4 ? 1.25 : 1);
        node.homeY = cy + Math.sin(angle) * r * 0.88;
      }
    }

    // Non-matches: drift out based on variant
    const variant = this.app.variant;
    for (let i = 0; i < unmatchList.length; i++) {
      const node = unmatchList[i];
      node.state = 'unmatch';
      const dx = node.baseX - cx;
      const dy = node.baseY - this.h / 2;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      if (variant === 'undertow') {
        // sweep downward
        node.homeX = node.baseX + dx * 0.1;
        node.homeY = this.h + 240 + (this.nodes.length - i) * 1.5;
      } else if (variant === 'ripple') {
        // pushed outward radially
        node.homeX = cx + (dx / mag) * (this.w * 0.85);
        node.homeY = this.h / 2 + (dy / mag) * (this.h * 0.85);
      } else if (variant === 'vapor') {
        // vaporize upward
        node.homeX = node.baseX + (Math.random() - .5) * 60;
        node.homeY = -260 - (this.nodes.length - i) * 1.2;
      } else {
        // dissolve: drift slightly + fade out (fade is CSS/JS-driven)
        node.homeX = node.baseX + dx * 0.35;
        node.homeY = node.baseY + dy * 0.35;
      }
    }
    this._wake();
  }

  // Release all items back to their base positions
  restore() {
    for (const node of this.nodes) {
      node.state = 'idle';
      node.matchRank = -1;
      node.homeX = node.baseX;
      node.homeY = node.baseY;
    }
    this._wake();
  }

  _wake() {
    this.idleSince = 0;
    if (this.sleeping && this.running && !this.paused) {
      this.sleeping = false;
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this._loop);
    }
  }

  _loop(now) {
    if (!this.running || this.paused || this.sleeping) return;
    const dt = Math.min(40, now - this.lastFrameTime);
    this.lastFrameTime = now;
    this.t += dt;

    const c = this.config;
    const nodes = this.nodes;
    const N = nodes.length;

    // Spatial hash for cheap neighbor queries
    const cell = c.repelR;
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const bx = (n.x / cell) | 0;
      const by = (n.y / cell) | 0;
      const key = bx * 73856093 ^ by * 19349663;
      let arr = buckets.get(key);
      if (!arr) { arr = []; buckets.set(key, arr); }
      arr.push(i);
    }

    const spring = (c.spring * dt) / 16.6667;
    const damp = Math.pow(c.damp, dt / 16.6667);
    const drift = c.drift * (dt / 16.6667);
    let totalSpeed = 0;

    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const useSpring = n.state === 'idle' ? spring : (c.searchSpring * dt / 16.6667);

      // spring to home
      n.vx += (n.homeX - n.x) * useSpring;
      n.vy += (n.homeY - n.y) * useSpring;

      // flow-field drift (reduced while searching to keep layout crisp)
      if (n.state === 'idle') {
        const [fx, fy] = flowField(n.x, n.y, this.t);
        n.vx += fx * drift;
        n.vy += fy * drift;
      }

      // neighbor repulsion (only among idle & match nodes)
      if (n.state !== 'unmatch') {
        const bx = (n.x / cell) | 0;
        const by = (n.y / cell) | 0;
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const key = (bx + ox) * 73856093 ^ (by + oy) * 19349663;
            const arr = buckets.get(key);
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const j = arr[k];
              if (j === i) continue;
              const m = nodes[j];
              if (m.state === 'unmatch') continue;
              const dx = n.x - m.x;
              const dy = n.y - m.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < c.repelR * c.repelR && d2 > 0.01) {
                const d = Math.sqrt(d2);
                const push = ((c.repelR - d) / c.repelR) * c.repel / d;
                n.vx += dx * push * 0.01 * (dt / 16.6667);
                n.vy += dy * push * 0.01 * (dt / 16.6667);
              }
            }
          }
        }
      }

      // damp
      n.vx *= damp;
      n.vy *= damp;

      // integrate
      n.x += n.vx;
      n.y += n.vy;

      totalSpeed += Math.abs(n.vx) + Math.abs(n.vy);
    }

    // Sleep check: if everything has settled and nothing has changed,
    // we can stop ticking DOM writes — saves battery, but we still
    // re-wake on any search event.
    const avgSpeed = totalSpeed / Math.max(N, 1);
    if (avgSpeed < c.sleepEpsilon) {
      this.idleSince += dt;
    } else {
      this.idleSince = 0;
    }

    // Apply DOM writes
    this.flushDOM();

    // Deep sleep: everything settled, no active search → stop rAF entirely.
    // Any user input that calls applySearch/restore will _wake() us back up.
    if (this.idleSince > 1500 && this.app.search?.isEmpty?.()) {
      this.sleeping = true;
      return;
    }

    requestAnimationFrame(this._loop);
  }

  flushDOM() {
    const tier = this.app.perf?.tier || 'full';
    const coarse = tier === 'reduced' || tier === 'minimal';
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!n.el) continue;
      const mustWrite = n.state === 'match' || n.state === 'unmatch';
      if (!mustWrite && n._firstWriteDone) {
        const speed = Math.abs(n.vx) + Math.abs(n.vy);
        const dx = Math.abs((n._lastX ?? n.x) - n.x);
        const dy = Math.abs((n._lastY ?? n.y) - n.y);
        if (speed < SKIP_THRESHOLD && dx < 0.5 && dy < 0.5) continue;
      }

      if (n._lastState !== n.state || n._lastRel !== n.rel || n._cachedScale == null) {
        n._cachedScale = cssScaleFor(n);
        n._lastState = n.state;
        n._lastRel = n.rel;
      }
      const scale = n._cachedScale;
      const x = coarse ? n.x.toFixed(0) : n.x.toFixed(1);
      const y = coarse ? n.y.toFixed(0) : n.y.toFixed(1);
      // translate3d + scale via transform; no layout thrash
      n.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale.toFixed(3)})`;
      n._firstWriteDone = true;
      n._lastX = n.x;
      n._lastY = n.y;
    }
  }
}

// ------- helpers -------
function cssScaleFor(node) {
  let s = 1;
  if (node.rel === 'hi')  s = 1.08;
  if (node.rel === 'mid') s = 1.00;
  if (node.rel === 'lo')  s = 0.9;
  if (node.rel === 'xlo') s = 0.8;
  if (node.state === 'match' && node.matchRank === 0) s *= 1.22;
  if (node.state === 'match' && node.matchRank > 0 && node.matchRank < 9) s *= 1.02;
  if (node.state === 'unmatch') s *= 0.5;
  return s;
}

function relevanceBucket(scoreMap, id, total) {
  // We bucket by comparing this item to the distribution. Since this is
  // called before we know the distribution, we approximate with absolute
  // thresholds; main.js will adjust via relevanceRank after scoring.
  if (total > 1.8) return 'hi';
  if (total > 0.9) return 'mid';
  if (total > 0.3) return 'lo';
  return 'xlo';
}

function randomShape(rnd) {
  // generate 8 asymmetric border-radius percentages that still look organic
  const base = 45 + rnd() * 15; // 45..60
  return [
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
    base + rnd() * 18 - 9,
  ].map(v => Math.max(30, Math.min(70, v)));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// used by main.js to tell if we can show the hero state
export function isOnlyOne(nodes) {
  return nodes.filter(n => n.state === 'match').length === 1;
}
