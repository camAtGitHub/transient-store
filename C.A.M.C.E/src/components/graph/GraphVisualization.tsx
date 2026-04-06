import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import coseBilkent from 'cytoscape-cose-bilkent';
import { useStore } from '@/store';
import { NodeTypeColors } from '@/types';
import type { LayoutType } from '@/types';
import { findShortestPath } from '@/services/graphBuilder';

// Register layouts
cytoscape.use(fcose);
cytoscape.use(coseBilkent);

interface GraphVisualizationProps {
  onNodeClick?: (nodeId: string) => void;
}

const layoutOptions: Record<LayoutType, any> = {
  fcose: {
    name: 'fcose',
    padding: 50,
    animate: true,
    animationDuration: 500,
    fit: true,
    componentSpacing: 100,
    nodeRepulsion: 4500,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 0.25,
    numIter: 2500,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  },
  cose: {
    name: 'cose',
    padding: 50,
    animate: true,
    fit: true,
    componentSpacing: 100,
    nodeRepulsion: 400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  },
  concentric: {
    name: 'concentric',
    padding: 50,
    animate: true,
    animationDuration: 500,
    fit: true,
    concentric: (node: any) => node.degree(),
    levelWidth: (nodes: any) => nodes.maxDegree() / 4,
    spacingFactor: 0.8
  },
  grid: {
    name: 'grid',
    padding: 50,
    animate: true,
    animationDuration: 500,
    fit: true
  },
  breadthfirst: {
    name: 'breadthfirst',
    padding: 50,
    animate: true,
    animationDuration: 500,
    fit: true,
    directed: true,
    circle: false,
    grid: true,
    spacingFactor: 1.2,
    avoidOverlap: true
  },
  circle: {
    name: 'circle',
    padding: 50,
    animate: true,
    animationDuration: 500,
    fit: true
  }
};

export const GraphVisualization = ({ onNodeClick }: GraphVisualizationProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isReady, setIsReady] = useState(false);

  const {
    graphData,
    baseGraphData,
    selectedNode,
    highlightedPath,
    layout,
    timeline,
    filters,
    setSelectedNode,
    setHighlightedPath,
    setHighlightedNodes
  } = useStore();

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => NodeTypeColors[ele.data('type') as keyof typeof NodeTypeColors] || '#A7B0C8',
            'width': (ele: any) => Math.max(15, Math.min(50, 10 + ele.data('degree') * 2)),
            'height': (ele: any) => Math.max(15, Math.min(50, 10 + ele.data('degree') * 2)),
            'label': (ele: any) => ele.data('label'),
            'color': '#F2F5FF',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 5,
            'text-background-color': 'rgba(7, 8, 13, 0.8)',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px 4px',
            'text-background-shape': 'roundrectangle',
            'border-width': 2,
            'border-color': (ele: any) => {
              if (ele.selected()) return '#00F0FF';
              return 'rgba(242, 245, 255, 0.2)';
            },
            'transition-property': 'border-color, width, height',
             'transition-duration': 200
          }
        },
        {
          selector: 'edge',
          style: {
            'width': (ele: any) => Math.max(1, Math.min(4, ele.data('weight'))),
            'line-color': (ele: any) => {
              const type = ele.data('type');
              if (type === 'temporal_bridge') return '#00FFC2';
              if (type === 'co_occurs') return '#7B8CFF';
              if (type === 'critical_path') return '#FF4D6D';
              return 'rgba(167, 176, 200, 0.3)';
            },
            'target-arrow-color': (ele: any) => {
              const type = ele.data('type');
              if (type === 'temporal_bridge') return '#00FFC2';
              if (type === 'co_occurs') return '#7B8CFF';
              return 'rgba(167, 176, 200, 0.3)';
            },
            'target-arrow-shape': (ele: any) => {
              const type = ele.data('type');
              return type === 'temporal_bridge' || type === 'co_occurs' ? 'triangle' : 'none';
            },
            'curve-style': 'bezier',
            'opacity': 0.6
          }
        },
        {
          selector: '.highlighted',
          style: {
            'border-color': '#00F0FF',
            'border-width': 3
          }
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.15
          }
        },
        {
          selector: '.path-edge',
          style: {
            'line-color': '#FF4D6D',
            'width': 3,
            'line-style': 'dashed'
          }
        },
        {
          selector: ':selected',
          style: {
            'border-color': '#00F0FF',
            'border-width': 3
          }
        }
      ],
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 3
    });

    cyRef.current = cy;
    setIsReady(true);

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.id();
      
      if (evt.originalEvent?.shiftKey) {
        // Shift+click for path finding
        if (selectedNode && selectedNode.id !== nodeId) {
          const path = findShortestPath(
            { nodes: baseGraphData.nodes, links: baseGraphData.links },
            selectedNode.id,
            nodeId
          );
          setHighlightedPath(path);
        }
      } else {
        setSelectedNode(node.data() as any);
        onNodeClick?.(nodeId);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setHighlightedPath([]);
        setHighlightedNodes(new Set());
      }
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      
      cy.nodes().addClass('dimmed');
      cy.edges().addClass('dimmed');
      
      node.removeClass('dimmed');
      node.neighborhood().nodes().removeClass('dimmed');
      node.connectedEdges().removeClass('dimmed');
    });

    cy.on('mouseout', 'node', () => {
      cy.nodes().removeClass('dimmed');
      cy.edges().removeClass('dimmed');
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Update graph data
  useEffect(() => {
    if (!cyRef.current || !isReady) return;

    const cy = cyRef.current;
    
    // Build elements
    const elements: any[] = [];
    
    graphData.nodes.forEach((node) => {
      // Apply filters
      if (!filters.nodeTypes.has(node.type)) return;
      
      // Apply timeline filter
      if (timeline.currentWindowStart && timeline.currentWindowEnd) {
        if (node.timestamp < timeline.currentWindowStart || 
            node.timestamp > timeline.currentWindowEnd) {
          return;
        }
      }
      
      // Apply search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const labelMatch = node.label.toLowerCase().includes(searchLower);
        const dataMatch = JSON.stringify(node.data).toLowerCase().includes(searchLower);
        if (!labelMatch && !dataMatch) return;
      }

      elements.push({
        data: {
          id: node.id,
          type: node.type,
          label: node.label,
          degree: node.degree,
          timestamp: node.timestamp,
          notes: node.notes,
          instanceId: node.instanceId,
          nodeData: node.data
        }
      });
    });

    graphData.links.forEach((link) => {
      // Check if both source and target exist in filtered nodes
      const sourceExists = elements.some((e) => e.data.id === link.source);
      const targetExists = elements.some((e) => e.data.id === link.target);
      
      if (sourceExists && targetExists) {
        elements.push({
          data: {
            id: link.id,
            source: link.source,
            target: link.target,
            type: link.type,
            weight: link.weight,
            timestamps: link.timestamps
          }
        });
      }
    });

    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });

    // Apply layout
    if (elements.length > 0) {
      const layoutOpts = layoutOptions[layout];
      cy.layout(layoutOpts).run();
    }
  }, [graphData, filters, timeline, layout, isReady]);

  // Handle selection
  useEffect(() => {
    if (!cyRef.current || !isReady) return;

    const cy = cyRef.current;
    cy.nodes().unselect();

    if (selectedNode) {
      const node = cy.getElementById(selectedNode.id);
      if (node.length > 0) {
        node.select();
        
        // Center on node
        cy.animate({
          fit: {
            eles: node,
            padding: 100
          },
          duration: 300,
          easing: 'ease-out'
        });
      }
    }
  }, [selectedNode, isReady]);

  // Handle highlighted path
  useEffect(() => {
    if (!cyRef.current || !isReady) return;

    const cy = cyRef.current;
    
    // Clear previous path styling
    cy.edges().removeClass('path-edge');
    cy.nodes().removeClass('highlighted');

    if (highlightedPath.length > 1) {
      // Highlight nodes in path
      highlightedPath.forEach((nodeId) => {
        const node = cy.getElementById(nodeId);
        if (node.length > 0) {
          node.addClass('highlighted');
        }
      });

      // Highlight edges in path
      for (let i = 0; i < highlightedPath.length - 1; i++) {
        const source = highlightedPath[i];
        const target = highlightedPath[i + 1];
        
        const edge = cy.edges().filter((e) => {
          const s = e.source().id();
          const t = e.target().id();
          return (s === source && t === target) || (s === target && t === source);
        });
        
        if (edge.length > 0) {
          edge.addClass('path-edge');
        }
      }
    }
  }, [highlightedPath, isReady]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ 
        background: 'transparent',
        cursor: 'grab'
      }}
    />
  );
};

export default GraphVisualization;
