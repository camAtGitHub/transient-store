const state = {
  creds: { host: '', user: '', pass: '' },
  timeFilter: { mode: 'relative', relative: '4h', startMs: null, endMs: null },
  raw: { findings: [], iocs: [], hunts: [] },
  store: {
    findingsById: new Map(),
    iocsById: new Map(),
    documentsById: new Map(),
    entitiesByKey: new Map(),
  },
  baseGraph: { nodes: [], links: [] },
  view: { nodes: [], links: [], nodeById: new Map(), visibilityCutoff: Number.POSITIVE_INFINITY },
  selectedNodeId: null,
  interaction: { panX: 0, panY: 0, zoom: 1, dragging: null, hover: null, shiftPathEnds: [] },
  anim: { raf: null, timelineRaf: null, simTick: 0 },
};

const els = {
  statusPill: document.getElementById('statusPill'),
  hostInput: document.getElementById('hostInput'),
  userInput: document.getElementById('userInput'),
  passInput: document.getElementById('passInput'),
  connectBtn: document.getElementById('connectBtn'),
  applyTimeBtn: document.getElementById('applyTimeBtn'),
  relativeRange: document.getElementById('relativeRange'),
  absStart: document.getElementById('absStart'),
  absEnd: document.getElementById('absEnd'),
  customFields: document.getElementById('customFields'),
  storyWindow: document.getElementById('storyWindow'),
  hubThreshold: document.getElementById('hubThreshold'),
  meshToggle: document.getElementById('meshToggle'),
  temporalToggle: document.getElementById('temporalToggle'),
  recorrelationBtn: document.getElementById('recorrelateBtn'),
  huntQuery: document.getElementById('huntQuery'),
  huntBtn: document.getElementById('huntBtn'),
  sampleBtn: document.getElementById('sampleBtn'),
  graphCanvas: document.getElementById('graphCanvas'),
  timelineCanvas: document.getElementById('timelineCanvas'),
  scrubber: document.getElementById('scrubber'),
  playBtn: document.getElementById('playBtn'),
  stopBtn: document.getElementById('stopBtn'),
  timeLabel: document.getElementById('timeLabel'),
  pivotList: document.getElementById('pivotList'),
  telemetry: document.getElementById('telemetry'),
  rawDump: document.getElementById('rawDump'),
  notesBox: document.getElementById('notesBox'),
  saveNoteBtn: document.getElementById('saveNoteBtn'),
};

const ctx = els.graphCanvas.getContext('2d');
const tctx = els.timelineCanvas.getContext('2d');

function setStatus(text, cls = 'loading') {
  els.statusPill.textContent = text;
  els.statusPill.className = `status ${cls}`;
}

function loadCreds() {
  const saved = JSON.parse(localStorage.getItem('camce-creds') || '{}');
  ['host', 'user', 'pass'].forEach((k) => {
    if (saved[k]) {
      state.creds[k] = saved[k];
      els[`${k}Input`].value = saved[k];
    }
  });
}
function saveCreds() {
  state.creds.host = els.hostInput.value.trim();
  state.creds.user = els.userInput.value.trim();
  state.creds.pass = els.passInput.value;
  localStorage.setItem('camce-creds', JSON.stringify(state.creds));
}

function parseRelativeToMs(rel) {
  const m = rel.match(/^(\d+)([hd])$/);
  if (!m) return 4 * 3600_000;
  return Number(m[1]) * (m[2] === 'h' ? 3600_000 : 86400_000);
}

function getTimeRangeMs() {
  const now = Date.now();
  const absStart = els.absStart.value ? new Date(els.absStart.value).getTime() : null;
  const absEnd = els.absEnd.value ? new Date(els.absEnd.value).getTime() : null;
  if (absStart && absEnd) return { start: absStart, end: absEnd };
  const delta = parseRelativeToMs(els.relativeRange.value);
  return { start: now - delta, end: now };
}

function authHeaders() {
  const token = btoa(`${state.creds.user}:${state.creds.pass}`);
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

async function fetchJSON(path, options = {}) {
  const url = `${state.creds.host.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function deepGet(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (v == null) return [];
  return [String(v)];
}

function normalizeFindingsPayload(payload) {
  const hits = payload?.findings || payload?.hits?.findings || payload?.hits?.hits || [];
  return hits.map((h) => h._source || h);
}

function safeJsonParse(s) {
  if (typeof s !== 'string') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function stripDocSuffix(docId) {
  return String(docId || '').split(':')[0];
}

function ingestPayloads(findings, iocs, hunts = []) {
  state.store = {
    findingsById: new Map(),
    iocsById: new Map(),
    documentsById: new Map(),
    entitiesByKey: new Map(),
  };

  for (const f of findings) {
    const id = f.id || f.finding_id || crypto.randomUUID();
    const docs = (f.document_list || []).map((d) => {
      const docId = stripDocSuffix(d.id || d.document_id || d.doc_id);
      const parsed = safeJsonParse(d.document || d.raw_document || '{}');
      if (docId && parsed) state.store.documentsById.set(docId, parsed);
      return { docId, parsed };
    });
    state.store.findingsById.set(id, { ...f, id, resolvedDocs: docs });
  }

  for (const i of iocs) {
    const id = i.id || i.finding_id || crypto.randomUUID();
    const resolvedDocs = normalizeArray(i.related_doc_ids).map((x) => {
      const docId = stripDocSuffix(x);
      return { docId, parsed: state.store.documentsById.get(docId) || null };
    });
    state.store.iocsById.set(id, { ...i, id, resolvedDocs });
  }

  state.raw = { findings, iocs, hunts };
}

function getChosenFields() {
  const defaults = [...document.querySelectorAll('.fieldChk:checked')].map((x) => x.value);
  const custom = els.customFields.value.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...defaults, ...custom])];
}

function addNode(map, node) {
  if (!map.has(node.id)) map.set(node.id, node);
  return map.get(node.id);
}

function addLink(map, source, target, metadata = {}) {
  if (source === target) return;
  const a = source < target ? source : target;
  const b = source < target ? target : source;
  const key = `${a}::${b}::${metadata.kind || 'rel'}`;
  if (!map.has(key)) {
    map.set(key, { id: key, source: a, target: b, weight: 0, kind: metadata.kind || 'rel', severities: new Set(), timestamps: [] });
  }
  const l = map.get(key);
  l.weight += 1;
  if (metadata.severity) l.severities.add(metadata.severity);
  if (metadata.timestamp) l.timestamps.push(metadata.timestamp);
}

function bestTimestamp(obj) {
  return obj?.timestamp || obj?.['@timestamp'] || obj?.time || Date.now();
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s.includes('critical')) return '#ff4f6f';
  if (s.includes('high')) return '#ff9d42';
  if (s.includes('medium')) return '#ffd166';
  return '#7aa6ff';
}

function buildCorrelationGraph() {
  const fields = getChosenFields();
  const storyWindowMs = Number(els.storyWindow.value || 30) * 60_000;
  const hubThreshold = Number(els.hubThreshold.value || 5);

  const nodeMap = new Map();
  const linkMap = new Map();
  const entityLastSeen = new Map();
  const entityInstance = new Map();

  const allFindings = [...state.store.findingsById.values(), ...state.raw.hunts];
  allFindings.sort((a, b) => bestTimestamp(a) - bestTimestamp(b));

  for (const finding of allFindings) {
    const fid = `finding:${finding.id}`;
    const ts = bestTimestamp(finding);
    const sev = finding.severity || finding.severity_level || 'low';
    addNode(nodeMap, {
      id: fid,
      label: finding.detector_name || finding.rule || `finding ${finding.id}`,
      type: finding.isHunt ? 'hunt' : 'finding',
      severity: sev,
      ts,
      x: Math.random() * els.graphCanvas.width,
      y: Math.random() * els.graphCanvas.height,
      vx: 0,
      vy: 0,
      degree: 0,
      payload: finding,
    });

    const docs = finding.resolvedDocs || [];
    for (const d of docs) {
      if (!d.parsed) continue;
      const docNodeId = `doc:${d.docId}`;
      addNode(nodeMap, {
        id: docNodeId,
        label: d.docId,
        type: 'doc',
        severity: sev,
        ts,
        x: Math.random() * els.graphCanvas.width,
        y: Math.random() * els.graphCanvas.height,
        vx: 0,
        vy: 0,
        degree: 0,
        payload: d.parsed,
      });
      addLink(linkMap, fid, docNodeId, { kind: 'contains', severity: sev, timestamp: ts });

      const entityNodes = [];
      for (const field of fields) {
        for (const val of normalizeArray(deepGet(d.parsed, field))) {
          const key = `${field}:${val}`;
          const last = entityLastSeen.get(key);
          let inst = entityInstance.get(key) || 1;
          if (last && ts - last > storyWindowMs) inst += 1;
          entityLastSeen.set(key, ts);
          entityInstance.set(key, inst);

          const entityId = `entity:${key}:inst:${inst}`;
          const type = field.includes('user') ? 'user' : field.includes('host') ? 'host' : field.includes('ip') ? 'ip' : 'entity';
          const n = addNode(nodeMap, {
            id: entityId,
            label: inst > 1 ? `${val} [Inst ${inst}]` : val,
            baseValue: val,
            field,
            type,
            severity: sev,
            ts,
            x: Math.random() * els.graphCanvas.width,
            y: Math.random() * els.graphCanvas.height,
            vx: 0,
            vy: 0,
            degree: 0,
            payload: { field, value: val },
          });
          entityNodes.push(n.id);
          addLink(linkMap, docNodeId, n.id, { kind: field, severity: sev, timestamp: ts });
          if (els.temporalToggle.checked) {
            const prevId = `entity:${key}:inst:${Math.max(1, inst - 1)}`;
            if (nodeMap.has(prevId) && prevId !== entityId) {
              addLink(linkMap, prevId, entityId, { kind: 'temporal', severity: sev, timestamp: ts });
            }
          }
        }
      }

      if (els.meshToggle.checked) {
        for (let i = 0; i < entityNodes.length; i++) {
          for (let j = i + 1; j < entityNodes.length; j++) {
            addLink(linkMap, entityNodes[i], entityNodes[j], { kind: 'mesh', severity: sev, timestamp: ts });
          }
        }
      }
    }
  }

  for (const ioc of state.store.iocsById.values()) {
    const iocId = `ioc:${ioc.id}`;
    const ts = bestTimestamp(ioc);
    addNode(nodeMap, {
      id: iocId,
      label: ioc.threat_type || ioc.indicator || `ioc ${ioc.id}`,
      type: 'ioc',
      severity: 'high',
      ts,
      x: Math.random() * els.graphCanvas.width,
      y: Math.random() * els.graphCanvas.height,
      vx: 0,
      vy: 0,
      degree: 0,
      payload: ioc,
    });
    for (const d of ioc.resolvedDocs || []) {
      if (!d.docId) continue;
      const docNodeId = `doc:${d.docId}`;
      if (nodeMap.has(docNodeId)) addLink(linkMap, iocId, docNodeId, { kind: 'ioc-hit', severity: 'high', timestamp: ts });
    }
  }

  const degreeByEntityValue = new Map();
  for (const l of linkMap.values()) {
    const s = nodeMap.get(l.source);
    const t = nodeMap.get(l.target);
    if (s) s.degree += 1;
    if (t) t.degree += 1;
    if (s?.id.startsWith('entity:')) degreeByEntityValue.set(s.baseValue, (degreeByEntityValue.get(s.baseValue) || 0) + 1);
    if (t?.id.startsWith('entity:')) degreeByEntityValue.set(t.baseValue, (degreeByEntityValue.get(t.baseValue) || 0) + 1);
  }

  for (const n of nodeMap.values()) {
    if (n.id.startsWith('entity:') && (degreeByEntityValue.get(n.baseValue) || 0) >= hubThreshold) n.type = `${n.type}-hub`;
  }

  state.baseGraph = {
    nodes: [...nodeMap.values()],
    links: [...linkMap.values()].map((l) => ({ ...l, severity: [...l.severities][0] || 'low' })),
  };

  applyRuntimeFilters();
  computePivots();
  updatePanels();
  startSimulation();
}

function applyRuntimeFilters() {
  const range = getTimeRangeMs();
  state.timeFilter.startMs = range.start;
  state.timeFilter.endMs = range.end;
  state.view.visibilityCutoff = range.end;

  const nodes = state.baseGraph.nodes.filter((n) => n.ts >= range.start && n.ts <= range.end);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = state.baseGraph.links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  state.view.nodes = nodes;
  state.view.links = links;
  state.view.nodeById = new Map(nodes.map((n) => [n.id, n]));
}

function computePivots() {
  const entityNodes = state.view.nodes.filter((n) => n.id.startsWith('entity:'));
  const counts = new Map();
  entityNodes.forEach((n) => counts.set(n.label, (counts.get(n.label) || 0) + n.degree));
  const values = [...counts.values()];
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(values.length, 1);
  const sigma = Math.sqrt(variance || 1);

  const rarity = [...counts.entries()]
    .map(([name, count]) => ({ name, count, z: (count - mean) / sigma }))
    .sort((a, b) => a.z - b.z)
    .slice(0, 20);

  els.pivotList.innerHTML = rarity
    .map((r) => `<button class="pivotItem" data-name="${r.name}"><span>${r.name}</span><span>${r.z < -2 ? '<b class="crit">CRIT</b>' : ''} z=${r.z.toFixed(2)}</span></button>`)
    .join('');

  [...els.pivotList.querySelectorAll('.pivotItem')].forEach((btn) => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      state.interaction.hover = null;
      const match = state.view.nodes.find((n) => n.label === name);
      if (match) {
        state.selectedNodeId = match.id;
        focusNode(match.id);
      }
    };
  });
}

function typeColor(type, sev) {
  if (type.includes('hub')) return '#d65cff';
  if (type === 'finding') return severityColor(sev);
  if (type === 'ioc') return '#ff4f6f';
  if (type === 'doc') return '#5db7ff';
  if (type === 'hunt') return '#7dfcb2';
  if (type.includes('ip')) return '#76c7ff';
  if (type.includes('user')) return '#9f86ff';
  if (type.includes('host')) return '#8ce99a';
  return '#c4d7ff';
}

function drawGraph() {
  const { panX, panY, zoom } = state.interaction;
  ctx.clearRect(0, 0, els.graphCanvas.width, els.graphCanvas.height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  const pathNodes = getShiftPath();
  const pathSet = new Set(pathNodes);

  for (const l of state.view.links) {
    const s = state.view.nodeById.get(l.source);
    const t = state.view.nodeById.get(l.target);
    if (!s || !t) continue;
    const active = l.timestamps.some((ts) => ts <= state.view.visibilityCutoff);
    if (!active) continue;
    ctx.strokeStyle = severityColor(l.severity);
    ctx.globalAlpha = pathSet.size ? (pathSet.has(l.source) && pathSet.has(l.target) ? 1 : 0.15) : 0.6;
    ctx.lineWidth = Math.min(5, 1 + Math.log2(1 + l.weight));
    ctx.setLineDash(l.kind === 'temporal' ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const bend = l.kind === 'mesh' ? 12 : 0;
    ctx.quadraticCurveTo(mx + bend, my - bend, t.x, t.y);
    ctx.stroke();

    if (l.severity.toLowerCase().includes('critical')) {
      const pulse = (Math.sin(state.anim.simTick / 8) + 1) / 2;
      const px = s.x + (t.x - s.x) * pulse;
      const py = s.y + (t.y - s.y) * pulse;
      ctx.fillStyle = '#ff4f6f';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const n of state.view.nodes) {
    if (n.ts > state.view.visibilityCutoff) continue;
    const radius = Math.max(4, Math.min(18, 4 + Math.sqrt(n.degree + 1)));
    const selected = n.id === state.selectedNodeId;

    ctx.globalAlpha = pathSet.size && !pathSet.has(n.id) ? 0.2 : 1;
    ctx.fillStyle = typeColor(n.type, n.severity);
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius + (selected ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (zoom > 0.75 || selected) {
      ctx.fillStyle = '#dbe9ff';
      ctx.font = '11px Inter';
      ctx.fillText(n.label.slice(0, 28), n.x + radius + 3, n.y - radius - 1);
    }
  }

  ctx.restore();
}

function drawTimeline() {
  const W = els.timelineCanvas.width;
  const H = els.timelineCanvas.height;
  tctx.clearRect(0, 0, W, H);
  const nodes = state.baseGraph.nodes.filter((n) => n.type === 'finding' || n.type === 'hunt');
  if (!nodes.length) return;
  const min = Math.min(...nodes.map((n) => n.ts));
  const max = Math.max(...nodes.map((n) => n.ts));
  const span = Math.max(max - min, 1);

  tctx.strokeStyle = '#5a7baa';
  tctx.beginPath();
  tctx.moveTo(18, H / 2);
  tctx.lineTo(W - 18, H / 2);
  tctx.stroke();

  for (const n of nodes) {
    const x = 18 + ((n.ts - min) / span) * (W - 36);
    const active = n.ts <= state.view.visibilityCutoff;
    tctx.fillStyle = active ? severityColor(n.severity) : '#446086';
    tctx.fillRect(x, H / 2 - 11, 2, 22);
  }
}

function updatePanels() {
  const startIso = new Date(state.timeFilter.startMs || Date.now()).toISOString();
  const endIso = new Date(state.timeFilter.endMs || Date.now()).toISOString();
  els.telemetry.textContent = JSON.stringify(
    {
      visibleNodes: state.view.nodes.filter((n) => n.ts <= state.view.visibilityCutoff).length,
      visibleLinks: state.view.links.filter((l) => l.timestamps.some((ts) => ts <= state.view.visibilityCutoff)).length,
      findings: [...state.store.findingsById.values()].length,
      iocs: [...state.store.iocsById.values()].length,
      documents: [...state.store.documentsById.values()].length,
      timespan: { startIso, endIso },
      selectedNodeId: state.selectedNodeId,
    },
    null,
    2,
  );

  const selected = state.view.nodeById.get(state.selectedNodeId);
  els.rawDump.textContent = selected ? JSON.stringify(selected.payload, null, 2) : JSON.stringify(state.raw, null, 2);
  els.timeLabel.textContent = `${new Date(state.timeFilter.startMs).toISOString()} → ${new Date(state.view.visibilityCutoff).toISOString()}`;
}

function startSimulation() {
  cancelAnimationFrame(state.anim.raf);
  function step() {
    state.anim.simTick += 1;
    const nodes = state.view.nodes;
    const links = state.view.links;

    for (const n of nodes) {
      n.vx *= 0.92;
      n.vy *= 0.92;
      n.vx += (els.graphCanvas.width / 2 - n.x) * 0.00002;
      n.vy += (els.graphCanvas.height / 2 - n.y) * 0.00002;
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const repulse = 35 / distSq;
        dx /= Math.sqrt(distSq);
        dy /= Math.sqrt(distSq);
        a.vx -= dx * repulse; a.vy -= dy * repulse;
        b.vx += dx * repulse; b.vy += dy * repulse;
      }
    }

    for (const l of links) {
      const a = state.view.nodeById.get(l.source);
      const b = state.view.nodeById.get(l.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (dist - 80) * 0.0018;
      dx /= dist; dy /= dist;
      a.vx += dx * pull; a.vy += dy * pull;
      b.vx -= dx * pull; b.vy -= dy * pull;
    }

    for (const n of nodes) {
      if (state.interaction.dragging === n.id) continue;
      n.x = Math.max(30, Math.min(els.graphCanvas.width - 30, n.x + n.vx));
      n.y = Math.max(30, Math.min(els.graphCanvas.height - 30, n.y + n.vy));
    }

    drawGraph();
    drawTimeline();
    state.anim.raf = requestAnimationFrame(step);
  }
  step();
}

function screenToWorld(clientX, clientY) {
  const rect = els.graphCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) * (els.graphCanvas.width / rect.width) - state.interaction.panX) / state.interaction.zoom;
  const y = ((clientY - rect.top) * (els.graphCanvas.height / rect.height) - state.interaction.panY) / state.interaction.zoom;
  return { x, y };
}

function nodeAt(clientX, clientY) {
  const p = screenToWorld(clientX, clientY);
  for (const n of [...state.view.nodes].reverse()) {
    const r = Math.max(4, Math.min(18, 4 + Math.sqrt(n.degree + 1))) + 4;
    if ((n.x - p.x) ** 2 + (n.y - p.y) ** 2 <= r ** 2) return n;
  }
  return null;
}

function focusNode(id) {
  const n = state.view.nodeById.get(id);
  if (!n) return;
  state.selectedNodeId = id;
  state.interaction.panX = els.graphCanvas.width / 2 - n.x * state.interaction.zoom;
  state.interaction.panY = els.graphCanvas.height / 2 - n.y * state.interaction.zoom;
  const note = localStorage.getItem(`camce-note-${id}`) || '';
  els.notesBox.value = note;
  updatePanels();
}

function shortestPath(startId, endId) {
  const q = [startId];
  const prev = new Map([[startId, null]]);
  const adj = new Map();
  for (const l of state.view.links) {
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source).push(l.target);
    adj.get(l.target).push(l.source);
  }
  while (q.length) {
    const cur = q.shift();
    if (cur === endId) break;
    for (const nx of adj.get(cur) || []) {
      if (!prev.has(nx)) {
        prev.set(nx, cur);
        q.push(nx);
      }
    }
  }
  if (!prev.has(endId)) return [];
  const path = [];
  let cur = endId;
  while (cur) {
    path.push(cur);
    cur = prev.get(cur);
  }
  return path.reverse();
}

function getShiftPath() {
  if (state.interaction.shiftPathEnds.length !== 2) return [];
  return shortestPath(state.interaction.shiftPathEnds[0], state.interaction.shiftPathEnds[1]);
}

els.graphCanvas.addEventListener('mousedown', (e) => {
  const n = nodeAt(e.clientX, e.clientY);
  if (n) {
    state.interaction.dragging = n.id;
    if (e.shiftKey) {
      state.interaction.shiftPathEnds.push(n.id);
      state.interaction.shiftPathEnds = state.interaction.shiftPathEnds.slice(-2);
    } else {
      state.selectedNodeId = n.id;
      state.interaction.shiftPathEnds = [];
    }
    focusNode(n.id);
  }
});
document.addEventListener('mousemove', (e) => {
  if (!state.interaction.dragging) return;
  const n = state.view.nodeById.get(state.interaction.dragging);
  if (!n) return;
  const p = screenToWorld(e.clientX, e.clientY);
  n.x = p.x;
  n.y = p.y;
});
document.addEventListener('mouseup', () => { state.interaction.dragging = null; });
els.graphCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  state.interaction.zoom = Math.max(0.3, Math.min(3.2, state.interaction.zoom * factor));
});

let isPanning = false;
els.graphCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
els.graphCanvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    isPanning = true;
    els.graphCanvas.setPointerCapture(e.pointerId);
  }
});
els.graphCanvas.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  state.interaction.panX += e.movementX * (els.graphCanvas.width / els.graphCanvas.clientWidth);
  state.interaction.panY += e.movementY * (els.graphCanvas.height / els.graphCanvas.clientHeight);
});
els.graphCanvas.addEventListener('pointerup', () => (isPanning = false));

els.scrubber.addEventListener('input', () => {
  const min = state.timeFilter.startMs || Date.now() - 3600_000;
  const max = state.timeFilter.endMs || Date.now();
  state.view.visibilityCutoff = min + ((max - min) * Number(els.scrubber.value)) / 1000;
  updatePanels();
});

els.playBtn.onclick = () => {
  cancelAnimationFrame(state.anim.timelineRaf);
  const start = performance.now();
  const duration = 6000;
  const min = state.timeFilter.startMs;
  const max = state.timeFilter.endMs;

  function animate(now) {
    const t = Math.min(1, (now - start) / duration);
    state.view.visibilityCutoff = min + (max - min) * t;
    els.scrubber.value = String(Math.round(t * 1000));
    updatePanels();
    if (t < 1) state.anim.timelineRaf = requestAnimationFrame(animate);
  }
  state.anim.timelineRaf = requestAnimationFrame(animate);
};
els.stopBtn.onclick = () => {
  cancelAnimationFrame(state.anim.timelineRaf);
  state.view.visibilityCutoff = state.timeFilter.endMs;
  els.scrubber.value = '1000';
  updatePanels();
};

document.querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tabBody').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  };
});

els.saveNoteBtn.onclick = () => {
  if (!state.selectedNodeId) return;
  localStorage.setItem(`camce-note-${state.selectedNodeId}`, els.notesBox.value);
};

els.applyTimeBtn.onclick = () => {
  applyRuntimeFilters();
  computePivots();
  updatePanels();
};
els.recorrelationBtn.onclick = () => buildCorrelationGraph();

els.connectBtn.onclick = async () => {
  saveCreds();
  setStatus('Loading findings...', 'loading');
  try {
    const { start, end } = getTimeRangeMs();
    const findingsPayload = await fetchJSON('/_plugins/_security_analytics/findings/_search?size=5000&sortOrder=desc');
    const iocPayload = await fetchJSON('/_plugins/_security_analytics/threat_intel/findings/_search?size=5000&sortOrder=desc');
    const findings = normalizeFindingsPayload(findingsPayload).filter((f) => {
      const ts = bestTimestamp(f);
      return ts >= start && ts <= end;
    });
    const iocs = normalizeFindingsPayload(iocPayload).filter((f) => {
      const ts = bestTimestamp(f);
      return ts >= start && ts <= end;
    });
    ingestPayloads(findings, iocs);
    buildCorrelationGraph();
    setStatus(`Connected: ${findings.length} findings`, 'ok');
    document.getElementById('connectionDetails').open = false;
  } catch (err) {
    setStatus(`Error: ${String(err.message || err)}`, 'err');
  }
};

els.huntBtn.onclick = async () => {
  if (!state.creds.host) return;
  try {
    setStatus('Running hunt...', 'loading');
    const { start, end } = getTimeRangeMs();
    const body = {
      query: {
        bool: {
          must: [{ query_string: { query: els.huntQuery.value || '*', analyze_wildcard: true, time_zone: 'UTC' } }],
          filter: [{ range: { '@timestamp': { gte: start, lte: end } } }],
        },
      },
      size: 1000,
    };
    const payload = await fetchJSON('/_search', { method: 'POST', body: JSON.stringify(body) });
    const hunts = (payload?.hits?.hits || []).map((h, idx) => ({ ...h._source, id: `hunt-${idx}`, isHunt: true, resolvedDocs: [{ docId: h._id, parsed: h._source }] }));
    state.raw.hunts = hunts;
    buildCorrelationGraph();
    setStatus(`Hunt added ${hunts.length} docs`, 'ok');
  } catch (err) {
    setStatus(`Hunt failed: ${String(err.message || err)}`, 'err');
  }
};

els.sampleBtn.onclick = () => {
  const now = Date.now();
  const findings = [
    {
      id: 'f1',
      detector_name: 'Bruteforce Auth',
      severity: 'critical',
      timestamp: now - 58 * 60_000,
      document_list: [
        { id: 'doc-1:index-1', document: JSON.stringify({ '@timestamp': now - 58 * 60_000, related: { user: ['jsmith'], ip: ['10.1.2.5'], hosts: ['web-1'] }, process: { name: 'sshd' } }) },
      ],
    },
    {
      id: 'f2',
      detector_name: 'Suspicious PowerShell',
      severity: 'high',
      timestamp: now - 24 * 60_000,
      document_list: [
        { id: 'doc-2:index-1', document: JSON.stringify({ '@timestamp': now - 24 * 60_000, related: { user: ['jsmith'], ip: ['10.1.2.5'], hosts: ['dc-2'], email: ['jsmith@corp.local'] }, process: { name: 'powershell.exe' } }) },
      ],
    },
    {
      id: 'f3',
      detector_name: 'DNS Beaconing',
      severity: 'medium',
      timestamp: now - 8 * 60_000,
      document_list: [
        { id: 'doc-3:index-1', document: JSON.stringify({ '@timestamp': now - 8 * 60_000, related: { user: ['svc-api'], ip: ['45.9.9.9'], hosts: ['app-9'], domain: ['fast-update-cdn.net'] }, process: { name: 'curl' } }) },
      ],
    },
    {
      id: 'f4',
      detector_name: 'Later Session Reuse',
      severity: 'critical',
      timestamp: now - 2 * 60_000,
      document_list: [
        { id: 'doc-4:index-1', document: JSON.stringify({ '@timestamp': now - 2 * 60_000, related: { user: ['jsmith'], ip: ['172.16.0.42'], hosts: ['db-9'] }, process: { name: 'psql' } }) },
      ],
    },
  ];
  const iocs = [
    { id: 'ioc-1', threat_type: 'Known C2', timestamp: now - 7 * 60_000, related_doc_ids: ['doc-3:index-1'] },
  ];

  ingestPayloads(findings, iocs);
  buildCorrelationGraph();
  setStatus('Demo dataset loaded', 'ok');
};

loadCreds();
setStatus('Ready. Load demo or connect.', 'loading');
