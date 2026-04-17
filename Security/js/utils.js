export function sanitizeId(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function deepGet(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function normalizeArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

export function bestTimestamp(record) {
  return Number(
    record?.timestamp ??
    record?.['@timestamp'] ??
    record?.eventTime ??
    record?.time ??
    Date.now()
  );
}

export function parseRelativeRange(rangeKey) {
  const now = Date.now();
  const map = { '4h': 4 * 3600e3, '24h': 24 * 3600e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 };
  const span = map[rangeKey] ?? map['24h'];
  return { startMs: now - span, endMs: now };
}

export function validateEdges(nodes, edges) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
}

export function fuzzyIncludes(text, term) {
  if (!term) return true;
  const cleanText = String(text).toLowerCase();
  const cleanTerm = String(term).toLowerCase();
  if (cleanText.includes(cleanTerm)) return true;
  let i = 0;
  for (const c of cleanText) {
    if (c === cleanTerm[i]) i += 1;
    if (i === cleanTerm.length) return true;
  }
  return false;
}
