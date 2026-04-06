import type { 
  Finding, 
  GraphNode, 
  GraphLink, 
  GraphData, 
  ParsedDocument,
  CorrelationConfig
} from '@/types';

// Utility functions
function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function deepGet(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function getBestTimestamp(doc: ParsedDocument): number {
  const ts = doc['@timestamp'] || doc.event?.created || doc.winlog?.time_created;
  return ts ? new Date(ts).getTime() : Date.now();
}

// Entity key generator for temporal splitting
function getEntityKey(type: string, value: string, timestamp: number, windowMs: number): string {
  const instanceId = Math.floor(timestamp / windowMs);
  return `${type}:${value}#${instanceId}`;
}

interface EntityInstance {
  id: string;
  type: string;
  value: string;
  timestamps: number[];
  findings: string[];
  documents: string[];
}

class GraphBuilder {
  private config: CorrelationConfig;
  private nodeMap: Map<string, GraphNode> = new Map();
  private linkMap: Map<string, GraphLink> = new Map();
  private entityInstances: Map<string, EntityInstance> = new Map();

  constructor(config: CorrelationConfig) {
    this.config = config;
  }

  buildGraph(findings: Finding[]): GraphData {
    this.nodeMap.clear();
    this.linkMap.clear();
    this.entityInstances.clear();

    const windowMs = this.config.storyWindowMinutes * 60 * 1000;

    // Process each finding
    findings.forEach((finding) => {
      const findingId = finding.id;
      const findingTimestamp = finding.timestamp;

      // Add finding node
      if (this.config.showFindingNodes) {
        this.addNode({
          id: findingId,
          type: 'finding',
          label: `Finding ${findingId.slice(-8)}`,
          data: finding,
          timestamp: findingTimestamp,
          degree: 0
        });
      }

      // Process documents
      finding.document_list.forEach((docEntry) => {
        if (!docEntry.found || !docEntry.document) return;

        try {
          const doc: ParsedDocument = JSON.parse(docEntry.document);
          const docTimestamp = getBestTimestamp(doc);
          const docId = `${findingId}-doc-${docEntry.id}`;

          // Add document node
          if (this.config.showDocumentNodes) {
            this.addNode({
              id: docId,
              type: 'document',
              label: `Doc ${docEntry.id}`,
              data: { ...doc, findingId },
              timestamp: docTimestamp,
              degree: 0
            });

            // Link finding to document
            this.addLink(findingId, docId, 'contains', findingTimestamp);
          }

          // Extract and correlate entities
          this.extractAndCorrelateEntities(doc, findingId, docId, docTimestamp, windowMs);
        } catch (e) {
          console.warn('Failed to parse document:', e);
        }
      });

      // Add detector context
      if (this.config.showDetectorContext) {
        const detectorId = finding.detectorId;
        const detectorNodeId = `detector:${detectorId}`;
        
        if (!this.nodeMap.has(detectorNodeId)) {
          this.addNode({
            id: detectorNodeId,
            type: 'detector',
            label: `Detector ${detectorId.slice(-8)}`,
            data: { detectorId },
            timestamp: findingTimestamp,
            degree: 0
          });
        }

        this.addLink(findingId, detectorNodeId, 'detected_by', findingTimestamp);
      }
    });

    // Build temporal bridges if enabled
    if (this.config.buildTemporalBridges) {
      this.buildTemporalBridges(windowMs);
    }

    // Build co-occurrence mesh if enabled
    if (this.config.buildCooccurrenceMesh) {
      this.buildCooccurrenceMesh();
    }

    // Calculate degrees
    this.calculateDegrees();

    return {
      nodes: Array.from(this.nodeMap.values()),
      links: Array.from(this.linkMap.values())
    };
  }

  private extractAndCorrelateEntities(
    doc: ParsedDocument, 
    findingId: string, 
    docId: string, 
    timestamp: number,
    windowMs: number
  ): void {
    const entities: { type: string; values: string[] }[] = [];

    // Extract default fields
    if (this.config.defaultFields.user) {
      const users = normalizeArray(deepGet(doc, 'related.user') || deepGet(doc, 'user.name'));
      if (users.length) entities.push({ type: 'user', values: users });
    }

    if (this.config.defaultFields.ip) {
      const ips = normalizeArray(deepGet(doc, 'related.ip') || deepGet(doc, 'source.ip') || deepGet(doc, 'destination.ip'));
      if (ips.length) entities.push({ type: 'ip', values: ips });
    }

    if (this.config.defaultFields.hosts) {
      const hosts = normalizeArray(deepGet(doc, 'related.hosts') || deepGet(doc, 'host.name'));
      if (hosts.length) entities.push({ type: 'host', values: hosts });
    }

    if (this.config.defaultFields.email) {
      const emails = normalizeArray(deepGet(doc, 'related.email') || deepGet(doc, 'user.email'));
      if (emails.length) entities.push({ type: 'email', values: emails });
    }

    if (this.config.defaultFields.domain) {
      const domains = normalizeArray(deepGet(doc, 'related.domain') || deepGet(doc, 'dns.question.name'));
      if (domains.length) entities.push({ type: 'domain', values: domains });
    }

    // Extract additional fields
    this.config.additionalFields.forEach((field) => {
      const values = normalizeArray(deepGet(doc, field));
      if (values.length) {
        entities.push({ type: 'custom', values });
      }
    });

    // Create entity instances with temporal splitting
    const docEntities: EntityInstance[] = [];

    entities.forEach(({ type, values }) => {
      values.forEach((value) => {
        if (!value) return;

        const entityKey = getEntityKey(type, value, timestamp, windowMs);
        
        let instance = this.entityInstances.get(entityKey);
        if (!instance) {
          instance = {
            id: entityKey,
            type,
            value,
            timestamps: [],
            findings: [],
            documents: []
          };
          this.entityInstances.set(entityKey, instance);

          // Create node for this instance
          const nodeId = entityKey;
          const shortValue = value.length > 20 ? value.slice(0, 20) + '...' : value;
          this.addNode({
            id: nodeId,
            type: type as any,
            label: `${shortValue}`,
            data: { value, type, field: type },
            timestamp,
            degree: 0,
            instanceId: Math.floor(timestamp / windowMs)
          });
        }

        instance.timestamps.push(timestamp);
        instance.findings.push(findingId);
        instance.documents.push(docId);
        docEntities.push(instance);

        // Link to finding and document
        if (this.config.showFindingNodes) {
          this.addLink(findingId, entityKey, `has_${type}`, timestamp);
        }
        if (this.config.showDocumentNodes) {
          this.addLink(docId, entityKey, `contains_${type}`, timestamp);
        }
      });
    });

    // Create co-occurrence edges between entities in same document
    if (docEntities.length > 1) {
      for (let i = 0; i < docEntities.length; i++) {
        for (let j = i + 1; j < docEntities.length; j++) {
          const entityA = docEntities[i];
          const entityB = docEntities[j];
          
          if (entityA.id !== entityB.id) {
            this.addLink(
              entityA.id, 
              entityB.id, 
              'co_occurs', 
              timestamp,
              { findingId, docId }
            );
          }
        }
      }
    }
  }

  private buildTemporalBridges(windowMs: number): void {
    const entitiesByTypeAndValue = new Map<string, EntityInstance[]>();

    // Group instances by type+value
    this.entityInstances.forEach((instance) => {
      const key = `${instance.type}:${instance.value}`;
      if (!entitiesByTypeAndValue.has(key)) {
        entitiesByTypeAndValue.set(key, []);
      }
      entitiesByTypeAndValue.get(key)!.push(instance);
    });

    // Create bridges between nearby instances
    entitiesByTypeAndValue.forEach((instances) => {
      instances.sort((a, b) => a.timestamps[0] - b.timestamps[0]);

      for (let i = 0; i < instances.length - 1; i++) {
        const current = instances[i];
        const next = instances[i + 1];
        
        const timeGap = next.timestamps[0] - current.timestamps[current.timestamps.length - 1];
        
        // Bridge if within 2x story window
        if (timeGap <= windowMs * 2) {
          this.addLink(
            current.id,
            next.id,
            'temporal_bridge',
            next.timestamps[0],
            { timeGap }
          );
        }
      }
    });
  }

  private buildCooccurrenceMesh(): void {
    // Find entities that co-occur across multiple findings
    const cooccurrenceCounts = new Map<string, Map<string, number>>();

    this.entityInstances.forEach((instance) => {
      const findings = instance.findings;
      
      for (let i = 0; i < findings.length; i++) {
        for (let j = i + 1; j < findings.length; j++) {
          const findingA = findings[i];
          const findingB = findings[j];
          const key = [findingA, findingB].sort().join('-');
          
          if (!cooccurrenceCounts.has(key)) {
            cooccurrenceCounts.set(key, new Map());
          }
          
          const entityMap = cooccurrenceCounts.get(key)!;
          entityMap.set(instance.id, (entityMap.get(instance.id) || 0) + 1);
        }
      }
    });

    // Create mesh edges for highly co-occurring entities
    cooccurrenceCounts.forEach((entityMap) => {
      const entities = Array.from(entityMap.entries())
        .filter(([_, count]) => count > 1)
        .map(([id]) => id);

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const entityA = entities[i];
          const entityB = entities[j];
          
          if (!this.linkMap.has(`${entityA}-${entityB}`) && 
              !this.linkMap.has(`${entityB}-${entityA}`)) {
            this.addLink(entityA, entityB, 'mesh', Date.now());
          }
        }
      }
    });
  }

  private addNode(node: GraphNode): void {
    if (!this.nodeMap.has(node.id)) {
      this.nodeMap.set(node.id, node);
    }
  }

  private addLink(source: string, target: string, type: string, timestamp: number, data?: any): void {
    const linkId = `${source}-${target}`;
    const reverseId = `${target}-${source}`;

    if (this.linkMap.has(linkId)) {
      const link = this.linkMap.get(linkId)!;
      link.weight++;
      link.timestamps.push(timestamp);
    } else if (this.linkMap.has(reverseId)) {
      const link = this.linkMap.get(reverseId)!;
      link.weight++;
      link.timestamps.push(timestamp);
    } else {
      this.linkMap.set(linkId, {
        id: linkId,
        source,
        target,
        type,
        weight: 1,
        timestamps: [timestamp],
        data
      });
    }
  }

  private calculateDegrees(): void {
    // Reset degrees
    this.nodeMap.forEach((node) => {
      node.degree = 0;
    });

    // Count connections
    this.linkMap.forEach((link) => {
      const sourceNode = this.nodeMap.get(link.source);
      const targetNode = this.nodeMap.get(link.target);
      
      if (sourceNode) sourceNode.degree++;
      if (targetNode) targetNode.degree++;
    });
  }
}

export function buildCorrelationGraph(
  findings: Finding[], 
  config: CorrelationConfig
): GraphData {
  const builder = new GraphBuilder(config);
  return builder.buildGraph(findings);
}

// Calculate pivots (statistically interesting nodes)
export function calculatePivots(graphData: GraphData): any[] {
  const nodeStats = new Map<string, {
    node: GraphNode;
    connections: Set<string>;
    types: Map<string, number>;
  }>();

  // Initialize stats
  graphData.nodes.forEach((node) => {
    nodeStats.set(node.id, {
      node,
      connections: new Set(),
      types: new Map()
    });
  });

  // Build connection stats
  graphData.links.forEach((link) => {
    const sourceStats = nodeStats.get(link.source);
    const targetStats = nodeStats.get(link.target);

    if (sourceStats) {
      sourceStats.connections.add(link.target);
      sourceStats.types.set(link.type, (sourceStats.types.get(link.type) || 0) + 1);
    }
    if (targetStats) {
      targetStats.connections.add(link.source);
      targetStats.types.set(link.type, (targetStats.types.get(link.type) || 0) + 1);
    }
  });

  // Calculate pivot scores
  const pivots = Array.from(nodeStats.values())
    .filter((stats) => stats.connections.size > 0)
    .map((stats) => {
      const degree = stats.connections.size;
      const typeDiversity = stats.types.size;
      
      // Score based on degree and type diversity
      const score = degree * (1 + typeDiversity * 0.5);
      
      return {
        node: stats.node,
        degree,
        typeDiversity,
        score,
        isRare: degree <= 2,
        isCritical: degree >= 10 || stats.node.type === 'threat'
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return pivots;
}

// Find shortest path between two nodes
export function findShortestPath(
  graphData: GraphData, 
  startId: string, 
  endId: string
): string[] {
  if (startId === endId) return [startId];

  const adjacency = new Map<string, string[]>();
  
  graphData.links.forEach((link) => {
    if (!adjacency.has(link.source)) adjacency.set(link.source, []);
    if (!adjacency.has(link.target)) adjacency.set(link.target, []);
    adjacency.get(link.source)!.push(link.target);
    adjacency.get(link.target)!.push(link.source);
  });

  const queue: [string, string[]][] = [[startId, [startId]]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [current, path] = queue.shift()!;
    
    if (current === endId) return path;
    
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push([neighbor, [...path, neighbor]]);
      }
    }
  }

  return [];
}
