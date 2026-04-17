Depending on the graph engine, nodes and dataset You might get data sanitization based errors of:
Correlation failed: Can not create edge `e-1038` with nonexistent source `654b5398-be85-450f-aa41-7de9f2b4dd36`

I think its a data normalization bug.
It would make sense to add functions like sanitizeId() and validateEdges() as first-class invariants:

And make sure Every ID, everywhere, goes through one function:

sanitizeId(v) = String(v).toLowerCase().replace(/[^a-z0-9._-]/g,'_')
Use it when you create nodes AND when you build edges. Never mix raw and sanitized.

Before cy.add() (or similar function), run a gate:

const nodeIds = new Set(nodes.map(n => n.data.id))
const validEdges = edges.filter(e => {
  const ok = nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
  if (!ok) console.warn('dropped', e.data.id)
  return ok
})

YOU MUST NORMALISE / SANITIZE DATA FOR GRAPH ENGINES!
