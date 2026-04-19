// js/ui.js
// Drawer, theme toggle, modals (add/edit/manage/insights),
// import/export, clock + context label, toast.

import { contextLabel } from './intelligence.js';

export class UI {
  constructor(app) {
    this.app = app;
    this.drawer = document.getElementById('drawer');
    this.drawerBtn = document.getElementById('menu-btn');
    this.modalRoot = document.getElementById('modal-root');
    this.toastEl = document.getElementById('toast');
    this.fileInput = document.getElementById('file-input');
    this._toastTimer = null;
    this._fileHandler = null;
  }

  init() {
    // Theme: restore preference (backwards compat: 'light'/'dark' → theme ids)
    const saved = localStorage.getItem('current.theme');
    const validIds = new Set(this.THEMES.map(t => t.id));
    this.setTheme(validIds.has(saved) ? saved : 'dark');

    // Drawer toggle
    this.drawerBtn.addEventListener('click', () => this.toggleDrawer());
    document.getElementById('drawer-close').addEventListener('click', () => this.setDrawer(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.dataset.drawer === 'open') this.setDrawer(false);
    });

    // Drawer actions
    this.drawer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      this.runAction(btn.dataset.act);
    });

    // Modal scrim close
    this.modalRoot.addEventListener('click', (e) => {
      if (e.target === this.modalRoot || e.target.classList.contains('modal-scrim')) {
        this.closeModal();
      }
    });

    // Clock + context label, update every 30s
    this.updateClock();
    setInterval(() => this.updateClock(), 30000);

    this.updateStats();
  }

  // -------- theme --------
  // Themes are CSS classes on <body>. Adding a theme = one CSS block in
  // theme.css + one entry in THEMES below. Order = cycle order.
  get THEMES() {
    return [
      { id: 'dark',    label: 'Moonlit Bloom',  mode: 'dark'  },
      { id: 'light',   label: 'Dawn Tide',      mode: 'light' },
      { id: 'abyss',   label: 'Abyssal Drift',  mode: 'dark'  },
      { id: 'bamboo',  label: 'Bamboo Rain',    mode: 'light' },
    ];
  }

  setTheme(id) {
    const t = this.THEMES.find(x => x.id === id) || this.THEMES[0];
    const body = document.body;
    // clear all theme-* classes, add target
    for (const th of this.THEMES) body.classList.remove(`theme-${th.id}`);
    body.classList.add(`theme-${t.id}`);
    // legacy aliases so existing `.theme-light` / `.theme-dark` rules keep working
    body.classList.toggle('theme-light', t.mode === 'light');
    body.classList.toggle('theme-dark',  t.mode === 'dark');
    body.dataset.theme = t.id;
    body.dataset.themeMode = t.mode;
    localStorage.setItem('current.theme', t.id);
    this._currentTheme = t;
  }

  flipTheme() {
    const cur = document.body.dataset.theme || 'dark';
    const list = this.THEMES;
    const idx = Math.max(0, list.findIndex(x => x.id === cur));
    const next = list[(idx + 1) % list.length];
    this.setTheme(next.id);
    this.toast(next.label);
  }

  // -------- drawer --------
  toggleDrawer() { this.setDrawer(document.body.dataset.drawer !== 'open'); }
  setDrawer(open) {
    document.body.dataset.drawer = open ? 'open' : 'closed';
    this.drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) this.updateStats();
  }

  runAction(act) {
    switch (act) {
      case 'theme':        this.flipTheme(); break;
      case 'add':          this.openAddModal(); break;
      case 'manage':       this.openManageModal(); break;
      case 'export-data':  this.exportBookmarks(); break;
      case 'import-data':  this.importBookmarks(); break;
      case 'export-brain': this.exportBrain(); break;
      case 'import-brain': this.importBrain(); break;
      case 'reset-brain':  this.confirmResetBrain(); break;
      case 'insights':     this.openInsightsModal(); break;
      case 'close':        this.setDrawer(false); break;
    }
  }

  // -------- clock --------
  updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock-time').textContent = `${hh}:${mm}`;
    const ctx = contextLabel(now);
    const sub = document.getElementById('clock-sub');
    const wm  = document.getElementById('wm-context');
    if (sub) sub.textContent = ctx;
    if (wm)  wm.textContent  = ctx;
  }

  // -------- stats --------
  updateStats() {
    const si = document.getElementById('stat-items');
    const sc = document.getElementById('stat-clicks');
    const sv = document.getElementById('stat-variant');
    if (si) si.textContent = `${this.app.bookmarks.length} items`;
    if (sc) sc.textContent = `${this.app.intelligence.brain.meta.totalClicks || 0} clicks learned`;
    if (sv) sv.textContent = `variant · ${this.app.variant}`;
  }

  // -------- toast --------
  toast(msg) {
    clearTimeout(this._toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), 2400);
  }

  // -------- modal machinery --------
  openModal(html) {
    this.modalRoot.innerHTML = `
      <div class="modal-scrim"></div>
      <div class="modal" role="dialog" aria-modal="true">${html}</div>
    `;
    this.modalRoot.dataset.open = '1';
    this.setDrawer(false);
    // focus first input if any
    requestAnimationFrame(() => {
      const i = this.modalRoot.querySelector('input, textarea, button');
      if (i) i.focus();
    });
  }
  closeModal() {
    this.modalRoot.dataset.open = '0';
    setTimeout(() => { this.modalRoot.innerHTML = ''; }, 400);
  }

  // -------- add bookmark --------
  openAddModal(editing = null) {
    const b = editing || { name: '', tags: '', url: '', icon: '', group: '', description: '' };
    this.openModal(`
      <h2>${editing ? 'Edit' : 'Add'} bookmark</h2>
      <div class="field">
        <label>name</label>
        <input type="text" id="f-name" value="${esc(b.name)}" placeholder="Company Portal" />
      </div>
      <div class="field">
        <label>url</label>
        <input type="url" id="f-url" value="${esc(b.url)}" placeholder="https://…" />
      </div>
      <div class="row">
        <div class="field">
          <label>icon · emoji or url</label>
          <input type="text" id="f-icon" value="${esc(b.icon)}" placeholder="🏛 or https://…/favicon.ico" />
        </div>
        <div class="field">
          <label>group</label>
          <input type="text" id="f-group" value="${esc(b.group || '')}" placeholder="Internal Tools" />
        </div>
      </div>
      <div class="field">
        <label>tags · comma-separated</label>
        <input type="text" id="f-tags" value="${esc(b.tags)}" placeholder="hr, news, internal" />
      </div>
      <div class="field">
        <label>description</label>
        <textarea id="f-desc" placeholder="One-liner">${esc(b.description || '')}</textarea>
      </div>
      <div class="modal-foot">
        ${editing ? `<button class="btn btn-danger" data-confirm-delete="${esc(editing.id)}">delete</button>` : ''}
        <button class="btn" data-close>cancel</button>
        <button class="btn btn-primary" data-save>${editing ? 'save' : 'add'}</button>
      </div>
    `);
    this.modalRoot.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('[data-save]').addEventListener('click', () => {
      const name  = document.getElementById('f-name').value.trim();
      const url   = document.getElementById('f-url').value.trim();
      const icon  = document.getElementById('f-icon').value.trim();
      const group = document.getElementById('f-group').value.trim();
      const tags  = document.getElementById('f-tags').value.trim();
      const desc  = document.getElementById('f-desc').value.trim();
      if (!name || !url) { this.toast('name and url are required'); return; }
      const item = {
        id: editing ? editing.id : cryptoUUID(),
        name, url, icon, tags, group, description: desc,
      };
      if (editing) this.app.replaceBookmark(editing.id, item);
      else         this.app.addBookmark(item);
      this.closeModal();
      this.toast(editing ? 'saved' : 'added');
    });
    const delBtn = this.modalRoot.querySelector('[data-confirm-delete]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!confirm(`Delete "${editing.name}"?`)) return;
        this.app.deleteBookmark(editing.id);
        this.closeModal();
        this.toast('removed');
      });
    }
  }

  // -------- manage all --------
  openManageModal() {
    const rows = [...this.app.bookmarks]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(b => `
        <div class="manage-row" data-id="${esc(b.id)}">
          <div class="mi">${iconToHtml(b.icon)}</div>
          <div class="mn">${esc(b.name)}</div>
          <div class="mu">${esc(b.url)}</div>
          <div class="ma">
            <button data-edit="${esc(b.id)}" title="edit">✎</button>
            <button data-del="${esc(b.id)}" title="delete">×</button>
          </div>
        </div>
      `).join('');
    this.openModal(`
      <h2>Manage bookmarks</h2>
      <div class="manage-list">${rows || '<div style="opacity:.6;font-style:italic">nothing yet</div>'}</div>
      <div class="modal-foot">
        <button class="btn" data-close>close</button>
        <button class="btn btn-primary" data-add>＋ add new</button>
      </div>
    `);
    this.modalRoot.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('[data-add]').addEventListener('click', () => this.openAddModal());
    this.modalRoot.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const item = this.app.bookmarks.find(x => x.id === b.dataset.edit);
        if (item) this.openAddModal(item);
      });
    });
    this.modalRoot.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        const item = this.app.bookmarks.find(x => x.id === b.dataset.del);
        if (!item) return;
        if (!confirm(`Delete "${item.name}"?`)) return;
        this.app.deleteBookmark(item.id);
        this.openManageModal();
      });
    });
  }

  // -------- insights --------
  openInsightsModal() {
    const data = this.app.intelligence.insights(this.app.bookmarks);
    const rows = data.slice(0, 40).map(d => `
      <div class="insight-row">
        <div class="ix">${iconToHtml(findIcon(this.app, d.id))} ${esc(d.name)}</div>
        <div class="iy">${esc(d.reason || '—')}</div>
        <div class="iz">visits ${d.visits} · last ${relTime(d.last)} · score ${d.score.toFixed(2)}</div>
      </div>
    `).join('');
    this.openModal(`
      <h2>What the brain has learned</h2>
      <div class="insights-list">${rows || '<div style="opacity:.6;font-style:italic">no clicks yet — use it for a day, then come back.</div>'}</div>
      <div class="modal-foot">
        <button class="btn" data-close>close</button>
      </div>
    `);
    this.modalRoot.querySelector('[data-close]').addEventListener('click', () => this.closeModal());
  }

  // -------- export / import --------
  exportBookmarks() {
    const json = this.app.exportBookmarksJSON
      ? this.app.exportBookmarksJSON()
      : JSON.stringify(this.app.bookmarks, null, 2);
    downloadJson('current-bookmarks.json', json);
    this.toast('exported');
  }
  importBookmarks() {
    this.pickFile((json) => {
      try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error('expected array');
        const cleaned = parsed.map(x => ({
          id: x.id || cryptoUUID(),
          name: x.name || 'Untitled',
          url: x.url || '',
          icon: x.icon || '',
          group: x.group || '',
          tags: x.tags || '',
          description: x.description || '',
        }));
        this.app.replaceAll(cleaned);
        this.toast(`imported ${cleaned.length} bookmarks`);
      } catch (e) {
        this.toast('import failed · ' + e.message);
      }
    });
  }
  exportBrain() {
    const json = this.app.intelligence.exportBrain();
    downloadJson('current-brain.json', json);
    this.toast('brain exported');
  }
  importBrain() {
    this.pickFile((json) => {
      try {
        this.app.intelligence.importBrain(json);
        this.app.rescore();
        this.toast('brain restored');
      } catch (e) {
        this.toast('invalid brain · ' + e.message);
      }
    });
  }
  confirmResetBrain() {
    if (!confirm('Reset all learned behavior? This cannot be undone.')) return;
    this.app.intelligence.resetBrain();
    this.app.rescore();
    this.toast('brain reset');
    this.updateStats();
  }

  pickFile(cb) {
    this._fileHandler = cb;
    this.fileInput.onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const text = await f.text();
      this._fileHandler?.(text);
      this.fileInput.value = '';
    };
    this.fileInput.click();
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function iconToHtml(icon) {
  if (!icon) return '<span style="opacity:.5">·</span>';
  if (/^https?:\/\//.test(icon)) return `<img src="${esc(icon)}" style="width:16px;height:16px;border-radius:4px" alt="" />`;
  return esc(icon);
}

function findIcon(app, id) {
  const b = app.bookmarks.find(x => x.id === id);
  return b?.icon || '';
}

function relTime(ts) {
  if (!ts) return 'never';
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return `${d|0}s ago`;
  if (d < 3600) return `${(d/60)|0}m ago`;
  if (d < 86400) return `${(d/3600)|0}h ago`;
  return `${(d/86400)|0}d ago`;
}

function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

function cryptoUUID() {
  if (crypto && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
