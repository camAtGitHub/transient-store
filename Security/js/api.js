import { nowMs } from './utils.js';

async function fetchJson(url, auth) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchSecurityPayload({ endpoint, username, password, size = 3000, signal }) {
  const auth = { username, password };
  const findingsUrl = `${endpoint}/_plugins/_security_analytics/findings/_search?size=${size}&sortOrder=desc`;
  const iocUrl = `${endpoint}/_plugins/_security_analytics/threat_intel/findings/_search?size=${size}&sortOrder=desc`;
  const [findings, ioc] = await Promise.all([
    fetchJson(findingsUrl, auth, { signal }),
    fetchJson(iocUrl, auth, { signal }),
  ]);
  return { findings, ioc, fetchedAt: nowMs() };
}
