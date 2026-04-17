import { fetchFindings, fetchThreatIntel } from './api.js';
import { DEFAULT_CORR_FIELDS, MAX_NODE_LIMIT } from './config.js';
import { buildGraph } from './correlation.js';
import { rarityPivots, searchNodeIds, shortestPath, kHopNeighbors } from './pivots.js';
import { buildSecurityStore } from './store.js';
import { parseRelativeRange } from './utils.js';
import { GraphRenderer } from './graphRenderer.js';

const el = (id) => document.getElementById(id);
const renderer = new GraphRenderer(el('graphCanvas'));
const state = { store: null, graph: { nodes: [], edges: [] }, selection: [] };

bootstrap();

function bootstrap() {
  loadSavedConnection();
  bindActions();
  useSampleData();
}

function loadSavedConnection() {
  for (const key of ['endpoint', 'username']) {
    const v = localStorage.getItem(`camce.${key}`);
    if (v) el(key).value = v;
  }
}

function saveConnection() {
  localStorage.setItem('camce.endpoint', el('endpoint').value.trim());
  localStorage.setItem('camce.username', el('username').value.trim());
}

function bindActions() {
  el('connectBtn').addEventListener('click', connectAndFetch);
  el('rebuildBtn').addEventListener('click', rebuildGraph);
  el('timeline').addEventListener('input', (e) => renderer.setTimelineRatio(Number(e.target.value) / 100));

  el('searchBtn').addEventListener('click', () => {
    const ids = searchNodeIds(state.graph.nodes, el('searchInput').value.trim()).slice(0, 2000);
    renderer.setHighlight(ids);
    state.selection = ids;
  });

  el('pathBtn').addEventListener('click', () => {
    const ids = searchNodeIds(state.graph.nodes, el('searchInput').value.trim()).slice(0, 2);
    if (ids.length < 2) return;
    const path = shortestPath(state.graph.nodes, state.graph.edges, ids[0], ids[1]);
    renderer.setHighlight(path);
    state.selection = path;
  });

  el('kHopBtn').addEventListener('click', () => {
    const seed = searchNodeIds(state.graph.nodes, el('searchInput').value.trim())[0];
    if (!seed) return;
    const ids = kHopNeighbors(state.graph.nodes, state.graph.edges, seed, 2);
    renderer.setHighlight(ids);
    state.selection = ids;
  });

  el('playBtn').addEventListener('click', async () => {
    for (let i = 0; i <= 100; i += 2) {
      el('timeline').value = String(i);
      renderer.setTimelineRatio(i / 100);
      await new Promise((r) => setTimeout(r, 25));
    }
  });
}

async function connectAndFetch() {
  const endpoint = el('endpoint').value.trim().replace(/\/$/, '');
  const username = el('username').value.trim();
  const password = el('password').value;
  setStatus('loading');
  saveConnection();

  try {
    const findingsPromise = fetchFindings({
      endpoint,
      username,
      password,
      size: Number(el('maxFindings').value),
      sortOrder: el('sortOrder').value,
      severity: el('severity').value,
    });

    const iocPromise = fetchThreatIntel({
      endpoint,
      username,
      password,
      size: Number(el('maxIocs').value),
      sortOrder: el('sortOrder').value,
      severity: el('severity').value,
    });

    const [findings, iocs] = await Promise.all([findingsPromise, iocPromise]);
    state.store = buildSecurityStore(findings, iocs);
    rebuildGraph();
    setStatus('live');
  } catch (err) {
    console.error(err);
    setStatus('error');
    alert(`Fetch failed: ${err.message}\nUsing sample data instead.`);
    useSampleData();
  }
}

function getTimeRange() {
  const mode = el('timeMode').value;
  if (mode === 'relative') return parseRelativeRange(el('relativeRange').value);
  const startMs = new Date(el('startTime').value).getTime() || 0;
  const endMs = new Date(el('endTime').value).getTime() || Date.now();
  return { startMs, endMs };
}

function rebuildGraph() {
  if (!state.store) return;
  const selected = [...document.querySelectorAll('.corr-field:checked')].map((i) => i.value);
  const custom = el('customFields').value.split(',').map((v) => v.trim()).filter(Boolean);
  const fields = [...new Set([...(selected.length ? selected : DEFAULT_CORR_FIELDS), ...custom])];
  const { startMs, endMs } = getTimeRange();

  const filteredStore = {
    ...state.store,
    allEvents: state.store.allEvents.filter((e) => e.timestamp >= startMs && e.timestamp <= endMs),
  };

  const graph = buildGraph(filteredStore, {
    fields,
    storyWindowMin: Number(el('storyWindow').value),
  });

  graph.nodes = graph.nodes.slice(0, MAX_NODE_LIMIT);
  state.graph = graph;

  renderer.setData(graph.nodes, graph.edges, Number(el('maxInitialEdges').value));
  renderPivots();
  updateTelemetry();
}

function renderPivots() {
  const pivots = rarityPivots(state.graph.nodes);
  const wrap = el('pivots');
  wrap.innerHTML = '';
  for (const p of pivots) {
    const item = document.createElement('div');
    item.className = 'pivot-item';
    const info = document.createElement('span');
    info.textContent = `${p.label} | count=${p.count} | z=${p.z.toFixed(2)}`;
    const btn = document.createElement('button');
    btn.textContent = 'Highlight';
    btn.addEventListener('click', () => {
      const ids = searchNodeIds(state.graph.nodes, p.label);
      renderer.setHighlight(ids);
      state.selection = ids;
      updateTelemetry();
    });
    item.append(info, btn);
    wrap.appendChild(item);
  }
}

function updateTelemetry() {
  const nodes = state.graph.nodes;
  const edges = state.graph.edges;
  const ts = nodes.map((n) => n.timestamp || 0).sort((a, b) => a - b);
  const span = ts.length ? `${new Date(ts[0]).toISOString()} -> ${new Date(ts[ts.length - 1]).toISOString()}` : 'n/a';
  const summary = {
    nodes: nodes.length,
    edges: edges.length,
    findings: nodes.filter((n) => n.type === 'finding').length,
    iocs: nodes.filter((n) => n.type === 'ioc').length,
    docs: nodes.filter((n) => n.type === 'document').length,
    entities: nodes.filter((n) => n.type === 'entity').length,
    selectedNodes: state.selection.length,
    span,
  };
  el('telemetry').textContent = JSON.stringify(summary, null, 2);
}

function setStatus(v) {
  el('statusDot').className = `status ${v}`;
}

function useSampleData() {
  const now = Date.now();
  const findings = {
    findings: [
      {
        id: 'f-1', severity: 'high', timestamp: now - 3600e3,
        related_doc_ids: ['doc-1'],
        document_list: [{ id: 'doc-1', document: JSON.stringify({ related: { ip: ['10.0.0.5'], user: ['jsmith'], hosts: ['db-1'] }, process: { name: 'ssh' }, '@timestamp': now - 3600e3 }) }],
      },
      {
        id: 'f-2', severity: 'critical', timestamp: now - 1200e3,
        related_doc_ids: ['doc-2'],
        document_list: [{ id: 'doc-2', document: JSON.stringify({ related: { ip: ['10.0.0.5'], user: ['svc-backup'], hosts: ['mail-2'], domain: ['corp.local'] }, process: { name: 'powershell' }, '@timestamp': now - 1200e3 }) }],
      },
    ],
  };

  const iocs = {
    findings: [
      { id: 'i-1', severity: 'medium', timestamp: now - 900e3, related_doc_ids: ['doc-2'] },
    ],
  };

  state.store = buildSecurityStore(findings, iocs);
  rebuildGraph();
  setStatus('live');
}
