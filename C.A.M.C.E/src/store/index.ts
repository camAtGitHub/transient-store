import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  ConnectionSettings,
  QueryConfig,
  CorrelationConfig,
  TimelineState,
  Finding,
  Alert,
  ThreatIntelFinding,
  GraphNode,
  GraphData,
  LayoutType
} from '@/types';

interface StoreActions {
  // Connection
  setConnection: (connection: Partial<ConnectionSettings>) => void;
  setConnected: (connected: boolean) => void;
  setDemoMode: (demoMode: boolean) => void;
  
  // Data
  setFindings: (findings: Finding[]) => void;
  setAlerts: (alerts: Alert[]) => void;
  setThreatIntel: (threatIntel: ThreatIntelFinding[]) => void;
  addFindings: (findings: Finding[]) => void;
  
  // Graph
  setGraphData: (graphData: GraphData) => void;
  setBaseGraphData: (baseGraphData: GraphData) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setHighlightedNodes: (nodes: Set<string>) => void;
  setHighlightedPath: (path: string[]) => void;
  setLayout: (layout: LayoutType) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
  addNodeLabel: (nodeId: string, label: string) => void;
  removeNodeLabel: (nodeId: string, label: string) => void;
  
  // Configuration
  setQueryConfig: (config: Partial<QueryConfig>) => void;
  setCorrelationConfig: (config: Partial<CorrelationConfig>) => void;
  
  // Timeline
  setTimeline: (timeline: Partial<TimelineState>) => void;
  setTimelineWindow: (start: number, end: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  advanceTimeline: () => void;
  
  // UI State
  setActivePanel: (panel: string) => void;
  setShowLegend: (show: boolean) => void;
  toggleNodeTypeFilter: (type: string) => void;
  toggleSeverityFilter: (severity: string) => void;
  setSearchTerm: (term: string) => void;
  
  // Pivots
  setPivots: (pivots: any[]) => void;
  
  // Hunt
  setHuntLabels: (labels: Map<string, string[]>) => void;
  
  // Reset
  resetState: () => void;
}

const initialConnection: ConnectionSettings = {
  host: '',
  username: '',
  password: '',
  connected: false,
  demoMode: false
};

const initialQueryConfig: QueryConfig = {
  detectorType: [],
  severity: [],
  logType: [],
  batchSize: 100,
  startIndex: 0,
  sortOrder: 'desc'
};

const initialCorrelationConfig: CorrelationConfig = {
  defaultFields: {
    domain: true,
    email: true,
    hosts: true,
    ip: true,
    user: true
  },
  additionalFields: [],
  storyWindowMinutes: 15,
  maxCooccurrenceEdges: 50,
  showFindingNodes: true,
  showDocumentNodes: false,
  showDetectorContext: false,
  buildCooccurrenceMesh: false,
  buildTemporalBridges: true
};

const initialTimeline: TimelineState = {
  startTime: 0,
  endTime: 0,
  currentWindowStart: 0,
  currentWindowEnd: 0,
  isPlaying: false,
  playbackSpeed: 1
};

const initialState: Omit<AppState, keyof StoreActions> = {
  connection: initialConnection,
  findings: [],
  alerts: [],
  threatIntel: [],
  graphData: { nodes: [], links: [] },
  baseGraphData: { nodes: [], links: [] },
  selectedNode: null,
  highlightedNodes: new Set(),
  highlightedPath: [],
  layout: 'fcose',
  queryConfig: initialQueryConfig,
  correlationConfig: initialCorrelationConfig,
  timeline: initialTimeline,
  activePanel: 'query',
  showLegend: true,
  filters: {
    nodeTypes: new Set(['finding', 'document', 'ip', 'user', 'host', 'email', 'domain', 'threat', 'detector', 'custom']),
    severity: new Set(['critical', 'high', 'medium', 'low']),
    searchTerm: ''
  },
  pivots: [],
  huntLabels: new Map()
};

export const useStore = create<AppState & StoreActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      // Connection
      setConnection: (connection) => set((state) => ({
        connection: { ...state.connection, ...connection }
      })),
      setConnected: (connected) => set((state) => ({
        connection: { ...state.connection, connected }
      })),
      setDemoMode: (demoMode) => set((state) => ({
        connection: { ...state.connection, demoMode }
      })),
      
      // Data
      setFindings: (findings) => set({ findings }),
      setAlerts: (alerts) => set({ alerts }),
      setThreatIntel: (threatIntel) => set({ threatIntel }),
      addFindings: (newFindings) => set((state) => ({
        findings: [...state.findings, ...newFindings]
      })),
      
      // Graph
      setGraphData: (graphData) => set({ graphData }),
      setBaseGraphData: (baseGraphData) => set({ baseGraphData }),
      setSelectedNode: (selectedNode) => set({ selectedNode }),
      setHighlightedNodes: (highlightedNodes) => set({ highlightedNodes }),
      setHighlightedPath: (highlightedPath) => set({ highlightedPath }),
      setLayout: (layout) => set({ layout }),
      updateNodeNotes: (nodeId, notes) => set((state) => ({
        graphData: {
          ...state.graphData,
          nodes: state.graphData.nodes.map(n =>
            n.id === nodeId ? { ...n, notes } : n
          )
        }
      })),
      addNodeLabel: (nodeId, label) => set((state) => {
        const currentLabels = state.huntLabels.get(nodeId) || [];
        if (currentLabels.includes(label)) return state;
        const newLabels = new Map(state.huntLabels);
        newLabels.set(nodeId, [...currentLabels, label]);
        return { huntLabels: newLabels };
      }),
      removeNodeLabel: (nodeId, label) => set((state) => {
        const currentLabels = state.huntLabels.get(nodeId) || [];
        const newLabels = new Map(state.huntLabels);
        newLabels.set(nodeId, currentLabels.filter(l => l !== label));
        return { huntLabels: newLabels };
      }),
      
      // Configuration
      setQueryConfig: (config) => set((state) => ({
        queryConfig: { ...state.queryConfig, ...config }
      })),
      setCorrelationConfig: (config) => set((state) => ({
        correlationConfig: { ...state.correlationConfig, ...config }
      })),
      
      // Timeline
      setTimeline: (timeline) => set((state) => ({
        timeline: { ...state.timeline, ...timeline }
      })),
      setTimelineWindow: (currentWindowStart, currentWindowEnd) => set((state) => ({
        timeline: { ...state.timeline, currentWindowStart, currentWindowEnd }
      })),
      setPlaying: (isPlaying) => set((state) => ({
        timeline: { ...state.timeline, isPlaying }
      })),
      setPlaybackSpeed: (playbackSpeed) => set((state) => ({
        timeline: { ...state.timeline, playbackSpeed }
      })),
      advanceTimeline: () => set((state) => {
        const { timeline } = state;
        if (!timeline.isPlaying) return state;
        
        const windowSize = timeline.currentWindowEnd - timeline.currentWindowStart;
        const advanceAmount = windowSize * 0.1 * timeline.playbackSpeed;
        let newEnd = timeline.currentWindowEnd + advanceAmount;
        
        if (newEnd > timeline.endTime) {
          newEnd = timeline.endTime;
        }
        
        const newStart = newEnd - windowSize;
        
        return {
          timeline: {
            ...timeline,
            currentWindowStart: newStart,
            currentWindowEnd: newEnd,
            isPlaying: newEnd < timeline.endTime
          }
        };
      }),
      
      // UI State
      setActivePanel: (activePanel) => set({ activePanel }),
      setShowLegend: (showLegend) => set({ showLegend }),
      toggleNodeTypeFilter: (type) => set((state) => {
        const newTypes = new Set(state.filters.nodeTypes);
        if (newTypes.has(type)) {
          newTypes.delete(type);
        } else {
          newTypes.add(type);
        }
        return { filters: { ...state.filters, nodeTypes: newTypes } };
      }),
      toggleSeverityFilter: (severity) => set((state) => {
        const newSeverity = new Set(state.filters.severity);
        if (newSeverity.has(severity)) {
          newSeverity.delete(severity);
        } else {
          newSeverity.add(severity);
        }
        return { filters: { ...state.filters, severity: newSeverity } };
      }),
      setSearchTerm: (searchTerm) => set((state) => ({
        filters: { ...state.filters, searchTerm }
      })),
      
      // Pivots
      setPivots: (pivots) => set({ pivots }),
      
      // Hunt
      setHuntLabels: (huntLabels) => set({ huntLabels }),
      
      // Reset
      resetState: () => set(initialState)
    }),
    {
      name: 'camce-storage',
      partialize: (state) => ({
        connection: {
          host: state.connection.host,
          username: state.connection.username,
          password: ''
        },
        queryConfig: state.queryConfig,
        correlationConfig: state.correlationConfig,
        huntLabels: Array.from(state.huntLabels.entries()),
        layout: state.layout
      })
    }
  )
);
