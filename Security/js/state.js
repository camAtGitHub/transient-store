export const appState = {
  connection: { host: '', username: '', password: '' },
  timeRange: { end: Date.now(), start: Date.now() - 4 * 60 * 60 * 1000 },
  filters: {
    fields: ['related.ip', 'related.user', 'related.hosts'],
    customFields: [],
    hubThreshold: 5,
    storyWindowMinutes: 30,
    highRiskOnly: false,
    enableClusterCompression: true,
    labels: true,
    reducedMotion: false,
  },
  data: {
    findings: [],
    threats: [],
    graph: { nodes: [], links: [] },
    visibleGraph: { nodes: [], links: [] },
  },
  ui: {
    selectedNodeId: null,
    pathEndpoints: [],
    timelinePercent: 100,
    history: [],
  }
};

export const severityOrder = ['low', 'medium', 'high', 'critical'];

export function severityFromTags(tags = []) {
  const found = tags.find((t) => severityOrder.includes(String(t).toLowerCase()));
  return found ? found.toLowerCase() : 'low';
}
