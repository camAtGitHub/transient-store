import { fetchFindings, fetchThreatFindings } from './api.js';
import { buildSecurityStore } from './store.js';
import { buildGraphFromStore } from './graphBuilder.js';
import { GraphRenderer } from './renderer.js';
import { TimelineController } from './timeline.js';
import { computeStats, degreeCentrality, rarityPivots } from './analytics.js';
import { utcMillisFromLocalInput } from './utils.js';

const $ = (id) => document.getElementById(id);
const renderer = new GraphRenderer($('graphCanvas'), $('overlay'));
const timeline = new TimelineController($('timeline'));
const worker = new Worker(new URL('./layoutWorker.js', import.meta.url), { type: 'module' });

let state = {
  rawStore: null,
  graph: { nodes: [], edges: [] },
  positioned: [],
  timeRange: { start: Date.now() - 4 * 3600_000, end: Date.now() },
  visibleNodeIds: null
};

init();

function setStatus(kind, text) {
  const el = $('statusDot');
  el.className = `status ${kind}`;
  el.textContent = text;
}

function init() {
  loadConnFromStorage();
  bindEvents();
  setStatus('offline', 'Offline');
}

function bindEvents() {
  $('connectBtn').addEventListener('click', connectAndFetch);
  $('applyRelative').addEventListener('click', () => {
    const end = Date.now();
    const start = end - Number($('relativeRange').value);
    state.timeRange = { start, end };
    reproject();
  });
  $('applyAbsolute').addEventListener('click', () => {
    const start = utcMillisFromLocalInput($('startAbs').value);
    const end = utcMillisFromLocalInput($('endAbs').value);
    if (!start || !end || start >= end) return;
    state.timeRange = { start, end };
    reproject();
  });

  $('rebuildBtn').addEventListener('click', () => state.rawStore && rebuildGraph(state.rawStore));
  $('resetView').addEventListener('click', () => renderer.resetCamera());
  $('searchBtn').addEventListener('click', focusSearch);
  $('playBtn').addEventListener('click', () => timeline.play(Number($('playbackDuration').value || 20)));
  $('pauseBtn').addEventListener('click', () => timeline.pause());
  $('resetPlaybackBtn').addEventListener('click', () => timeline.reset());

  timeline.onTick = (ts) => {
    const visible = new Set(state.graph.nodes.filter((n) => (n.timestamp || 0) <= ts && (n.timestamp || 0) >= state.timeRange.start).map((n) => n.id));
    state.visibleNodeIds = visible;
    renderer.update(state.graph, state.positioned, visible);
    refreshPanels();
  };

  renderer.onSelect = (node) => {
    $('nodeDetail').textContent = JSON.stringify(node.raw || node, null, 2);
    refreshPanels();
  };

  worker.onmessage = (ev) => {
    state.positioned = ev.data;
    renderer.update(state.graph, state.positioned, state.visibleNodeIds);
    refreshPanels();
    setStatus('online', 'Online');
  };
}

function loadConnFromStorage() {
  $('host').value = localStorage.getItem('camce.host') || '';
  $('username').value = localStorage.getItem('camce.username') || '';
}

function saveConnToStorage() {
  localStorage.setItem('camce.host', $('host').value);
  localStorage.setItem('camce.username', $('username').value);
}

async function connectAndFetch() {
  saveConnToStorage();
  setStatus('loading', 'Loading');
  try {
    const auth = 'Basic ' + btoa(`${$('username').value}:${$('password').value}`);
    const [findings, threats] = await Promise.all([
      fetchFindings({ host: $('host').value.replace(/\/$/, ''), auth }),
      fetchThreatFindings({ host: $('host').value.replace(/\/$/, ''), auth })
    ]);
    const store = buildSecurityStore(findings, threats);
    state.rawStore = store;
    rebuildGraph(store);
  } catch (e) {
    console.warn('Falling back to generated data', e);
    const synthetic = makeSyntheticPayload(8000);
    state.rawStore = buildSecurityStore(synthetic.findings, synthetic.threats);
    rebuildGraph(state.rawStore);
  }
}

function collectCorrelationFields() {
  const defaults = [...document.querySelectorAll('.corr:checked')].map((x) => x.value);
  const custom = $('customFields').value.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...defaults, ...custom])];
}

function rebuildGraph(store) {
  const graph = buildGraphFromStore(store, {
    correlationFields: collectCorrelationFields(),
    hubThreshold: Number($('hubThreshold').value || 6),
    storyWindowMinutes: Number($('storyWindow').value || 30),
    buildTemporalBridges: $('temporalBridge').checked,
    buildCooccurrenceMesh: $('cooccurrence').checked
  });

  const degree = degreeCentrality(graph);
  graph.nodes.forEach((n) => n.degree = degree.get(n.id) || 0);

  state.graph = graph;
  state.visibleNodeIds = new Set(graph.nodes.filter((n) => n.timestamp >= state.timeRange.start && n.timestamp <= state.timeRange.end).map((n) => n.id));
  timeline.setNodes(graph.nodes);

  worker.postMessage({
    nodes: graph.nodes,
    edges: graph.edges,
    previousPositions: Object.fromEntries(state.positioned.map((p) => [p.id, p])),
    width: $('graphCanvas').clientWidth,
    height: $('graphCanvas').clientHeight
  });
}

function reproject() {
  if (!state.graph.nodes.length) return;
  state.visibleNodeIds = new Set(state.graph.nodes.filter((n) => n.timestamp >= state.timeRange.start && n.timestamp <= state.timeRange.end).map((n) => n.id));
  renderer.update(state.graph, state.positioned, state.visibleNodeIds);
  refreshPanels();
}

function focusSearch() {
  const q = $('searchNode').value.trim().toLowerCase();
  if (!q) return;
  const node = state.graph.nodes.find((n) => String(n.label).toLowerCase().includes(q) || n.id.includes(q));
  if (!node) return;
  const pos = state.positioned.find((p) => p.id === node.id);
  if (!pos) return;
  renderer.camera.x = -pos.x;
  renderer.camera.y = -pos.y;
  renderer.camera.z = 1.8;
  $('nodeDetail').textContent = JSON.stringify(node.raw || node, null, 2);
}

function refreshPanels() {
  const stats = computeStats(state.graph, state.visibleNodeIds);
  $('stats').textContent = [
    `Visible Nodes: ${stats.nodeCount}`,
    `Visible Edges: ${stats.edgeCount}`,
    `Time Start: ${stats.minTs ? new Date(stats.minTs).toISOString() : 'n/a'}`,
    `Time End: ${stats.maxTs ? new Date(stats.maxTs).toISOString() : 'n/a'}`,
    `Range Start: ${new Date(state.timeRange.start).toISOString()}`,
    `Range End: ${new Date(state.timeRange.end).toISOString()}`
  ].join('\n');

  const piv = rarityPivots(state.graph, state.visibleNodeIds);
  $('pivots').innerHTML = piv.map((p) => `<button data-id="${p.id}">${p.label} • z=${p.z.toFixed(2)} • degree=${p.score}</button>`).join('');
  $('pivots').querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      renderer.selected = new Set([btn.dataset.id]);
      const pos = state.positioned.find((x) => x.id === btn.dataset.id);
      if (pos) {
        renderer.camera.x = -pos.x;
        renderer.camera.y = -pos.y;
        renderer.camera.z = 2.1;
      }
    };
  });
}

function makeSyntheticPayload(count) {
  const findings = [];
  const ips = Array.from({ length: 1200 }, (_, i) => `10.20.${Math.floor(i / 255)}.${(i % 255) + 1}`);
  for (let i = 0; i < count; i++) {
    const ip = ips[Math.floor(Math.random() * ips.length)];
    const usr = `user${Math.floor(Math.random() * 500)}`;
    const host = `host-${Math.floor(Math.random() * 1800)}.corp.local`;
    findings.push({
      id: `f-${i}`,
      related_doc_ids: [`d-${i}`],
      timestamp: Date.now() - Math.floor(Math.random() * 86_400_000),
      queries: [{ name: `Synthetic Rule ${i % 24}`, tags: [i % 13 === 0 ? 'high' : 'medium', 'linux'] }],
      document_list: [{ id: `d-${i}`, document: JSON.stringify({ related: { ip: [ip], user: usr, hosts: host }, process: { name: i % 9 === 0 ? 'sshd' : 'cron' }, source: { ip } }) }]
    });
  }
  const threats = { findings: findings.slice(0, Math.floor(count * 0.08)).map((f, i) => ({ id: `t-${i}`, timestamp: f.timestamp, related_doc_ids: [f.related_doc_ids[0]], threat_type: 'ioc' })) };
  return { findings: { findings }, threats };
}
