import React, { useState } from 'react';
import { Server, User, Lock, TestTube, Database, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useStore } from '@/store';
import { openSearchService } from '@/services/opensearch';
import { demoDataService } from '@/services/demoData';
import { buildCorrelationGraph, calculatePivots } from '@/services/graphBuilder';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export const ConnectionPanel: React.FC = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const {
    connection,
    correlationConfig,
    setConnection,
    setConnected,
    setDemoMode,
    setFindings,
    setAlerts,
    setThreatIntel,
    setGraphData,
    setBaseGraphData,
    setPivots,
    setTimeline
  } = useStore();

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      openSearchService.setConnection({
        ...connection,
        connected: false,
        demoMode: false
      });

      const isConnected = await openSearchService.testConnection();
      
      if (isConnected) {
        setConnected(true);
        setDemoMode(false);
        
        // Fetch initial data
        const findingsData = await openSearchService.getFindings({ size: 100 });
        setFindings(findingsData.findings);
        
        const alertsData = await openSearchService.getAlerts({ size: 50 });
        setAlerts(alertsData.alerts);
        
        // Build graph
        const graphData = buildCorrelationGraph(findingsData.findings, correlationConfig);
        setBaseGraphData(graphData);
        setGraphData(graphData);
        
        // Calculate pivots
        const pivots = calculatePivots(graphData);
        setPivots(pivots);
        
        // Set timeline
        if (findingsData.findings.length > 0) {
          const timestamps = findingsData.findings.map(f => f.timestamp);
          const minTime = Math.min(...timestamps);
          const maxTime = Math.max(...timestamps);
          setTimeline({
            startTime: minTime,
            endTime: maxTime,
            currentWindowStart: minTime,
            currentWindowEnd: Math.min(minTime + 60 * 60 * 1000, maxTime)
          });
        }
      } else {
        setConnectionError('Failed to connect to OpenSearch');
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLoadDemo = () => {
    const findings = demoDataService.getFindings(80);
    const alerts = demoDataService.getAlerts(30);
    const threatIntel = demoDataService.getThreatIntel(15);
    
    setFindings(findings);
    setAlerts(alerts);
    setThreatIntel(threatIntel);
    setDemoMode(true);
    setConnected(false);
    
    // Build graph
    const graphData = buildCorrelationGraph(findings, correlationConfig);
    setBaseGraphData(graphData);
    setGraphData(graphData);
    
    // Calculate pivots
    const pivots = calculatePivots(graphData);
    setPivots(pivots);
    
    // Set timeline
    const timestamps = findings.map(f => f.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    setTimeline({
      startTime: minTime,
      endTime: maxTime,
      currentWindowStart: minTime,
      currentWindowEnd: Math.min(minTime + 60 * 60 * 1000, maxTime)
    });
  };

  const getStatusIcon = () => {
    if (connection.demoMode) {
      return <TestTube size={16} className="text-[#FFD166]" />;
    }
    if (connection.connected) {
      return <CheckCircle size={16} className="text-[#00FFC2]" />;
    }
    return <XCircle size={16} className="text-[#FF4D6D]" />;
  };

  const getStatusText = () => {
    if (connection.demoMode) return 'Demo Mode';
    if (connection.connected) return 'Connected';
    return 'Disconnected';
  };

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connection.demoMode ? 'bg-[#FFD166]' :
            connection.connected ? 'bg-[#00FFC2]' : 'bg-[#FF4D6D]'
          }`} />
          <span className="text-sm text-[#A7B0C8]">{getStatusText()}</span>
        </div>
        {getStatusIcon()}
      </div>

      {/* Connection form */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-[#A7B0C8] uppercase tracking-wider">Host</Label>
          <div className="relative">
            <Server size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A7B0C8]" />
            <Input
              value={connection.host}
              onChange={(e) => setConnection({ host: e.target.value })}
              placeholder="https://opensearch:9200"
              className="pl-9 bg-white/5 border-white/10 text-[#F2F5FF] placeholder:text-[#A7B0C8]/50 focus:border-[#00F0FF]/50"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#A7B0C8] uppercase tracking-wider">Username</Label>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A7B0C8]" />
            <Input
              value={connection.username}
              onChange={(e) => setConnection({ username: e.target.value })}
              placeholder="admin"
              className="pl-9 bg-white/5 border-white/10 text-[#F2F5FF] placeholder:text-[#A7B0C8]/50 focus:border-[#00F0FF]/50"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-[#A7B0C8] uppercase tracking-wider">Password</Label>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A7B0C8]" />
            <Input
              type="password"
              value={connection.password}
              onChange={(e) => setConnection({ password: e.target.value })}
              placeholder="••••••••"
              className="pl-9 bg-white/5 border-white/10 text-[#F2F5FF] placeholder:text-[#A7B0C8]/50 focus:border-[#00F0FF]/50"
            />
          </div>
        </div>

        {connectionError && (
          <div className="flex items-center gap-2 text-[#FF4D6D] text-sm">
            <AlertCircle size={14} />
            <span>{connectionError}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleConnect}
            disabled={isConnecting || !connection.host}
            className="flex-1 bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]/30"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>
          
          <Button
            onClick={handleLoadDemo}
            variant="outline"
            className="flex-1 border-white/10 text-[#A7B0C8] hover:bg-white/5 hover:text-[#F2F5FF]"
          >
            <Database size={14} className="mr-2" />
            Demo Data
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionPanel;
