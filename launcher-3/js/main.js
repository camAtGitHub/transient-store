// <script>
// js/main.js
// The orchestrator. Wires every module together, builds the bookmark field,
// hooks up the live CRUD methods, and starts the simulation.
//
// Boot order matters:
//   1. Load bookmarks (from data.json or localStorage)
//   2. Intelligence  — needs nothing
//   3. Animations    — picks the variant (used by physics + search)
//   4. Physics       — builds spatial layout from bookmarks + scores
//   5. Search        — needs physics nodes
//   6. UI            — needs everything else
//   7. Mount DOM nodes onto stage
//   8. Reveal + start the loop

import { DataStore, cryptoUUID } from './data.js';
import { Intelligence } from './intelligence.js';
import { Animations } from './animations.js';
import { Physics } from './physics.js';
import { PerfTier } from './perf.js';
import { Search } from './search.js';
import { UI } from './ui.js';

const STAGE = document.getElementById('stage');

// ---------- the app object ----------
// Modules receive `app` and reach across via app.physics / app.search / etc.
const app = {
  bookmarks: [],
  bookmarksById: new Map(),
  variant: 'undertow',

  // module slots
  store: null,
  intelligence: null,
  animations: null,
  perf: null,
  physics: null,
  search: null,
  ui: null,

  _syncFromStore() {
    this.bookmarks = this.store.resolve();
    this.bookmarksById.clear();
    for (const b of this.bookmarks) this.bookmarksById.set(b.id, b);
  },

  // ------------- mutation API used by UI -------------
  addBookmark(item) {
    this.store.add(item);
    this._syncFromStore();
    this._rebuildField();
    this.ui?.updateStats();
  },

  deleteBookmark(id) {
    this.store.remove(id);
    this._syncFromStore();
    this._rebuildField();
    this.ui?.updateStats();
  },

  replaceBookmark(id, item) {
    this.store.edit(id, item);
    this._syncFromStore();
    this._rebuildField();
    this.ui?.updateStats();
  },

  replaceAll(arr) {
    this.store.importAll(arr);
    this._syncFromStore();
    this._rebuildField();
    this.ui?.updateStats();
  },

  // Full export — always everything the user sees (base + overlay resolved)
  exportBookmarksJSON() {
    return this.store.exportAll();
  },

  // Recompute scores + relevance buckets without rebuilding the whole field.
  // Used after the brain is reset/imported.
  rescore() {
    const scoreMap = this.intelligence.scoreAll(this.bookmarks);
    rerankRelevance(this.physics.nodes, scoreMap);
    // Also refresh dataset attrs on each item
    for (const node of this.physics.nodes) {
      const s = scoreMap[node.bookmark.id];
      if (!s) continue;
      node.score = s.total;
      node.reasons = s.reasons;
      node.topReason = s.topReason;
      if (node.el) {
        node.el.dataset.rel = node.rel;
        const why = node.el.querySelector('.why');
        if (why) why.textContent = node.topReason || '';
      }
    }
    this.search?.renderRibbon?.();
  },

  // Internal: full rebuild of the bookmark field after a CRUD mutation.
  _rebuildField() {
    // Tear down existing item DOM
    for (const node of this.physics.nodes) {
      if (node.el && node.el.parentNode) node.el.parentNode.removeChild(node.el);
    }
    const scoreMap = this.intelligence.scoreAll(this.bookmarks);
    this.physics.build(this.bookmarks, scoreMap);
    rerankRelevance(this.physics.nodes, scoreMap);
    mountNodes(this);
    // Trigger initial flushDOM so positions are correct immediately
    this.physics.flushDOM();
    // If a search is currently active, re-run it against the new field
    if (this.search?.currentQuery) {
      this.search.run(this.search.currentQuery);
    } else {
      this.search?.renderRibbon?.();
      this.search?.updateCount?.(this.physics.nodes.length);
    }
  },
};

// ---------- bootstrap ----------
boot();

async function boot() {
  // 1. bookmarks via DataStore (re-reads data.json every load, overlay on top)
  app.store = new DataStore();
  app.bookmarks = await app.store.load();
  for (const b of app.bookmarks) app.bookmarksById.set(b.id, b);

  // 2. session perf tier (fixed at boot; intentionally not re-evaluated mid-session)
  app.perf = new PerfTier(app.bookmarks.length);
  document.body.dataset.tier = app.perf.tier;

  // 3. brain
  app.intelligence = new Intelligence(app);

  // 4. animations + variant
  app.animations = new Animations(app);
  app.variant = app.animations.pickVariant();
  document.body.dataset.variant = app.variant;

  // 5. physics
  app.physics = new Physics(app);
  const scoreMap = app.intelligence.scoreAll(app.bookmarks);
  app.physics.build(app.bookmarks, scoreMap);
  rerankRelevance(app.physics.nodes, scoreMap);

  // 6. search
  app.search = new Search(app);

  // 7. ui
  app.ui = new UI(app);

  // 8. construct DOM, attach to stage
  mountNodes(app);

  // 9. wire up & start
  app.search.init();
  app.ui.init();
  app.ui.updateStats();

  // initial DOM positions — flush once before reveal so items don't blink
  app.physics.flushDOM();
  app.animations.reveal();
  app.physics.start();

  // Visibility throttle: full halt when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.physics?.pause();
      app.animations?.pause();
    } else {
      app.physics?.resume();
      app.animations?.resume();
    }
  });

  // Search is the cursor's resting place
  setTimeout(() => {
    document.getElementById('search')?.focus({ preventScroll: true });
  }, 700);

  // Console banner — variant gossip
  printBanner(app.variant, app.bookmarks.length, app.perf.tier);
}

// ---------- DOM construction ----------
function mountNodes(app) {
  const frag = document.createDocumentFragment();
  for (const node of app.physics.nodes) {
    const el = makeItemEl(node);
    node.el = el;
    frag.appendChild(el);
  }
  // Wipe existing items (preserve the .stage-ghost decorative div)
  const ghost = STAGE.querySelector('.stage-ghost');
  STAGE.innerHTML = '';
  if (ghost) STAGE.appendChild(ghost);
  STAGE.appendChild(frag);

  // Wire click handlers (delegated for performance)
  STAGE.onclick = (ev) => {
    const itemEl = ev.target.closest('.item');
    if (!itemEl) return;
    ev.preventDefault();
    const id = itemEl.dataset.id;
    const node = app.physics.idIndex.get(id);
    if (node) app.search.launch(node);
  };
}

function makeItemEl(node) {
  const a = document.createElement('a');
  a.href = node.bookmark.url || '#';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'item';
  a.dataset.id = node.id;
  a.dataset.rel = node.rel;
  a.dataset.state = node.state;
  a.title = `${node.bookmark.name}${node.bookmark.description ? ' — ' + node.bookmark.description : ''}\n${node.bookmark.url}`;

  // Asymmetric organic shape per item
  const s = node.shape;
  a.style.setProperty('--r1', s[0].toFixed(1));
  a.style.setProperty('--r2', s[1].toFixed(1));
  a.style.setProperty('--r3', s[2].toFixed(1));
  a.style.setProperty('--r4', s[3].toFixed(1));
  a.style.setProperty('--r5', s[4].toFixed(1));
  a.style.setProperty('--r6', s[5].toFixed(1));
  a.style.setProperty('--r7', s[6].toFixed(1));
  a.style.setProperty('--r8', s[7].toFixed(1));

  // icon
  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.innerHTML = renderIcon(node.bookmark);
  a.appendChild(icon);

  // label
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = node.bookmark.name;
  a.appendChild(label);

  // hot key badge (1-9, becomes visible only when search.with-hot is set)
  const hot = document.createElement('span');
  hot.className = 'hot';
  hot.textContent = '';
  a.appendChild(hot);

  // why (reason hover / explain mode)
  const why = document.createElement('span');
  why.className = 'why';
  why.textContent = node.topReason || '';
  a.appendChild(why);

  // Initial transform — physics will overwrite immediately
  a.style.transform = `translate3d(${node.x.toFixed(1)}px, ${node.y.toFixed(1)}px, 0)`;
  a.style.opacity = '0'; // reveal() will fade them in

  return a;
}

function renderIcon(b) {
  const ic = (b.icon || '').trim();
  if (!ic) {
    // fallback: first character of name
    const ch = (b.name || '?').trim().slice(0, 1).toUpperCase();
    return `<span style="font-family:'Fraunces',serif;font-style:italic">${escapeHtml(ch)}</span>`;
  }
  if (/^https?:\/\//i.test(ic)) {
    return `<img src="${escapeAttr(ic)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  }
  // emoji or short text
  return escapeHtml(ic);
}

// ---------- relevance bucketing ----------
// Re-rank nodes into hi/mid/lo/xlo using quartiles of the score distribution
// so the visual hierarchy is always meaningful regardless of absolute scale.
function rerankRelevance(nodes, scoreMap) {
  if (nodes.length === 0) return;
  const scores = nodes
    .map(n => scoreMap[n.bookmark.id]?.total || 0)
    .slice()
    .sort((a, b) => a - b);
  const q = (p) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
  const t1 = q(0.30); // bottom 30% = xlo
  const t2 = q(0.65); // mid
  const t3 = q(0.88); // top ~12% = hi

  for (const node of nodes) {
    const sc = scoreMap[node.bookmark.id]?.total || 0;
    let rel = 'mid';
    if (sc <= t1) rel = 'xlo';
    else if (sc <= t2) rel = 'lo';
    else if (sc >= t3) rel = 'hi';
    node.rel = rel;
    node.score = sc;
    if (node.el) node.el.dataset.rel = rel;
  }
}

// ---------- console banner ----------
function printBanner(variant, count, tier) {
  const msg = `\n  ╭─────────────────────────────────────╮\n  │  Current · a temporal launcher      │\n  │  variant: ${variant.padEnd(28)}│\n  │  tier: ${tier.padEnd(31)}│\n  │  loaded ${String(count).padStart(3)} bookmarks${' '.repeat(18)}│\n  ╰─────────────────────────────────────╯\n`;
  console.log(
    '%c' + msg,
    'color:#9af3d8;font-family:JetBrains Mono,monospace;line-height:1.4;font-weight:500'
  );
  console.log(
    '%cTry: type to filter · 1–9 to launch · ⌘/ctrl+E to explain · esc to release',
    'color:#7a8a90;font-family:JetBrains Mono,monospace;font-size:11px'
  );
}

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// expose for debugging in dev console
window.__current = app;
