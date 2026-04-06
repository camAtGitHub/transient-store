import { BarChart3, Clock, Activity, Shield } from 'lucide-react';
import { useStore } from '@/store';
import { formatDistance } from 'date-fns';

export const Statistics = () => {
  const { graphData, findings, alerts, timeline } = useStore();

  const visibleNodes = graphData.nodes.length;
  const visibleEdges = graphData.links.length;
  const entityNodes = graphData.nodes.filter(n => 
    ['ip', 'user', 'host', 'email', 'domain'].includes(n.type)
  ).length;

  const timeSpan = timeline.startTime && timeline.endTime
    ? formatDistance(new Date(timeline.startTime), new Date(timeline.endTime))
    : 'N/A';

  return (
    <div className="flex items-center gap-4">
      {/* Stats chips */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E111A]/80 border border-white/10">
          <BarChart3 size={14} className="text-[#00F0FF]" />
          <span className="text-xs text-[#A7B0C8]">Nodes:</span>
          <span className="text-xs font-semibold text-[#F2F5FF]">{visibleNodes}</span>
        </div>
        
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E111A]/80 border border-white/10">
          <Activity size={14} className="text-[#7B8CFF]" />
          <span className="text-xs text-[#A7B0C8]">Edges:</span>
          <span className="text-xs font-semibold text-[#F2F5FF]">{visibleEdges}</span>
        </div>
        
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E111A]/80 border border-white/10">
          <Shield size={14} className="text-[#FF4D6D]" />
          <span className="text-xs text-[#A7B0C8]">Findings:</span>
          <span className="text-xs font-semibold text-[#F2F5FF]">{findings.length}</span>
        </div>
        
        {timeline.startTime > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E111A]/80 border border-white/10">
            <Clock size={14} className="text-[#00FFC2]" />
            <span className="text-xs text-[#A7B0C8]">Span:</span>
            <span className="text-xs font-semibold text-[#F2F5FF]">{timeSpan}</span>
          </div>
        )}
      </div>

      {/* Detailed breakdown (hidden on small screens) */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-[#A7B0C8]">
        <span>Entities: <span className="text-[#F2F5FF]">{entityNodes}</span></span>
        <span className="text-white/20">|</span>
        <span>Alerts: <span className="text-[#F2F5FF]">{alerts.length}</span></span>
      </div>
    </div>
  );
};

export default Statistics;
</span></span>
        <span className="text-white/20">|</span>
        <span>Alerts: <span className="text-[#F2F5FF]">{alerts.length}</span></span>
      </div>
    </div>
  );
};

export default Statistics;
