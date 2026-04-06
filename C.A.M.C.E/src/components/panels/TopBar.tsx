import { useState } from 'react';
import { 
  Download, 
  Upload, 
  Camera, 
  HelpCircle,
  GitBranch
} from 'lucide-react';
import { useStore } from '@/store';
import { Statistics } from './Statistics';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export const TopBar = () => {
  const [showHelp, setShowHelp] = useState(false);
  const { connection } = useStore();

  const handleExportPNG = () => {
    alert('PNG export would capture the current graph view');
  };

  const handleExportState = () => {
    const state = {
      findings: useStore.getState().findings,
      graphData: useStore.getState().baseGraphData,
      huntLabels: Array.from(useStore.getState().huntLabels.entries()),
      correlationConfig: useStore.getState().correlationConfig,
      timestamp: Date.now()
    };
    
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `camce-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const state = JSON.parse(event.target?.result as string);
        useStore.getState().setFindings(state.findings || []);
        useStore.getState().setBaseGraphData(state.graphData || { nodes: [], links: [] });
        useStore.getState().setGraphData(state.graphData || { nodes: [], links: [] });
        if (state.huntLabels) {
          useStore.getState().setHuntLabels(new Map(state.huntLabels));
        }
        if (state.correlationConfig) {
          useStore.getState().setCorrelationConfig(state.correlationConfig);
        }
        alert('State imported successfully!');
      } catch (error) {
        alert('Failed to import state: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const getStatusColor = () => {
    if (connection.demoMode) return 'bg-[#FFD166]';
    if (connection.connected) return 'bg-[#00FFC2]';
    return 'bg-[#FF4D6D]';
  };

  return (
    <div className="flex items-center justify-between h-full px-4">
      {/* Left: Logo & Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0FF] to-[#7B8CFF] flex items-center justify-center">
            <GitBranch size={18} className="text-[#07080D]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#F2F5FF] tracking-tight">CAMCE</h1>
            <p className="text-[10px] text-[#A7B0C8] uppercase tracking-wider">Correlation Engine</p>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0E111A]/80 border border-white/10">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
          <span className="text-xs text-[#A7B0C8]">
            {connection.demoMode ? 'Demo Mode' : connection.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Center: Statistics */}
      <div className="hidden md:block">
        <Statistics />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Export/Import */}
        <div className="flex items-center gap-1">
          <Button
            onClick={handleExportPNG}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#A7B0C8] hover:text-[#F2F5FF] hover:bg-white/10"
            title="Export PNG"
          >
            <Camera size={16} />
          </Button>
          
          <Button
            onClick={handleExportState}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#A7B0C8] hover:text-[#F2F5FF] hover:bg-white/10"
            title="Export State"
          >
            <Download size={16} />
          </Button>
          
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".json"
              onChange={handleImportState}
              className="hidden"
            />
            <div className="h-8 w-8 flex items-center justify-center rounded-md text-[#A7B0C8] hover:text-[#F2F5FF] hover:bg-white/10">
              <Upload size={16} />
            </div>
          </label>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Help */}
        <Dialog open={showHelp} onOpenChange={setShowHelp}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#A7B0C8] hover:text-[#F2F5FF] hover:bg-white/10"
            >
              <HelpCircle size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-[#0E111A] border-white/10 text-[#F2F5FF]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">CAMCE Help</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold text-[#00F0FF] mb-2">Getting Started</h3>
                <p className="text-[#A7B0C8]">
                  Connect to your OpenSearch Security Analytics instance or load demo data to explore the correlation features.
                </p>
              </section>
              
              <section>
                <h3 className="font-semibold text-[#00F0FF] mb-2">Graph Interactions</h3>
                <ul className="space-y-1 text-[#A7B0C8] list-disc list-inside">
                  <li><strong className="text-[#F2F5FF]">Click</strong> a node to select and view details</li>
                  <li><strong className="text-[#F2F5FF]">Shift+Click</strong> two nodes to find shortest path</li>
                  <li><strong className="text-[#F2F5FF]">Drag</strong> to pan the graph</li>
                  <li><strong className="text-[#F2F5FF]">Scroll</strong> to zoom in/out</li>
                  <li><strong className="text-[#F2F5FF]">Hover</strong> to highlight neighbors</li>
                </ul>
              </section>
              
              <section>
                <h3 className="font-semibold text-[#00F0FF] mb-2">Timeline Playback</h3>
                <p className="text-[#A7B0C8]">
                  Use the timeline at the bottom to scrub through events. Click Play to animate through the time window.
                </p>
              </section>
              
              <section>
                <h3 className="font-semibold text-[#00F0FF] mb-2">Pivots</h3>
                <p className="text-[#A7B0C8]">
                  Pivots are statistically interesting nodes with high connectivity or rare occurrence. Use them to find investigation starting points.
                </p>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default TopBar;
