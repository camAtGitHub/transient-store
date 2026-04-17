import { bestTimestamp, normalizeArray, sanitizeId } from './utils.js';

function safeJsonParse(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') return null;
  try { return JSON.parse(jsonText); } catch { return null; }
}

export function buildSecurityStore(findingsPayload, iocPayload) {
  const store = {
    findingsById: new Map(),
    iocsById: new Map(),
    documentsById: new Map(),
    allEvents: [],
  };

  for (const f of findingsPayload?.findings ?? []) {
    const id = sanitizeId(f.id);
    const relatedDocIds = normalizeArray(f.related_doc_ids).map((v) => String(v));
    const docs = [];

    for (const dl of f.document_list ?? []) {
      const rawDoc = safeJsonParse(dl?.document);
      const docId = sanitizeId(dl?.id ?? rawDoc?._id ?? `${id}_doc_${docs.length}`);
      if (rawDoc) {
        store.documentsById.set(docId, rawDoc);
        docs.push({ id: docId, doc: rawDoc });
      }
    }

    const enriched = {
      ...f,
      id,
      relatedDocIds,
      documents: docs,
      timestamp: bestTimestamp(f),
      type: 'finding',
    };
    store.findingsById.set(id, enriched);
    store.allEvents.push(enriched);
  }

  for (const ioc of iocPayload?.findings ?? []) {
    const id = sanitizeId(ioc.id);
    const relatedDocIds = normalizeArray(ioc.related_doc_ids).map((v) => String(v).split(':')[0]);
    const resolvedDocs = relatedDocIds
      .map((docIdRaw) => store.documentsById.get(sanitizeId(docIdRaw)))
      .filter(Boolean)
      .map((doc) => ({ id: sanitizeId(doc._id ?? doc.id ?? crypto.randomUUID()), doc }));

    const enriched = {
      ...ioc,
      id,
      relatedDocIds,
      resolvedDocs,
      timestamp: bestTimestamp(ioc),
      type: 'ioc',
    };
    store.iocsById.set(id, enriched);
    store.allEvents.push(enriched);
  }

  return store;
}
