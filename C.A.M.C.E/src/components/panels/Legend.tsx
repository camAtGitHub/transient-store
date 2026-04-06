import { EyeOff } from 'lucide-react';
import { useStore } from '@/store';
import { NodeTypeColors } from '@/types';
import type { NodeType } from '@/types';

const NODE_TYPES: NodeType[] = ['finding', 'document', 'ip', 'user', 'host', 'email', 'domain', 'threat', 'detector', 'custom'];

export const Legend = () => {
  const { graphData, filters, toggleNodeTypeFilter, showLegend, setShowLegend } = useStore();

  const getNodeCount = (type: NodeType) => {
    return graphData.nodes.filter(n => n.type === type).length;
  };

  if (!showLegend) {
    return (
      <button
        onClick={() => setShowLegend(true)}
        className="px-3 py-2 rounded-lg bg-[#0E111A]/90 backdrop-blur-md border border-white/10 text-xs text-[#A7B0C8] hover:text-[#F2F5FF]"
      >
        Show Legend
      </button>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-[#0E111A]/90 backdrop-blur-md border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#F2F5FF] uppercase tracking-wider">Legend</span>
        <button
          onClick={() => setShowLegend(false)}
          className="p-1 rounded hover:bg-white/10 text-[#A7B0C8]"
        >
          <EyeOff size={14} />
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-1.5">
        {NODE_TYPES.map((type) => {
          const count = getNodeCount(type);
          if (count === 0) return null;
          
          const isVisible = filters.nodeTypes.has(type);
          const color = NodeTypeColors[type];
          
          return (
            <button
              key={type}
              onClick={() => toggleNodeTypeFilter(type)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                isVisible
                  ? 'bg-white/10 text-[#F2F5FF]'
                  : 'bg-white/5 text-[#A7B0C8] opacity-50'
              }`}
            >
              <span 
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
              />
              <span className="flex-1 text-left capitalize">{type}</span>
              <span className="text-[#A7B0C8]">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Legend;
