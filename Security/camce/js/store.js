import { parseDocString, sanitizeId } from './utils.js';

export function buildSecurityStore(findingsPayload = {}, threatPayload = {}) {
  const findingsById = new Map();
  const threatById = new Map();
  const documentsById = new Map();

  for (const finding of findingsPayload.findings || []) {
    const cleanId = sanitizeId(finding.id);
    const enriched = { ...finding, id: cleanId, parsed_documents: [] };

    for (const d of finding.document_list || []) {
      const docObj = parseDocString(d.document);
      const docId = sanitizeId(d.id);
      documentsById.set(docId, { ...d, id: docId, parsed: docObj });
      enriched.parsed_documents.push({ id: docId, index: d.index, parsed: docObj });
    }

    findingsById.set(cleanId, enriched);
  }

  for (const threat of threatPayload.findings || []) {
    const cleanId = sanitizeId(threat.id);
    const resolvedDocs = (threat.related_doc_ids || []).map((docRef) => {
      const raw = String(docRef).split(':')[0];
      const docId = sanitizeId(raw);
      const hit = documentsById.get(docId);
      return hit ? { id: docId, parsed: hit.parsed } : { id: docId, parsed: null };
    });
    threatById.set(cleanId, { ...threat, id: cleanId, resolvedDocs });
  }

  return { findingsById, threatById, documentsById };
}
