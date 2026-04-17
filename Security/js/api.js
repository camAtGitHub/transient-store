function authHeader(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

async function getJson(url, username, password) {
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(username, password),
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchFindings({ endpoint, username, password, size, sortOrder, severity }) {
  const params = new URLSearchParams({ size: String(size), sortOrder: sortOrder || 'desc' });
  if (severity) params.set('severity', severity);
  const url = `${endpoint}/_plugins/_security_analytics/findings/_search?${params.toString()}`;
  return getJson(url, username, password);
}

export async function fetchThreatIntel({ endpoint, username, password, size, sortOrder, severity }) {
  const params = new URLSearchParams({ size: String(size), sortOrder: sortOrder || 'desc', detectionType: 'threat' });
  if (severity) params.set('severity', severity);
  const url = `${endpoint}/_plugins/_security_analytics/findings/_search?${params.toString()}`;
  return getJson(url, username, password);
}
