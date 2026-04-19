// js/intelligence.js
// Temporal + behavioral ranking brain. All state lives in localStorage.
//
// Per-item record (BRAIN.items[id]):
//   v         total visit count
//   lv        last visit timestamp (ms)
//   hh        Uint16Array-style 24-length histogram of hour-of-week visits
//             (actually 24*7 = 168 so we can reason about "around now")
//   dow       7-length count per day-of-week
//   deltas    recent inter-visit gaps (ms) capped at 12
//   bursts    number of rapid-succession visits (< 2min apart)
// Transitions (BRAIN.trans[fromId][toId] = count)
// Aliases (BRAIN.aliases[query] = {id: count})
// Session (BRAIN.session): last few clicks in current run (in memory only)
// Meta (BRAIN.meta): created, lastSeen, totalClicks
// Friction (BRAIN.friction[id]): repeated-search hits, hover-then-skip, etc.

const BRAIN_KEY = 'current.brain.v1';

const EMPTY_BRAIN = () => ({
  meta: { created: Date.now(), lastSeen: Date.now(), totalClicks: 0, totalQueries: 0 },
  items: Object.create(null),
  trans: Object.create(null),
  aliases: Object.create(null),
  friction: Object.create(null),
});

function loadBrain() {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return EMPTY_BRAIN();
    const b = JSON.parse(raw);
    if (!b.meta || !b.items) return EMPTY_BRAIN();
    return b;
  } catch (e) {
    console.warn('[Current] brain parse failed, starting fresh:', e);
    return EMPTY_BRAIN();
  }
}

function saveBrain(b) {
  try {
    localStorage.setItem(BRAIN_KEY, JSON.stringify(b));
  } catch (e) {
    console.warn('[Current] brain save failed:', e);
  }
}

// ---- helpers ----
const HOUR_BIN = 168;
const binOf = (ts = Date.now()) => {
  const d = new Date(ts);
  return (d.getDay() * 24 + d.getHours()) | 0;
};
const hourOf = (ts = Date.now()) => new Date(ts).getHours();
const dowOf  = (ts = Date.now()) => new Date(ts).getDay();

function ensureItem(b, id) {
  if (!b.items[id]) {
    b.items[id] = {
      v: 0, lv: 0,
      hh: new Array(HOUR_BIN).fill(0),
      dow: new Array(7).fill(0),
      deltas: [],
      bursts: 0,
    };
  }
  return b.items[id];
}

// ------------------------------------------------------------------
export class Intelligence {
  constructor(app) {
    this.app = app;
    this.brain = loadBrain();
    this.session = []; // in-memory transition chain (last 6 click ids)
    this.queryHistory = []; // recent queries (for alias learning)
    this.lastQuery = '';
    // Hook unload so we persist at the right moment
    window.addEventListener('beforeunload', () => this.flush());
    // Periodic save just in case
    setInterval(() => this.flush(), 15000);
  }

  flush() {
    this.brain.meta.lastSeen = Date.now();
    saveBrain(this.brain);
  }

  // Called by UI when user clicks a bookmark
  recordClick(id, { query = '' } = {}) {
    const now = Date.now();
    const rec = ensureItem(this.brain, id);
    const prev = rec.lv;
    if (prev) {
      const gap = now - prev;
      rec.deltas.unshift(gap);
      if (rec.deltas.length > 12) rec.deltas.pop();
      if (gap < 2 * 60 * 1000) rec.bursts += 1;
    }
    rec.v += 1;
    rec.lv = now;
    rec.hh[binOf(now)] += 1;
    rec.dow[dowOf(now)] += 1;

    // Transition: from last-clicked → this
    if (this.session.length > 0) {
      const from = this.session[this.session.length - 1];
      if (from !== id) {
        if (!this.brain.trans[from]) this.brain.trans[from] = Object.create(null);
        this.brain.trans[from][id] = (this.brain.trans[from][id] || 0) + 1;
      }
    }
    this.session.push(id);
    if (this.session.length > 6) this.session.shift();

    // Alias learning: if query produced click, remember it
    const q = (query || '').trim().toLowerCase();
    if (q && q.length >= 2) {
      if (!this.brain.aliases[q]) this.brain.aliases[q] = Object.create(null);
      this.brain.aliases[q][id] = (this.brain.aliases[q][id] || 0) + 1;
    }

    this.brain.meta.totalClicks = (this.brain.meta.totalClicks || 0) + 1;
    this.flush();
  }

  // Called when user types (lightly, for friction detection + alias boost)
  recordQuery(q) {
    const s = (q || '').trim().toLowerCase();
    if (!s) return;
    this.lastQuery = s;
    this.brain.meta.totalQueries = (this.brain.meta.totalQueries || 0) + 1;
    this.queryHistory.unshift(s);
    if (this.queryHistory.length > 20) this.queryHistory.pop();

    // Friction: same query typed 3+ times recently → whatever item
    // ends up being clicked after will get a friction resolution boost.
    const reps = this.queryHistory.filter(h => h === s).length;
    if (reps >= 3) {
      // mark a pending friction state — resolved on next click
      this._pendingFriction = s;
    }
  }

  // Score one bookmark at the current moment.
  // Returns an object with partial scores and a `total` and `reasons[]`.
  scoreItem(item) {
    const now = Date.now();
    const rec = this.brain.items[item.id];
    const reasons = [];

    // --- 1. Recency (exp decay, half-life 3 days) ---
    let recency = 0;
    if (rec && rec.lv) {
      const days = (now - rec.lv) / 86400000;
      recency = Math.exp(-days * 0.231); // half-life ~3d
      if (days < 0.03) reasons.push({ w: 'active just now', s: recency });
      else if (days < 1) reasons.push({ w: 'opened today', s: recency });
    }

    // --- 2. Frequency (log-scaled) ---
    const freq = rec ? Math.log10(1 + rec.v) / 2.2 : 0; // 0..~1 for 250 visits

    // --- 3. Hour-of-week affinity ---
    // Compare the current 168-hour bin AND neighbors (a 3-hour window)
    let hourFit = 0;
    if (rec && rec.v > 0) {
      const b = binOf(now);
      const win = [b - 1, b, b + 1, b - 24, b + 24]; // nearby slots including 24h-shift
      const localCount = win.reduce((s, i) => s + (rec.hh[(i + HOUR_BIN) % HOUR_BIN] || 0), 0);
      hourFit = localCount / (rec.v + 1);
      if (hourFit > 0.3) {
        const label = hourBandLabel(new Date(now).getHours());
        reasons.push({ w: `common ${label}`, s: hourFit });
      }
    }

    // --- 4. Day-of-week affinity ---
    let dowFit = 0;
    if (rec && rec.v > 0) {
      const d = dowOf(now);
      dowFit = (rec.dow[d] || 0) / (rec.v + 1);
      if (dowFit > 0.35) {
        const label = dowLabel(d);
        reasons.push({ w: `often on ${label}`, s: dowFit });
      }
    }

    // --- 5. Session context: if a predecessor is in session, boost ---
    let sessionFit = 0;
    for (let i = this.session.length - 1; i >= 0; i--) {
      const from = this.session[i];
      const count = this.brain.trans[from]?.[item.id];
      if (count) {
        const recencyBonus = (this.session.length - i) / this.session.length;
        sessionFit = Math.max(sessionFit, Math.log10(1 + count) / 1.5 * recencyBonus);
      }
    }
    if (sessionFit > 0.2) {
      // find the predecessor that earned this boost for the explanation
      for (let i = this.session.length - 1; i >= 0; i--) {
        if (this.brain.trans[this.session[i]]?.[item.id]) {
          const from = this.app.bookmarksById[this.session[i]];
          if (from) reasons.push({ w: `after ${from.name}`, s: sessionFit });
          break;
        }
      }
    }

    // --- 6. Query alias affinity (only meaningful when query exists) ---
    let queryFit = 0;
    const q = this.lastQuery;
    if (q && this.brain.aliases[q]?.[item.id]) {
      const hits = this.brain.aliases[q][item.id];
      queryFit = Math.log10(1 + hits) / 1.3;
      reasons.push({ w: `learned "${q}"`, s: queryFit });
    }

    // --- 7. Burst recency (recent rapid use) ---
    let burstFit = 0;
    if (rec && rec.bursts > 0 && rec.lv && now - rec.lv < 6 * 3600 * 1000) {
      burstFit = Math.min(1, rec.bursts / 8);
      if (burstFit > 0.3) reasons.push({ w: 'recent burst', s: burstFit });
    }

    // --- 8. Periodic resurface: if a stale item's hour-bin matches NOW, lift ---
    let periodicFit = 0;
    if (rec && rec.v >= 3 && rec.lv && now - rec.lv > 5 * 86400000) {
      // stale but habitual
      const b = binOf(now);
      if ((rec.hh[b] || 0) + (rec.hh[(b + 168 - 1) % 168] || 0) + (rec.hh[(b + 1) % 168] || 0) >= 2) {
        periodicFit = 0.5;
        reasons.push({ w: 'usually around now', s: periodicFit });
      }
    }

    // --- 9. Exploration bonus for items never clicked ---
    // Gives a tiny push so new bookmarks aren't invisible forever
    const virgin = !rec || rec.v === 0;
    const explorationFit = virgin ? 0.12 : 0;

    // --- 10. Weighted sum ---
    const w = {
      recency: 1.2,
      freq: 0.9,
      hour: 1.6,
      dow: 0.7,
      session: 1.8,
      query: 1.8,
      burst: 0.6,
      periodic: 1.1,
      exploration: 0.2,
    };
    const total =
      w.recency * recency +
      w.freq * freq +
      w.hour * hourFit +
      w.dow * dowFit +
      w.session * sessionFit +
      w.query * queryFit +
      w.burst * burstFit +
      w.periodic * periodicFit +
      w.exploration * explorationFit;

    // pick the strongest reason
    reasons.sort((a, b) => b.s - a.s);

    return {
      total,
      parts: { recency, freq, hourFit, dowFit, sessionFit, queryFit, burstFit, periodicFit, explorationFit },
      reasons,
      topReason: reasons[0]?.w || (virgin ? 'unexplored' : null),
    };
  }

  // Convenience: score all, return map id→score obj
  scoreAll(items) {
    const out = Object.create(null);
    for (const it of items) out[it.id] = this.scoreItem(it);
    return out;
  }

  // Build a compact "insights" summary for the user
  insights(bookmarks) {
    const now = Date.now();
    const arr = [];
    for (const b of bookmarks) {
      const r = this.brain.items[b.id];
      if (!r || r.v === 0) continue;
      const score = this.scoreItem(b);
      arr.push({
        id: b.id,
        name: b.name,
        icon: b.icon,
        visits: r.v,
        last: r.lv,
        reason: score.topReason,
        score: score.total,
      });
    }
    arr.sort((a, b) => b.score - a.score);
    return arr;
  }

  resetBrain() {
    this.brain = EMPTY_BRAIN();
    this.session = [];
    this.queryHistory = [];
    this.lastQuery = '';
    this.flush();
  }

  exportBrain() {
    this.flush();
    return JSON.stringify(this.brain, null, 2);
  }

  importBrain(json) {
    const parsed = JSON.parse(json);
    if (!parsed.meta || !parsed.items) throw new Error('not a brain');
    this.brain = parsed;
    this.flush();
  }
}

// ---- label helpers ----
function hourBandLabel(h) {
  if (h >= 5 && h < 11) return 'mornings';
  if (h >= 11 && h < 14) return 'midday';
  if (h >= 14 && h < 18) return 'afternoons';
  if (h >= 18 && h < 22) return 'evenings';
  return 'late hours';
}
function dowLabel(d) {
  return ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'][d];
}

// --- public helpers used by the clock component ---
export function contextLabel(now = new Date()) {
  const h = now.getHours();
  const d = now.getDay();
  const band = hourBandLabel(h);
  const isWeekend = d === 0 || d === 6;
  if (h < 5) return 'late night';
  if (h >= 22) return 'late ' + dowLabel(d);
  if (isWeekend) return (d === 0 ? 'sunday ' : 'saturday ') + band.slice(0, -1);
  return band.slice(0, -1);
}
