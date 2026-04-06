import { useState } from 'react';
import { Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '@/store';
import { openSearchService } from '@/services/opensearch';
import { demoDataService } from '@/services/demoData';
import { buildCorrelationGraph, calculatePivots } from '@/services/graphBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const DETECTOR_TYPES = ['windows', 'linux', 'network', 'cloudtrail', 'ad_ldap', 'dns', 'apache', 'nginx'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const LOG_TYPES = ['windows', 'linux', 'network', 'cloudtrail', 'ad_ldap', 'dns', 'apache', 'nginx', 'okta', 'github'];

export const QueryPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  
  const {
    connection,
    queryConfig,
    correlationConfig,
    setQueryConfig,
    setFindings,
    setGraphData,
    setBaseGraphData,
    setPivots,
    setTimeline
  } = useStore();

  const handleFetchFindings = async () => {
    setIsFetching(true);
    
    try {
      let findings;
      
      if (connection.demoMode) {
        findings = demoDataService.getFindings(queryConfig.batchSize);
      } else {
        const response = await openSearchService.getFindings({
          detectorType: queryConfig.detectorType[0],
          severity: queryConfig.severity[0],
          sortOrder: queryConfig.sortOrder,
          size: queryConfig.batchSize,
          startIndex: queryConfig.startIndex
        });
        findings = response.findings;
      }
      
      setFindings(findings);
      
      // Rebuild graph
      const graphData = buildCorrelationGraph(findings, correlationConfig);
      setBaseGraphData(graphData);
      setGraphData(graphData);
      
      // Recalculate pivots
      const pivots = calculatePivots(graphData);
      setPivots(pivots);
      
      // Update timeline
      if (findings.length > 0) {
        const timestamps = findings.map(f => f.timestamp);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        setTimeline({
          startTime: minTime,
          endTime: maxTime,
          currentWindowStart: minTime,
          currentWindowEnd: Math.min(minTime + 60 * 60 * 1000, maxTime)
        });
      }
    } catch (error) {
      console.error('Failed to fetch findings:', error);
    } finally {
      setIsFetching(false);
    }
  };

  const toggleDetectorType = (type: string) => {
    const current = queryConfig.detectorType;
    if (current.includes(type)) {
      setQueryConfig({ detectorType: current.filter(t => t !== type) });
    } else {
      setQueryConfig({ detectorType: [...current, type] });
    }
  };

  const toggleSeverity = (severity: string) => {
    const current = queryConfig.severity;
    if (current.includes(severity)) {
      setQueryConfig({ severity: current.filter(s => s !== severity) });
    } else {
      setQueryConfig({ severity: [...current, severity] });
    }
  };

  const toggleLogType = (type: string) => {
    const current = queryConfig.logType;
    if (current.includes(type)) {
      setQueryConfig({ logType: current.filter(t => t !== type) });
    } else {
      setQueryConfig({ logType: [...current, type] });
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full py-2 text-left">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-[#00F0FF]" />
            <span className="text-sm font-semibold text-[#F2F5FF] uppercase tracking-wider">Findings Query</span>
          </div>
          {isOpen ? <ChevronUp size={16} className="text-[#A7B0C8]" /> : <ChevronDown size={16} className="text-[#A7B0C8]" />}
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-2">
        {/* Detector Type */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Detector Type</Label>
          <div className="flex flex-wrap gap-1.5">
            {DETECTOR_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleDetectorType(type)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  queryConfig.detectorType.includes(type)
                    ? 'bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]/50'
                    : 'bg-white/5 text-[#A7B0C8] border border-white/10 hover:bg-white/10'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Severity</Label>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_LEVELS.map((severity) => (
              <button
                key={severity}
                onClick={() => toggleSeverity(severity)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                  queryConfig.severity.includes(severity)
                    ? severity === 'critical' ? 'bg-[#FF4D6D]/30 text-[#FF4D6D] border border-[#FF4D6D]/50'
                    : severity === 'high' ? 'bg-[#FFD166]/30 text-[#FFD166] border border-[#FFD166]/50'
                    : severity === 'medium' ? 'bg-[#7B8CFF]/30 text-[#7B8CFF] border border-[#7B8CFF]/50'
                    : 'bg-[#00FFC2]/30 text-[#00FFC2] border border-[#00FFC2]/50'
                    : 'bg-white/5 text-[#A7B0C8] border border-white/10 hover:bg-white/10'
                }`}
              >
                {severity}
              </button>
            ))}
          </div>
        </div>

        {/* Log Type */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Log Type</Label>
          <div className="flex flex-wrap gap-1.5">
            {LOG_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleLogType(type)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  queryConfig.logType.includes(type)
                    ? 'bg-[#7B8CFF]/30 text-[#7B8CFF] border border-[#7B8CFF]/50'
                    : 'bg-white/5 text-[#A7B0C8] border border-white/10 hover:bg-white/10'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Batch settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#A7B0C8]">Batch Size</Label>
            <Input
              type="number"
              value={queryConfig.batchSize}
              onChange={(e) => setQueryConfig({ batchSize: parseInt(e.target.value) || 100 })}
              className="bg-white/5 border-white/10 text-[#F2F5FF] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-[#A7B0C8]">Start Index</Label>
            <Input
              type="number"
              value={queryConfig.startIndex}
              onChange={(e) => setQueryConfig({ startIndex: parseInt(e.target.value) || 0 })}
              className="bg-white/5 border-white/10 text-[#F2F5FF] text-sm"
            />
          </div>
        </div>

        {/* Sort order */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Sort Order</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setQueryConfig({ sortOrder: 'desc' })}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                queryConfig.sortOrder === 'desc'
                  ? 'bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/30'
                  : 'bg-white/5 text-[#A7B0C8] border border-white/10 hover:bg-white/10'
              }`}
            >
              Newest First
            </button>
            <button
              onClick={() => setQueryConfig({ sortOrder: 'asc' })}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                queryConfig.sortOrder === 'asc'
                  ? 'bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/30'
                  : 'bg-white/5 text-[#A7B0C8] border border-white/10 hover:bg-white/10'
              }`}
            >
              Oldest First
            </button>
          </div>
        </div>

        {/* Fetch button */}
        <Button
          onClick={handleFetchFindings}
          disabled={isFetching}
          className="w-full bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]/30"
        >
          <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Fetching...' : 'Fetch Findings'}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default QueryPanel;
