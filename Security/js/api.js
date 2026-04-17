function authHeaders(username, password) {
  const token = btoa(`${username}:${password}`);
  return { Authorization: `Basic ${token}` };
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchFindings({ host, username, password, size = 8000 }) {
  const headers = authHeaders(username, password);
  const fUrl = `${host}/_plugins/_security_analytics/findings/_search?size=${size}&sortOrder=desc`;
  const tUrl = `${host}/_plugins/_security_analytics/threat_intel/findings/_search?size=${Math.min(size, 8000)}&sortOrder=desc`;
  const [findingsRes, threatsRes] = await Promise.all([
    getJson(fUrl, headers),
    getJson(tUrl, headers).catch(() => ({ findings: [] })),
  ]);
  return {
    findings: findingsRes.findings || [],
    threats: threatsRes.findings || [],
    totalFindings: findingsRes.total_findings || (findingsRes.findings || []).length,
  };
}
