import { fetchSecurityPayload } from './api.js';
import { GraphRenderer } from './renderer.js';
import { buildSecurityStore, buildGraphFromStore } from './store.js';
import { DEFAULT_FIELDS } from './utils.js';
import { kHopNeighborhood, shortestPath, topPivots } from './analysis.js';

const el = (id) => document.getElementById(id);
const statusDot = el('statusDot');
const statusText = el('statusText');
const statsEl = el('stats');
const detailsEl = el('selectionDetails');
const pivotEl = el('pivotList');

const renderer = new GraphRenderer(el('graphCanvas'), el('overlayCanvas'));
const worker = new Worker('./js/layoutWorker.js');
const app = {
  store: null,
  graph: { nodes: [], edges: [], nodeById: {} },
  positioned: null,
  selectedNode: null,
  timer: null,
};

initFieldChecks();
bindUI();
loadPersistedConnection();
seedTime();

worker.onmessage = (evt) => {
  const g = evt.data;
  g.nodeById = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  app.positioned = g;
  renderer.progressiveFactor = 0.18;
  renderer.render(g);
  refreshStats();
  renderPivots();
  setStatus('live', `Ready • ${g.nodes.length} nodes`);
};

function bindUI() {
  el('connectBtn').addEventListener('click', loadData);
  el('rebuildBtn').addEventListener('click', rebuildGraph);
  el('playBtn').addEventListener('click', startPlayback);
  el('pauseBtn').addEventListener('click', stopPlayback);
  el('stepBtn').addEventListener('click', stepTimeline);
  el('timeline').addEventListener('input', applyTimelineFilter);
  el('searchInput').addEventListener('change', searchNode);
  el('resetViewBtn').addEventListener('click', () => renderer.resetView());
  el('khopBtn').addEventListener('click', () => doKHop(2));
  el('shortestBtn').addEventListener('click', doShortestPath);
  el('timePreset').addEventListener('change', onPreset);
  el('noiseFloor').addEventListener('change', rebuildGraph);
}

async function loadData() {
  persistConnection();
  setStatus('loading', 'Loading findings...');
  try {
    const payload = await fetchSecurityPayload({
      endpoint: el('endpoint').value.trim(),
      username: el('username').value.trim(),
      password: el('password').value,
      size: 5000,
    });
    app.store = buildSecurityStore(payload.findings, payload.ioc);
    detailsEl.innerHTML = `Loaded <b>${app.store.findings.length}</b> findings and <b>${app.store.iocs.length}</b> IOC findings.`;
    rebuildGraph();
  } catch (err) {
    setStatus('error', `Failed: ${err.message}`);
  }
}

function rebuildGraph() {
  if (!app.store) return;
  setStatus('loading', 'Building correlation graph...');
  const options = getGraphOptions();
  app.graph = buildGraphFromStore(app.store, options);
  app.graph.nodeById = Object.fromEntries(app.graph.nodes.map((n) => [n.id, n]));
  const prev = app.positioned?.nodeById || {};
  const { width, height } = el('graphCanvas').getBoundingClientRect();
  worker.postMessage({ nodes: app.graph.nodes, edges: app.graph.edges, width, height, previous: prev });
}

function getGraphOptions() {
  const checked = [...document.querySelectorAll('[data-field-check]:checked')].map((x) => x.value);
  const extras = el('extraFields').value.split(',').map((x) => x.trim()).filter(Boolean);
  const [start, end] = getTimeRangeMs();
  return {
    correlateFields: [...new Set([...checked, ...extras])],
    storyWindowMinutes: Number(el('storyWindow').value) || 15,
    noiseFloor: Number(el('noiseFloor').value) || 1,
    hubThreshold: Number(el('hubThreshold').value) || 8,
    timeStart: start,
    timeEnd: end,
  };
}

function refreshStats() {
  if (!app.positioned) return;
  const nodeCount = app.positioned.nodes.length;
  const edgeCount = app.positioned.edges.length;
  const risk = app.positioned.nodes.filter((n) => ['critical', 'high'].includes(n.severity)).length;
  statsEl.innerHTML = [
    `Nodes: <b>${nodeCount}</b>`,
    `Edges: <b>${edgeCount}</b>`,
    `High/Critical: <b>${risk}</b>`,
  ].join('<br>');
}

function renderPivots() {
  if (!app.positioned) return;
  const pivots = topPivots(app.positioned);
  pivotEl.innerHTML = pivots.map((p) => `<div class="pivot-item" data-pivot-id="${p.id}">${p.label}<br><small>degree=${p.degree}</small></div>`).join('');
  pivotEl.querySelectorAll('[data-pivot-id]').forEach((x) => x.addEventListener('click', () => focusNode(x.dataset.pivotId)));
}

function searchNode() {
  const q = el('searchInput').value.trim().toLowerCase();
  if (!q || !app.positioned) return;
  const node = app.positioned.nodes.find((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
  if (!node) return;
  focusNode(node.id);
}

function doShortestPath() {
  if (!app.positioned) return;
  const matches = app.positioned.nodes.filter((n) => n.label.toLowerCase().includes(el('searchInput').value.trim().toLowerCase())).slice(0, 2);
  if (matches.length < 2) {
    detailsEl.textContent = 'Enter text that matches at least two nodes for shortest path.';
    return;
  }
  const path = shortestPath(app.positioned, matches[0].id, matches[1].id);
  detailsEl.textContent = path.length ? `Shortest path (${path.length - 1} hops): ${path.join(' -> ')}` : 'No path found.';
}

function doKHop(k) {
  if (!app.positioned || !app.selectedNode) return;
  const keep = kHopNeighborhood(app.positioned, app.selectedNode.id, k);
  const filtered = {
    ...app.positioned,
    nodes: app.positioned.nodes.filter((n) => keep.has(n.id)),
    edges: app.positioned.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
  filtered.nodeById = Object.fromEntries(filtered.nodes.map((n) => [n.id, n]));
  filtered.visibleNodes = filtered.nodes.length;
  filtered.visibleEdges = filtered.edges.length;
  renderer.progressiveFactor = 1;
  renderer.render(filtered);
  detailsEl.textContent = `K-hop=${k} around ${app.selectedNode.label}, keeping ${filtered.nodes.length} nodes.`;
}

function focusNode(id) {
  const node = app.positioned.nodeById[id];
  if (!node) return;
  app.selectedNode = node;
  renderer.transform.x = -node.x * renderer.transform.k;
  renderer.transform.y = -node.y * renderer.transform.k;
  renderer.render(app.positioned);
  detailsEl.innerHTML = `<b>${node.label}</b><br>Type: ${node.type}<br>Severity: ${node.severity}<br>Degree: ${node.degree}`;
}

function startPlayback() {
  stopPlayback();
  app.timer = setInterval(() => {
    const t = el('timeline');
    t.value = String(Math.max(0, Number(t.value) - 2));
    applyTimelineFilter();
    if (Number(t.value) <= 0) stopPlayback();
  }, 120);
}

function stopPlayback() { if (app.timer) clearInterval(app.timer); app.timer = null; }
function stepTimeline() {
  const t = el('timeline');
  t.value = String(Math.max(0, Number(t.value) - 5));
  applyTimelineFilter();
}

function applyTimelineFilter() {
  if (!app.positioned) return;
  const pct = Number(el('timeline').value) / 100;
  const times = app.positioned.nodes.map((n) => n.timestamp).filter(Boolean);
  const min = Math.min(...times), max = Math.max(...times);
  const cutoff = min + (max - min) * pct;
  const filtered = {
    ...app.positioned,
    nodes: app.positioned.nodes.filter((n) => !n.timestamp || n.timestamp <= cutoff),
  };
  const ids = new Set(filtered.nodes.map((n) => n.id));
  filtered.edges = app.positioned.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  filtered.nodeById = Object.fromEntries(filtered.nodes.map((n) => [n.id, n]));
  filtered.visibleNodes = filtered.nodes.length;
  filtered.visibleEdges = filtered.edges.length;
  renderer.progressiveFactor = 0.9;
  renderer.render(filtered);
}

function initFieldChecks() {
  const wrapper = el('fieldChecks');
  wrapper.innerHTML = DEFAULT_FIELDS.map((f, i) => `<label><input type="checkbox" data-field-check value="${f}" ${i === 0 ? 'checked' : ''}>${f}</label>`).join('');
}

function setStatus(mode, text) {
  statusDot.className = `dot ${mode}`;
  statusText.textContent = text;
}

function seedTime() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  el('startTime').value = toLocalInput(start);
  el('endTime').value = toLocalInput(end);
}

function onPreset() {
  const v = el('timePreset').value;
  if (v === 'custom') return;
  const mins = Number(v);
  const end = new Date();
  const start = new Date(end.getTime() - mins * 60000);
  el('startTime').value = toLocalInput(start);
  el('endTime').value = toLocalInput(end);
}

function getTimeRangeMs() {
  const s = new Date(el('startTime').value);
  const e = new Date(el('endTime').value);
  return [s.getTime(), e.getTime()];
}

function toLocalInput(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

function persistConnection() {
  localStorage.setItem('camce.conn', JSON.stringify({ endpoint: el('endpoint').value, username: el('username').value }));
}

function loadPersistedConnection() {
  try {
    const d = JSON.parse(localStorage.getItem('camce.conn') || '{}');
    if (d.endpoint) el('endpoint').value = d.endpoint;
    if (d.username) el('username').value = d.username;
  } catch {}
}
