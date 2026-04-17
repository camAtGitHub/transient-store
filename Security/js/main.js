import { appState } from './state.js';
import { fetchFindings } from './api.js';
import { buildSecurityStore } from './store.js';
import { buildGraphFromStore, applyRuntimeFilters, shortestPath } from './correlator.js';
import { GraphRenderer } from './renderer.js';
import { TimelineController } from './timeline.js';
import { computePivots } from './ml.js';

const $ = (id) => document.getElementById(id);
const canvas = $('graphCanvas');
const tooltip = $('tooltip');
const renderer = new GraphRenderer(canvas, tooltip);
let store = null;
let layoutWorker = new Worker('./js/layoutWorker.js', { type: 'module' });
let lastPositions = {};
let health = { fpsMode: 'normal', droppedLowEdges: 0 };

const timeline = new TimelineController((p) => {
  appState.ui.timelinePercent = p;
  $('timeline').value = p;
  refreshVisibleGraph();
});

function saveConnection() {
  localStorage.setItem('camce.connection', JSON.stringify(appState.connection));
}
function loadConnection() {
  try {
    const c = JSON.parse(localStorage.getItem('camce.connection') || '{}');
    Object.assign(appState.connection, c);
  } catch { /* ignore */ }
}

function nowRange() {
  appState.timeRange.end = Date.now();
  appState.timeRange.start = appState.timeRange.end - Number($('relativeRange').value);
  $('timeInfo').textContent = `${new Date(appState.timeRange.start).toISOString()} → ${new Date(appState.timeRange.end).toISOString()}`;
}

function selectedFields() {
  const base = [...document.querySelectorAll('[data-field]:checked')].map((x) => x.dataset.field);
  const custom = $('customFields').value.split(',').map((x) => x.trim()).filter(Boolean);
  return { base, custom };
}

function synthData(count = 6000) {
  const findings = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ip = `10.${(i % 20)}.${(i * 7) % 255}.${(i * 17) % 255}`;
    const user = `user${i % 250}`;
    findings.push({
      id: `synth-${i}`,
      timestamp: now - (i % 1440) * 60000,
      related_doc_ids: [`doc-${i}`],
      queries: [{ name: `Rule ${i % 25}`, tags: [i % 19 === 0 ? 'critical' : i % 7 === 0 ? 'high' : 'medium'] }],
      document_list: [{ id: `doc-${i}`, document: JSON.stringify({ related: { ip: [ip], user, hosts: `host${i % 150}.corp.local` }, process: { name: `proc${i % 40}` } }) }]
    });
  }
  return { findings, threats: [] };
}

async function fetchAndBuild() {
  appState.connection.host = $('host').value.trim();
  appState.connection.username = $('username').value.trim();
  appState.connection.password = $('password').value;
  saveConnection();
  nowRange();

  let payload;
  try {
    payload = await fetchFindings({ ...appState.connection, size: 10000 });
  } catch {
    payload = synthData(9000);
  }

  store = buildSecurityStore(payload.findings, payload.threats);
  rebuildGraph();
}

function rebuildGraph() {
  if (!store) return;
  const f = selectedFields();
  appState.filters.fields = f.base;
  appState.filters.customFields = f.custom;
  appState.filters.storyWindowMinutes = Number($('storyWindow').value);
  appState.filters.hubThreshold = Number($('hubThreshold').value);
  appState.filters.highRiskOnly = $('riskOnly').checked;
  appState.filters.enableClusterCompression = $('clusterToggle').checked;
  appState.filters.labels = $('labelsToggle').checked;
  appState.filters.reducedMotion = $('reducedMotion').checked;

  appState.data.graph = buildGraphFromStore(store, appState.filters, appState.timeRange);
  refreshVisibleGraph(true);
  renderPivots();
}

function refreshVisibleGraph(relayout = false) {
  const visible = applyRuntimeFilters(appState.data.graph, {
    timelinePercent: appState.ui.timelinePercent,
    highRiskOnly: appState.filters.highRiskOnly,
  });

  // importance pruning/noise floor + edge dedup already in correlator
  const sorted = visible.links.slice().sort((a,b)=>(b.weight||1)-(a.weight||1));
  const cap = Math.min(sorted.length, Math.max(1200, visible.nodes.length * 6));
  health.droppedLowEdges = Math.max(0, sorted.length - cap);
  visible.links = sorted.slice(0, cap);

  appState.data.visibleGraph = visible;
  renderer.labelMode = appState.filters.labels;
  renderer.reducedMotion = appState.filters.reducedMotion;

  if (!relayout) {
    renderer.setGraph(visible.nodes, visible.links, Object.entries(lastPositions).map(([id, p]) => ({ id, ...p })));
    paintHealth();
    return;
  }

  layoutWorker.postMessage({
    nodes: visible.nodes,
    links: visible.links,
    prevPositions: lastPositions,
    seed: 20260417,
    iterations: visible.nodes.length > 9000 ? 100 : visible.nodes.length > 4500 ? 150 : 220,
  });
}

layoutWorker.onmessage = (ev) => {
  const positions = ev.data.positions;
  lastPositions = Object.fromEntries(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
  renderer.setGraph(appState.data.visibleGraph.nodes, appState.data.visibleGraph.links, positions);
  paintHealth();
};

function renderPivots() {
  const pivots = computePivots(appState.data.graph);
  const box = $('pivotContent');
  box.innerHTML = '';
  for (const p of pivots) {
    const div = document.createElement('div');
    div.className = 'pivot-item';
    div.textContent = `[${p.type}] ${p.label}`;
    div.onclick = () => selectNode(p.nodeId, true);
    box.appendChild(div);
  }
}

function selectNode(id, focus = false) {
  appState.ui.selectedNodeId = id;
  renderer.setSelection([id]);
  const node = appState.data.visibleGraph.nodes.find((n) => n.id === id);
  $('selection').textContent = JSON.stringify(node?.raw || node, null, 2);
  appState.ui.history.unshift(id);
  appState.ui.history = appState.ui.history.slice(0, 20);
  $('history').innerHTML = appState.ui.history.map((h) => `<li>${h}</li>`).join('');
  if (focus) renderer.focusOn(id);
}

function fuzzySearch(term) {
  const t = term.toLowerCase();
  return appState.data.visibleGraph.nodes.find((n) => `${n.id} ${n.label}`.toLowerCase().includes(t));
}

function doShortestPath() {
  const ids = appState.ui.pathEndpoints;
  if (ids.length < 2) return;
  const p = shortestPath(appState.data.visibleGraph, ids[0], ids[1]);
  renderer.setSelection(p);
  $('selection').textContent = `Path (${p.length}):\n${p.join('\n')}`;
}

function paintLegend() {
  $('legend').innerHTML = [
    ['Critical', '#f94144'], ['High', '#f3722c'], ['Medium', '#f9c74f'], ['Low', '#577590'], ['Threat', '#f94144']
  ].map(([n,c]) => `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px"></span>${n}</div>`).join('');
}

function paintHealth() {
  $('health').textContent = `nodes:${appState.data.visibleGraph.nodes.length} edges:${appState.data.visibleGraph.links.length} dropped:${health.droppedLowEdges}`;
}

function bindUI() {
  loadConnection();
  $('host').value = appState.connection.host;
  $('username').value = appState.connection.username;
  $('password').value = appState.connection.password;
  nowRange();
  paintLegend();

  $('connectBtn').onclick = fetchAndBuild;
  $('applyTime').onclick = () => { nowRange(); rebuildGraph(); };
  $('rebuildGraph').onclick = rebuildGraph;
  $('timeline').oninput = (e) => timeline.setPercent(e.target.value);
  $('playBtn').onclick = () => timeline.play();
  $('pauseBtn').onclick = () => timeline.pause();
  $('rewindBtn').onclick = () => timeline.rewind();
  $('searchBox').onchange = (e) => {
    const n = fuzzySearch(e.target.value);
    if (n) {
      selectNode(n.id, true);
      appState.ui.pathEndpoints.push(n.id);
      appState.ui.pathEndpoints = appState.ui.pathEndpoints.slice(-2);
    }
  };
  $('focusSelection').onclick = () => appState.ui.selectedNodeId && renderer.focusOn(appState.ui.selectedNodeId);
  $('shortestPathBtn').onclick = doShortestPath;
  $('kHopBtn').onclick = () => {
    const s = appState.ui.selectedNodeId;
    if (!s) return;
    const neighbors = new Set([s]);
    for (let hop = 0; hop < 2; hop++) {
      for (const e of appState.data.visibleGraph.links) {
        if (neighbors.has(e.source)) neighbors.add(e.target);
        if (neighbors.has(e.target)) neighbors.add(e.source);
      }
    }
    renderer.setSelection([...neighbors]);
  };
  $('resetView').onclick = () => {
    renderer.transform = { x: 0, y: 0, k: 1 };
    renderer.setSelection([]);
  };

  canvas.addEventListener('dblclick', () => {
    if (renderer.hoverId) {
      selectNode(renderer.hoverId, true);
      const n = appState.data.visibleGraph.nodes.find((x) => x.id === renderer.hoverId);
      if (n) n.pinned = !n.pinned;
    }
  });
}

bindUI();
fetchAndBuild();
