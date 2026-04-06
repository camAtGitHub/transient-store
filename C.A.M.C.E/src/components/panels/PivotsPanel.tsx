import { Target, TrendingUp, Sparkles } from 'lucide-react';
import { useStore } from '@/store';
import { NodeTypeIcons } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export const PivotsPanel = () => {
  const { pivots, selectedNode, setSelectedNode, setHighlightedNodes } = useStore();

  const handlePivotClick = (pivot: any) => {
    setSelectedNode(pivot.node);
    setHighlightedNodes(new Set([pivot.node.id]));
  };

  const getTypeIcon = (type: string) => {
    return NodeTypeIcons[type as keyof typeof NodeTypeIcons] || '📌';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-[#00F0FF]" />
        <span className="text-sm font-semibold text-[#F2F5FF] uppercase tracking-wider">Pivots</span>
        <Badge variant="outline" className="ml-auto text-xs border-white/10 text-[#A7B0C8]">
          {pivots.length}
        </Badge>
      </div>

      <p className="text-xs text-[#A7B0C8]">
        Statistically interesting entities based on connectivity and type diversity.
      </p>

      <ScrollArea className="h-[300px]">
        <div className="space-y-2 pr-3">
          {pivots.length === 0 ? (
            <div className="text-center py-8 text-[#A7B0C8] text-sm">
              <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
              <p>No pivots calculated yet.</p>
              <p className="text-xs mt-1">Load data and build the graph to see pivots.</p>
            </div>
          ) : (
            pivots.map((pivot: any) => (
              <button
                key={pivot.node.id}
                onClick={() => handlePivotClick(pivot)}
                className={`w-full p-3 rounded-lg text-left transition-all ${
                  selectedNode?.id === pivot.node.id
                    ? 'bg-[#00F0FF]/20 border border-[#00F0FF]/50'
                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getTypeIcon(pivot.node.type)}</span>
                    <div>
                      <div className="text-sm font-medium text-[#F2F5FF] truncate max-w-[140px]">
                        {pivot.node.label}
                      </div>
                      <div className="text-xs text-[#A7B0C8]">
                        {pivot.node.type} • degree {pivot.degree}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    {pivot.isCritical && (
                      <Badge className="bg-[#FF4D6D]/20 text-[#FF4D6D] border-[#FF4D6D]/30 text-xs">
                        CRIT
                      </Badge>
                    )}
                    {pivot.isRare && (
                      <Badge className="bg-[#FFD166]/20 text-[#FFD166] border-[#FFD166]/30 text-xs">
                        RARE
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs">
                  <div className="flex items-center gap-1 text-[#A7B0C8]">
                    <TrendingUp size={12} />
                    <span>Score: {Math.round(pivot.score)}</span>
                  </div>
                  <div className="text-[#A7B0C8]">
                    Types: {pivot.typeDiversity}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="pt-3 border-t border-white/10">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs border-[#FF4D6D]/30 text-[#FF4D6D]">
            CRIT = High degree
          </Badge>
          <Badge variant="outline" className="text-xs border-[#FFD166]/30 text-[#FFD166]">
            RARE = Low occurrence
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default PivotsPanel;
        CRIT = High degree
          </Badge>
          <Badge variant="outline" className="text-xs border-[#FFD166]/30 text-[#FFD166]">
            RARE = Low occurrence
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default PivotsPanel;
