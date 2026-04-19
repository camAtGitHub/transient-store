// js/search.js
// Orchestrates typing → scoring → physics layout + keyboard navigation.

import { fuzzyScore } from './fuzzy.js';

export class Search {
  constructor(app) {
    this.app = app;
    this.input = document.getElementById('search');
    this.countEl = document.getElementById('vessel-count');
    this.ribbon = document.getElementById('ribbon');
    this.currentQuery = '';
    this.focusIndex = -1;
    this.matched = [];          // physics nodes currently in match state, ranked
    this._debounce = null;
  }

  init() {
    this.input.addEventListener('input', (e) => {
      const v = e.target.value;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this.run(v), 32);
    });

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keydown', (e) => this.onWindowKey(e));

    // initial render: no query, everyone shown
    this.updateCount(this.app.physics.nodes.length);
    this.renderRibbon();
  }

  isEmpty() { return !this.currentQuery; }

  run(query) {
    this.currentQuery = query;
    this.app.intelligence.recordQuery(query);

    // If query empty → restore everything to base relevance layout
    if (!query || !query.trim()) {
      this.matched = [];
      this.focusIndex = -1;
      this.app.physics.restore();
      this.updateCount(this.app.physics.nodes.length);
      this.clearHotkeys();
      this.clearFocus();
      this.renderRibbon();
      this.app.animations.onReform();
      return;
    }

    // Score every bookmark: fuzzy score × (1 + intelligence boost fraction)
    const q = query.trim();
    const aliasMap = this.app.intelligence.brain.aliases[q.toLowerCase()];
    const scored = [];
    for (const node of this.app.physics.nodes) {
      const fs = fuzzyScore(q, node.bookmark);
      if (fs <= 0) continue;
      // alias boost: items previously clicked for this exact query
      let boost = 1;
      if (aliasMap && aliasMap[node.id]) boost += Math.log10(1 + aliasMap[node.id]);
      // intelligence boost (scaled small so fuzzy dominates)
      const intel = node.score;
      boost *= 1 + Math.min(0.6, intel * 0.15);
      scored.push({ node, score: fs * boost });
    }
    scored.sort((a, b) => b.score - a.score);

    const matched = scored.map(s => s.node);
    const matchedSet = new Set(matched);
    const unmatched = this.app.physics.nodes.filter(n => !matchedSet.has(n));

    // Apply to physics
    this.app.physics.applySearch(matched, unmatched);

    // Apply DOM states
    for (const n of this.app.physics.nodes) {
      if (!n.el) continue;
      n.el.dataset.state = n.state;
    }

    // Hotkeys if ≤9 matches
    this.clearHotkeys();
    if (matched.length > 0 && matched.length <= 9) {
      for (let i = 0; i < matched.length; i++) {
        const n = matched[i];
        if (!n.el) continue;
        n.el.classList.add('with-hot');
        const hot = n.el.querySelector('.hot');
        if (hot) hot.textContent = String(i + 1);
      }
    }

    // Focus: autoselect first, or the single result
    this.matched = matched;
    this.focusIndex = matched.length > 0 ? 0 : -1;
    this.syncFocus();

    // If exactly 1 result, show solo crown
    for (const n of this.app.physics.nodes) {
      if (!n.el) continue;
      n.el.classList.toggle('solo', matched.length === 1 && matched[0] === n);
    }

    this.updateCount(matched.length);
    this.renderRibbon();

    // Run variant flourish
    this.app.animations.onFilter(matched, unmatched);
  }

  clearHotkeys() {
    for (const n of this.app.physics.nodes) {
      if (!n.el) continue;
      n.el.classList.remove('with-hot', 'solo');
    }
  }

  clearFocus() {
    for (const n of this.app.physics.nodes) {
      if (n.el) n.el.classList.remove('focused');
    }
  }

  syncFocus() {
    this.clearFocus();
    if (this.focusIndex >= 0 && this.matched[this.focusIndex]) {
      const n = this.matched[this.focusIndex];
      if (n.el) n.el.classList.add('focused');
    }
  }

  onKey(e) {
    const { key } = e;
    if (key === 'Escape') {
      if (this.currentQuery) {
        this.input.value = '';
        this.run('');
        this.app.animations.onEscape();
      } else {
        this.input.blur();
      }
      e.preventDefault();
      return;
    }
    if (key === 'Enter') {
      if (this.matched.length === 1) {
        this.launch(this.matched[0]);
      } else if (this.focusIndex >= 0 && this.matched[this.focusIndex]) {
        this.launch(this.matched[this.focusIndex]);
      }
      e.preventDefault();
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      if (this.matched.length > 1) {
        this.focusIndex = (this.focusIndex + 1) % this.matched.length;
        this.syncFocus();
        e.preventDefault();
      }
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      if (this.matched.length > 1) {
        this.focusIndex = (this.focusIndex - 1 + this.matched.length) % this.matched.length;
        this.syncFocus();
        e.preventDefault();
      }
      return;
    }
    // hotkeys 1-9 for quick launch
    if (/^[1-9]$/.test(key) && this.matched.length > 0 && this.matched.length <= 9) {
      const idx = parseInt(key, 10) - 1;
      if (this.matched[idx]) {
        this.launch(this.matched[idx]);
        e.preventDefault();
      }
    }
  }

  // Global keys (explain mode toggle, etc.) not consumed by input
  onWindowKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      const on = document.body.dataset.explain === '1';
      document.body.dataset.explain = on ? '0' : '1';
      this.app.ui.toast(on ? 'explain mode · off' : 'explain mode · on');
    }
    // focus search on any printable key if not already focused
    if (document.activeElement !== this.input &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        e.key.length === 1 && /\S/.test(e.key)) {
      this.input.focus();
    }
  }

  updateCount(n) {
    if (!this.countEl) return;
    this.countEl.textContent = n;
  }

  launch(node) {
    // record in brain
    this.app.intelligence.recordClick(node.id, { query: this.currentQuery });
    this.app.animations.onLaunch(node);
    // open after a small splash
    setTimeout(() => {
      window.open(node.bookmark.url, '_blank', 'noopener');
    }, 180);
  }

  renderRibbon() {
    if (!this.ribbon) return;
    this.ribbon.innerHTML = '';
    // show up to 3 "why now" tags from the top-ranked items
    const pool = this.matched.length > 0
      ? this.matched.slice(0, 6)
      : [...this.app.physics.nodes].sort((a, b) => b.score - a.score).slice(0, 6);

    const seen = new Set();
    let count = 0;
    for (const n of pool) {
      if (count >= 4) break;
      if (!n.topReason) continue;
      if (seen.has(n.topReason)) continue;
      seen.add(n.topReason);
      const el = document.createElement('div');
      el.className = 'tag';
      el.innerHTML = `<em>${n.bookmark.icon && n.bookmark.icon.length <= 3 ? n.bookmark.icon : '·'}</em> ${escapeHtml(n.topReason)}`;
      this.ribbon.appendChild(el);
      count++;
    }
    this.ribbon.dataset.on = count > 0 ? '1' : '0';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
