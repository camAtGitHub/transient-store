export async function fetchFindings({ host, auth, size = 10000, detectionType }) {
  const p = new URL(`${host}/_plugins/_security_analytics/findings/_search`);
  p.searchParams.set('size', String(size));
  p.searchParams.set('sortOrder', 'desc');
  if (detectionType) p.searchParams.set('detectionType', detectionType);
  const res = await fetch(p.toString(), { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`Findings request failed (${res.status})`);
  return res.json();
}

export async function fetchThreatFindings({ host, auth, size = 10000 }) {
  const p = new URL(`${host}/_plugins/_security_analytics/threat_intel/findings/_search`);
  p.searchParams.set('size', String(size));
  p.searchParams.set('sortOrder', 'desc');
  const res = await fetch(p.toString(), { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`Threat findings request failed (${res.status})`);
  return res.json();
}
