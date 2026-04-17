import { severityFromTags } from './state.js';

export function buildSecurityStore(findings, threats) {
  const findingsById = new Map();
  const documentsById = new Map();
  const threatsById = new Map();

  for (const f of findings) {
    const docs = [];
    for (const d of (f.document_list || [])) {
      if (!d?.id) continue;
      if (!documentsById.has(d.id) && d.document) {
        try { documentsById.set(d.id, JSON.parse(d.document)); } catch { /*ignore*/ }
      }
      if (documentsById.has(d.id)) docs.push({ id: d.id, doc: documentsById.get(d.id) });
    }
    findingsById.set(f.id, {
      ...f,
      severity: severityFromTags((f.queries?.[0]?.tags) || []),
      docs,
      ts: Number(f.timestamp || 0),
    });
  }

  for (const t of threats) {
    const refs = [];
    for (const rawId of (t.related_doc_ids || [])) {
      const id = String(rawId).split(':')[0];
      if (documentsById.has(id)) refs.push({ id, doc: documentsById.get(id) });
    }
    threatsById.set(t.id, { ...t, refs, ts: Number(t.timestamp || 0) });
  }

  return { findingsById, documentsById, threatsById };
}

export function inRange(ts, range) {
  return ts >= range.start && ts <= range.end;
}
