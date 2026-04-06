import { useEffect } from 'react';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { Timeline } from '@/components/graph/Timeline';
import { TopBar } from '@/components/panels/TopBar';
import { ConnectionPanel } from '@/components/panels/ConnectionPanel';
import { QueryPanel } from '@/components/panels/QueryPanel';
import { CorrelationPanel } from '@/components/panels/CorrelationPanel';
import { PivotsPanel } from '@/components/panels/PivotsPanel';
import { SelectionDetail } from '@/components/panels/SelectionDetail';
import { Legend } from '@/components/panels/Legend';
import { useStore } from '@/store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LayoutType } from '@/types';
import { Layout, Target, FileText } from 'lucide-react';

function App() {
  const {
    layout,
    setLayout,
    filters,
    setSearchTerm
  } = useStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useStore.getState().setSelectedNode(null);
        useStore.getState().setHighlightedPath([]);
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('graph-search')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07080D]">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(0, 240, 255, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(123, 140, 255, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(0, 255, 194, 0.04) 0%, transparent 70%)
          `
        }}
      />

      {/* Noise overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay'
        }}
      />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-16 z-30">
        <TopBar />
      </div>

      {/* Left Sidebar */}
      <div 
        className="absolute top-20 left-4 w-80 bottom-[140px] z-20 flex flex-col gap-3"
        style={{
          animation: 'slideInLeft 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      >
        {/* Connection Panel */}
        <div className="p-4 rounded-2xl bg-[#0E111A]/90 backdrop-blur-md border border-white/10">
          <ConnectionPanel />
        </div>

        {/* Scrollable panels */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Query Panel */}
          <div className="p-4 rounded-2xl bg-[#0E111A]/90 backdrop-blur-md border border-white/10">
            <QueryPanel />
          </div>

          {/* Correlation Panel */}
          <div className="p-4 rounded-2xl bg-[#0E111A]/90 backdrop-blur-md border border-white/10">
            <CorrelationPanel />
          </div>
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="absolute top-20 left-[336px] right-[336px] bottom-[140px] z-10">
        {/* Graph Controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          {/* Layout selector */}
          <div className="pointer-events-auto">
            <Select value={layout} onValueChange={(v) => setLayout(v as LayoutType)}>
              <SelectTrigger className="w-40 bg-[#0E111A]/90 backdrop-blur-md border-white/10 text-[#F2F5FF]">
                <Layout size={14} className="mr-2 text-[#00F0FF]" />
                <SelectValue placeholder="Layout" />
              </SelectTrigger>
              <SelectContent className="bg-[#0E111A] border-white/10">
                <SelectItem value="fcose" className="text-[#F2F5FF]">Force-directed</SelectItem>
                <SelectItem value="concentric" className="text-[#F2F5FF]">Concentric</SelectItem>
                <SelectItem value="grid" className="text-[#F2F5FF]">Grid</SelectItem>
                <SelectItem value="breadthfirst" className="text-[#F2F5FF]">Breadth-first</SelectItem>
                <SelectItem value="circle" className="text-[#F2F5FF]">Circle</SelectItem>
                <SelectItem value="cose" className="text-[#F2F5FF]">Compound Spring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="pointer-events-auto">
            <div className="relative">
              <input
                id="graph-search"
                type="text"
                value={filters.searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search nodes..."
                className="w-48 px-3 py-2 pl-9 rounded-lg bg-[#0E111A]/90 backdrop-blur-md border border-white/10 text-sm text-[#F2F5FF] placeholder:text-[#A7B0C8]/50 focus:outline-none focus:border-[#00F0FF]/50"
              />
              <svg 
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7B0C8]"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Graph */}
        <div className="w-full h-full rounded-2xl overflow-hidden">
          <GraphVisualization />
        </div>

        {/* Legend (floating) */}
        <div className="absolute bottom-4 left-4 z-20">
          <Legend />
        </div>
      </div>

      {/* Right Sidebar */}
      <div 
        className="absolute top-20 right-4 w-80 bottom-[140px] z-20"
        style={{
          animation: 'slideInRight 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      >
        <Tabs defaultValue="pivots" className="h-full flex flex-col">
          <TabsList className="w-full grid grid-cols-2 bg-[#0E111A]/90 backdrop-blur-md border border-white/10 p-1">
            <TabsTrigger 
              value="pivots"
              className="data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF] text-[#A7B0C8]"
            >
              <Target size={14} className="mr-2" />
              Pivots
            </TabsTrigger>
            <TabsTrigger 
              value="detail"
              className="data-[state=active]:bg-[#00F0FF]/20 data-[state=active]:text-[#00F0FF] text-[#A7B0C8]"
            >
              <FileText size={14} className="mr-2" />
              Detail
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 mt-3 p-4 rounded-2xl bg-[#0E111A]/90 backdrop-blur-md border border-white/10 overflow-hidden">
            <TabsContent value="pivots" className="h-full m-0">
              <PivotsPanel />
            </TabsContent>
            <TabsContent value="detail" className="h-full m-0">
              <SelectionDetail />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Bottom Timeline */}
      <div 
        className="absolute left-4 right-4 bottom-4 h-[110px] z-20"
        style={{
          animation: 'slideInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
        }}
      >
        <Timeline />
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default App;
