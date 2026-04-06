// OpenSearch Findings API Types

export interface Finding {
  id: string;
  detectorId: string;
  related_doc_ids: string[];
  index: string;
  queries: Query[];
  timestamp: number;
  document_list: DocumentEntry[];
}

export interface Query {
  id: string;
  name: string;
  fields: string[];
  query: string;
  tags: string[];
}

export interface DocumentEntry {
  index: string;
  id: string;
  found: boolean;
  document: string;
}

export interface ParsedDocument {
  [key: string]: any;
  related?: {
    domain?: string | string[];
    email?: string | string[];
    hosts?: string | string[];
    ip?: string | string[];
    user?: string | string[];
  };
  '@timestamp'?: string;
  event?: {
    created?: string;
  };
  winlog?: {
    time_created?: string;
  };
}

export interface Alert {
  id: string;
  detector_id: string;
  trigger_id: string;
  trigger_name: string;
  finding_ids: string[];
  related_doc_ids: string[];
  state: 'ACTIVE' | 'ACKNOWLEDGED' | 'COMPLETED' | 'ERROR' | 'DELETED';
  severity: string | null;
  start_time: string;
  end_time: string | null;
  acknowledged_time: string | null;
}

export interface ThreatIntelFinding {
  id: string;
  related_doc_ids: string[];
  ioc_feed_ids: IOCFeed[];
  monitor_id: string;
  monitor_name: string;
  ioc_value: string;
  ioc_type: string;
  timestamp: number;
  execution_id: string;
}

export interface IOCFeed {
  ioc_id: string;
  feed_id: string;
  feed_name: string;
  index: string;
}

// Graph Types

export type NodeType = 'finding' | 'document' | 'ip' | 'user' | 'host' | 'email' | 'domain' | 'threat' | 'detector' | 'custom';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: any;
  timestamp: number;
  degree: number;
  instanceId?: number;
  notes?: string;
  labels?: string[];
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  timestamps: number[];
  data?: any;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Correlation Configuration

export interface CorrelationConfig {
  defaultFields: {
    domain: boolean;
    email: boolean;
    hosts: boolean;
    ip: boolean;
    user: boolean;
  };
  additionalFields: string[];
  storyWindowMinutes: number;
  maxCooccurrenceEdges: number;
  showFindingNodes: boolean;
  showDocumentNodes: boolean;
  showDetectorContext: boolean;
  buildCooccurrenceMesh: boolean;
  buildTemporalBridges: boolean;
}

// Query Configuration

export interface QueryConfig {
  detectorType: string[];
  severity: string[];
  logType: string[];
  batchSize: number;
  startIndex: number;
  sortOrder: 'asc' | 'desc';
  detectionType?: 'rule' | 'threat';
}

// Connection Settings

export interface ConnectionSettings {
  host: string;
  username: string;
  password: string;
  connected: boolean;
  demoMode: boolean;
}

// Timeline

export interface TimelineState {
  startTime: number;
  endTime: number;
  currentWindowStart: number;
  currentWindowEnd: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

// Pivot

export interface Pivot {
  field: string;
  value: string;
  type: NodeType;
  degree: number;
  count: number;
  isRare: boolean;
  isCritical?: boolean;
}

// Layout

export type LayoutType = 'fcose' | 'concentric' | 'grid' | 'breadthfirst' | 'cose' | 'circle';

// Application State

export interface AppState {
  // Connection
  connection: ConnectionSettings;
  
  // Data
  findings: Finding[];
  alerts: Alert[];
  threatIntel: ThreatIntelFinding[];
  
  // Graph
  graphData: GraphData;
  baseGraphData: GraphData;
  selectedNode: GraphNode | null;
  highlightedNodes: Set<string>;
  highlightedPath: string[];
  layout: LayoutType;
  
  // Configuration
  queryConfig: QueryConfig;
  correlationConfig: CorrelationConfig;
  
  // Timeline
  timeline: TimelineState;
  
  // UI State
  activePanel: string;
  showLegend: boolean;
  filters: {
    nodeTypes: Set<NodeType>;
    severity: Set<string>;
    searchTerm: string;
  };
  
  // Pivots
  pivots: Pivot[];
  
  // Hunt
  huntLabels: Map<string, string[]>;
}

// Severity Levels
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Layout Type
export type LayoutType = 'fcose' | 'concentric' | 'grid' | 'breadthfirst' | 'cose' | 'circle';

export const SeverityColors: Record<SeverityLevel, string> = {
  critical: '#FF4D6D',
  high: '#FFD166',
  medium: '#7B8CFF',
  low: '#00FFC2',
  info: '#A7B0C8'
};

// Node Type Colors

export const NodeTypeColors: Record<NodeType, string> = {
  finding: '#00F0FF',
  document: '#A7B0C8',
  ip: '#7B8CFF',
  user: '#00FFC2',
  host: '#A78BFA',
  email: '#FFD166',
  domain: '#F472B6',
  threat: '#FF4D6D',
  detector: '#00F0FF',
  custom: '#FB923C'
};

// Node Type Icons

export const NodeTypeIcons: Record<NodeType, string> = {
  finding: '🔍',
  document: '📄',
  ip: '🌐',
  user: '👤',
  host: '🖥️',
  email: '✉️',
  domain: '🔗',
  threat: '⚠️',
  detector: '🔎',
  custom: '📌'
};
