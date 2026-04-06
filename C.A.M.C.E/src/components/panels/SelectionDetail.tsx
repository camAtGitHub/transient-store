import { useState } from 'react';
import { Network, Edit2, Save, X, Tag } from 'lucide-react';
import { useStore } from '@/store';
import { NodeTypeColors, NodeTypeIcons } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

export const SelectionDetail = () => {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [newLabel, setNewLabel] = useState('');
  
  const {
    selectedNode,
    graphData,
    huntLabels,
    updateNodeNotes,
    addNodeLabel,
    removeNodeLabel,
    setSelectedNode
  } = useStore();

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-[#A7B0C8]">
        <Network size={48} className="mb-4 opacity-30" />
        <p className="text-sm">Select a node to view details</p>
        <p className="text-xs mt-1 opacity-60">Click on any node in the graph</p>
      </div>
    );
  }

  const getConnectedNodes = () => {
    return graphData.links
      .filter(link => link.source === selectedNode.id || link.target === selectedNode.id)
      .map(link => {
        const otherId = link.source === selectedNode.id ? link.target : link.source;
        const otherNode = graphData.nodes.find(n => n.id === otherId);
        return {
          link,
          node: otherNode,
          direction: link.source === selectedNode.id ? 'to' : 'from'
        };
      })
      .filter(item => item.node);
  };

  const connected = getConnectedNodes();
  const nodeLabels = huntLabels.get(selectedNode.id) || [];

  const handleSaveNotes = () => {
    updateNodeNotes(selectedNode.id, notesText);
    setIsEditingNotes(false);
  };

  const handleAddLabel = () => {
    if (newLabel.trim()) {
      addNodeLabel(selectedNode.id, newLabel.trim());
      setNewLabel('');
    }
  };

  const getTypeIcon = (type: string) => {
    return NodeTypeIcons[type as keyof typeof NodeTypeIcons] || '📌';
  };

  const getTypeColor = (type: string) => {
    return NodeTypeColors[type as keyof typeof NodeTypeColors] || '#A7B0C8';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getTypeIcon(selectedNode.type)}</span>
          <div>
            <div className="text-sm font-medium text-[#F2F5FF]">
              {selectedNode.label}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#A7B0C8]">
              <span 
                className="px-1.5 py-0.5 rounded"
                style={{ 
                  backgroundColor: `${getTypeColor(selectedNode.type)}20`,
                  color: getTypeColor(selectedNode.type)
                }}
              >
                {selectedNode.type}
              </span>
              <span>ID: {selectedNode.id.slice(-12)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 rounded hover:bg-white/10 text-[#A7B0C8]"
        >
          <X size={16} />
        </button>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4 pr-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-xs text-[#A7B0C8]">Degree</div>
              <div className="text-lg font-semibold text-[#00F0FF]">{selectedNode.degree}</div>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-xs text-[#A7B0C8]">Timestamp</div>
              <div className="text-xs font-mono text-[#F2F5FF]">
                {format(new Date(selectedNode.timestamp), 'HH:mm')}
              </div>
            </div>
          </div>

          {/* Hunt Labels */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#A7B0C8]">Hunt Labels</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Add label..."
                className="flex-1 h-8 bg-white/5 border-white/10 text-[#F2F5FF] text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
              />
              <Button
                onClick={handleAddLabel}
                size="sm"
                className="h-8 px-2 bg-[#00F0FF]/20 text-[#00F0FF]"
              >
                <Tag size={14} />
              </Button>
            </div>
            {nodeLabels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {nodeLabels.map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="text-xs border-[#00F0FF]/30 text-[#00F0FF]"
                  >
                    {label}
                    <button
                      onClick={() => removeNodeLabel(selectedNode.id, label)}
                      className="ml-1 hover:text-[#FF4D6D]"
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Investigation Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#A7B0C8]">Investigation Notes</span>
              {!isEditingNotes ? (
                <button
                  onClick={() => {
                    setNotesText(selectedNode.notes || '');
                    setIsEditingNotes(true);
                  }}
                  className="p-1 rounded hover:bg-white/10 text-[#A7B0C8]"
                >
                  <Edit2 size={14} />
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={handleSaveNotes}
                    className="p-1 rounded hover:bg-white/10 text-[#00FFC2]"
                  >
                    <Save size={14} />
                  </button>
                  <button
                    onClick={() => setIsEditingNotes(false)}
                    className="p-1 rounded hover:bg-white/10 text-[#FF4D6D]"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            
            {isEditingNotes ? (
              <Textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Add investigation notes..."
                className="bg-white/5 border-white/10 text-[#F2F5FF] text-xs min-h-[80px]"
              />
            ) : (
              <div className="p-3 rounded-lg bg-white/5 text-xs text-[#F2F5FF] min-h-[60px]">
                {selectedNode.notes || (
                  <span className="text-[#A7B0C8] italic">No notes added yet...</span>
                )}
              </div>
            )}
          </div>

          {/* Adjacency Table */}
          <div className="space-y-2">
            <span className="text-xs text-[#A7B0C8]">Connected Nodes ({connected.length})</span>
            <div className="space-y-1">
              {connected.slice(0, 10).map(({ link, node, direction }) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-2 rounded bg-white/5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span>{getTypeIcon(node!.type)}</span>
                    <span className="text-[#F2F5FF] truncate max-w-[100px]">{node!.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#A7B0C8]">
                    <span className="text-[10px] uppercase">{link.type}</span>
                    <span className="text-[#00F0FF]">{direction === 'to' ? '→' : '←'}</span>
                  </div>
                </div>
              ))}
              {connected.length > 10 && (
                <div className="text-center text-xs text-[#A7B0C8] py-1">
                  +{connected.length - 10} more...
                </div>
              )}
            </div>
          </div>

          {/* Raw Data */}
          <div className="space-y-2">
            <span className="text-xs text-[#A7B0C8]">Raw Data</span>
            <div className="p-3 rounded-lg bg-black/30 border border-white/10">
              <pre className="text-[10px] text-[#A7B0C8] overflow-x-auto">
                {JSON.stringify(selectedNode.data, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SelectionDetail;
