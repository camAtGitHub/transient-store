export const DEFAULT_FIELDS = ['related.ip', 'related.user', 'related.hosts', 'related.email', 'related.domain'];

export function deepGet(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export function normalizeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function severityFromTags(tags = []) {
  const lower = tags.map((t) => String(t).toLowerCase());
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  return 'low';
}

export function seededRandom(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nowMs() {
  return Date.now();
}
