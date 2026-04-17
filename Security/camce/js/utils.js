export const severityColors = {
  critical: '#ff355e',
  high: '#ff9f1c',
  medium: '#f2d53c',
  low: '#56cfe1',
  info: '#7d8ba7'
};

export function sanitizeId(v) {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function deepGet(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export function normalizeArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseDocString(doc) {
  try { return typeof doc === 'string' ? JSON.parse(doc) : (doc || {}); }
  catch { return {}; }
}

export function inferSeverity(tags = []) {
  const s = tags.map((t) => String(t).toLowerCase());
  return ['critical', 'high', 'medium', 'low'].find((v) => s.includes(v)) || 'info';
}

export function utcMillisFromLocalInput(local) {
  if (!local) return null;
  return new Date(local).getTime();
}

export function createSeededRandom(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 1000000) / 1000000;
  };
}
