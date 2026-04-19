// js/data.js
//
// Data layer — base + overlay model.
//
// `data.json` is ALWAYS re-read on every page load. User customizations
// (adds / edits / deletes / imports) live in a separate "overlay" stored in
// localStorage, applied on top of the fresh base every time.
//
// Means:
//   * You can update data.json on disk and users instantly see the new items
//     (minus anything they specifically deleted).
//   * Upstream edits to a bookmark reach the user too — unless the user also
//     edited that same bookmark, in which case their override wins.
//   * Export is always the full resolved set — what the user sees.
//   * Import replaces the overlay with the diff vs current base.

const OVERLAY_KEY = 'current.overlay.v1';

// Legacy keys we migrate away from
const LEGACY_STORE = 'current.bookmarks.v1';
const LEGACY_SEEDED = 'current.seeded.v1';

export class DataStore {
  constructor() {
    this.base = [];
    this.overlay = {
      deletedIds: new Set(),          // base ids the user removed
      overrides: new Map(),           // base id → modified bookmark
      additions: [],                  // brand-new user items
    };
  }

  async load() {
    // 1. fresh base every load
    this.base = await fetchBase();

    // 2. overlay from localStorage (with migration)
    this._readOverlay();

    // 3. resolve merged set
    return this.resolve();
  }

  // Compose base + overlay → current effective bookmark list
  resolve() {
    const out = [];
    for (const b of this.base) {
      if (this.overlay.deletedIds.has(b.id)) continue;
      out.push(this.overlay.overrides.get(b.id) || b);
    }
    for (const a of this.overlay.additions) out.push(a);
    return out;
  }

  // ---------- mutations ----------
  add(item) {
    const n = normalize({ ...item, id: item.id || cryptoUUID() });
    // collision with a base id → treat as override (+ un-delete)
    if (this._inBase(n.id)) {
      this.overlay.overrides.set(n.id, n);
      this.overlay.deletedIds.delete(n.id);
    } else {
      this.overlay.additions = this.overlay.additions.filter(x => x.id !== n.id);
      this.overlay.additions.push(n);
    }
    this._persist();
    return n;
  }

  edit(id, item) {
    const n = normalize({ ...item, id });
    if (this._inBase(id)) {
      this.overlay.overrides.set(id, n);
      this.overlay.deletedIds.delete(id);
    } else {
      const idx = this.overlay.additions.findIndex(x => x.id === id);
      if (idx >= 0) this.overlay.additions[idx] = n;
      else this.overlay.additions.push(n);
    }
    this._persist();
    return n;
  }

  remove(id) {
    if (this._inBase(id)) {
      this.overlay.deletedIds.add(id);
      this.overlay.overrides.delete(id);
    } else {
      this.overlay.additions = this.overlay.additions.filter(x => x.id !== id);
    }
    this._persist();
  }

  // Import = "make the resolved set look like this list". Computes diff vs
  // current base and stores it as the overlay.
  importAll(arr) {
    const desired = (arr || []).map(x => normalize({ ...x, id: x.id || cryptoUUID() }));
    const desiredById = new Map(desired.map(x => [x.id, x]));
    const baseById = new Map(this.base.map(b => [b.id, b]));

    this.overlay.deletedIds = new Set();
    this.overlay.overrides = new Map();
    this.overlay.additions = [];

    // Any base item the user didn't include → mark deleted
    for (const b of this.base) {
      if (!desiredById.has(b.id)) this.overlay.deletedIds.add(b.id);
    }
    // Process desired items
    for (const d of desired) {
      if (baseById.has(d.id)) {
        if (!sameBookmark(baseById.get(d.id), d)) {
          this.overlay.overrides.set(d.id, d);
        }
      } else {
        this.overlay.additions.push(d);
      }
    }
    this._persist();
  }

  // Full export — always the complete resolved set
  exportAll() {
    return JSON.stringify(this.resolve(), null, 2);
  }

  // ---------- internals ----------
  _inBase(id) {
    for (const b of this.base) if (b.id === id) return true;
    return false;
  }

  _readOverlay() {
    // Try new overlay format
    try {
      const raw = localStorage.getItem(OVERLAY_KEY);
      if (raw) {
        const ov = JSON.parse(raw);
        this.overlay.deletedIds = new Set(ov.deletedIds || []);
        this.overlay.overrides = new Map(
          Object.entries(ov.overrides || {}).map(([k, v]) => [k, normalize({ ...v, id: k })])
        );
        this.overlay.additions = (ov.additions || []).map(normalize);
        return;
      }
    } catch (e) {
      console.warn('[Current] overlay corrupted, resetting', e);
    }

    // Migrate from legacy full-dump format
    try {
      const legacy = localStorage.getItem(LEGACY_STORE);
      if (legacy) {
        const arr = JSON.parse(legacy);
        if (Array.isArray(arr)) {
          console.log('[Current] migrating legacy bookmark store → overlay model');
          this.importAll(arr);  // computes overlay vs base, persists
          localStorage.removeItem(LEGACY_STORE);
          localStorage.removeItem(LEGACY_SEEDED);
        }
      }
    } catch (e) {
      console.warn('[Current] legacy migration failed', e);
    }
  }

  _persist() {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify({
        deletedIds: [...this.overlay.deletedIds],
        overrides: Object.fromEntries(this.overlay.overrides),
        additions: this.overlay.additions,
      }));
    } catch (e) {
      console.warn('[Current] overlay persist failed', e);
    }
  }
}

// ---------- helpers ----------
async function fetchBase() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const txt = await res.text();
    const parsed = JSON.parse(txt);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize);
  } catch (e) {
    console.warn('[Current] data.json not loaded — starting empty base', e);
    return [];
  }
}

function normalize(raw) {
  const x = raw || {};
  return {
    id: x.id || cryptoUUID(),
    name: String(x.name || x.title || 'Untitled'),
    url: String(x.url || ''),
    icon: String(x.icon || ''),
    group: String(x.group || ''),
    tags: Array.isArray(x.tags) ? x.tags.join(', ') : String(x.tags || ''),
    description: String(x.description || ''),
  };
}

function sameBookmark(a, b) {
  return a.name === b.name && a.url === b.url && a.icon === b.icon
      && a.group === b.group && a.tags === b.tags && a.description === b.description;
}

export function cryptoUUID() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
