import { useState } from 'react';
import { Network, Plus, X, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { useStore } from '@/store';
import { buildCorrelationGraph, calculatePivots } from '@/services/graphBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';

export const CorrelationPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [newField, setNewField] = useState('');
  
  const {
    findings,
    correlationConfig,
    setCorrelationConfig,
    setGraphData,
    setBaseGraphData,
    setPivots
  } = useStore();

  const handleRebuildGraph = () => {
    const graphData = buildCorrelationGraph(findings, correlationConfig);
    setBaseGraphData(graphData);
    setGraphData(graphData);
    
    const pivots = calculatePivots(graphData);
    setPivots(pivots);
  };

  const addAdditionalField = () => {
    if (newField && !correlationConfig.additionalFields.includes(newField)) {
      setCorrelationConfig({
        additionalFields: [...correlationConfig.additionalFields, newField]
      });
      setNewField('');
    }
  };

  const removeAdditionalField = (field: string) => {
    setCorrelationConfig({
      additionalFields: correlationConfig.additionalFields.filter(f => f !== field)
    });
  };

  const toggleDefaultField = (field: keyof typeof correlationConfig.defaultFields) => {
    setCorrelationConfig({
      defaultFields: {
        ...correlationConfig.defaultFields,
        [field]: !correlationConfig.defaultFields[field]
      }
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full py-2 text-left">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-[#00F0FF]" />
            <span className="text-sm font-semibold text-[#F2F5FF] uppercase tracking-wider">Correlation</span>
          </div>
          {isOpen ? <ChevronUp size={16} className="text-[#A7B0C8]" /> : <ChevronDown size={16} className="text-[#A7B0C8]" />}
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-2">
        {/* Default fields */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Default Correlation Fields</Label>
          <div className="space-y-2">
            {Object.entries(correlationConfig.defaultFields).map(([field, enabled]) => (
              <div key={field} className="flex items-center justify-between">
                <span className="text-sm text-[#F2F5FF]">related.{field}</span>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleDefaultField(field as keyof typeof correlationConfig.defaultFields)}
                  className="data-[state=checked]:bg-[#00F0FF]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Additional fields */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Additional Fields</Label>
          <div className="flex gap-2">
            <Input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              placeholder="e.g., process.name"
              className="flex-1 bg-white/5 border-white/10 text-[#F2F5FF] text-sm"
              onKeyDown={(e) => e.key === 'Enter' && addAdditionalField()}
            />
            <Button
              onClick={addAdditionalField}
              variant="outline"
              size="icon"
              className="border-white/10 text-[#A7B0C8] hover:bg-white/5"
            >
              <Plus size={16} />
            </Button>
          </div>
          
          {correlationConfig.additionalFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {correlationConfig.additionalFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#7B8CFF]/20 text-[#7B8CFF] text-xs"
                >
                  {field}
                  <button
                    onClick={() => removeAdditionalField(field)}
                    className="hover:text-[#FF4D6D]"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Story window */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#A7B0C8]">Story Window</Label>
            <span className="text-xs text-[#00F0FF]">{correlationConfig.storyWindowMinutes} min</span>
          </div>
          <Slider
            value={[correlationConfig.storyWindowMinutes]}
            onValueChange={([value]) => setCorrelationConfig({ storyWindowMinutes: value })}
            min={5}
            max={120}
            step={5}
            className="[&_[role=slider]]:bg-[#00F0FF]"
          />
        </div>

        {/* Max edges */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[#A7B0C8]">Max Co-occurrence Edges</Label>
            <span className="text-xs text-[#00F0FF]">{correlationConfig.maxCooccurrenceEdges}</span>
          </div>
          <Slider
            value={[correlationConfig.maxCooccurrenceEdges]}
            onValueChange={([value]) => setCorrelationConfig({ maxCooccurrenceEdges: value })}
            min={10}
            max={200}
            step={10}
            className="[&_[role=slider]]:bg-[#00F0FF]"
          />
        </div>

        {/* Node type toggles */}
        <div className="space-y-2">
          <Label className="text-xs text-[#A7B0C8]">Show Node Types</Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2F5FF]">Finding nodes</span>
              <Switch
                checked={correlationConfig.showFindingNodes}
                onCheckedChange={(checked) => setCorrelationConfig({ showFindingNodes: checked })}
                className="data-[state=checked]:bg-[#00F0FF]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2F5FF]">Document nodes</span>
              <Switch
                checked={correlationConfig.showDocumentNodes}
                onCheckedChange={(checked) => setCorrelationConfig({ showDocumentNodes: checked })}
                className="data-[state=checked]:bg-[#00F0FF]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2F5FF]">Detector context</span>
              <Switch
                checked={correlationConfig.showDetectorContext}
                onCheckedChange={(checked) => setCorrelationConfig({ showDetectorContext: checked })}
                className="data-[state=checked]:bg-[#00F0FF]"
              />
            </div>
          </div>
        </div>

        {/* Advanced options */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <Label className="text-xs text-[#A7B0C8]">Advanced Options</Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2F5FF]">Entity co-occurrence mesh</span>
              <Switch
                checked={correlationConfig.buildCooccurrenceMesh}
                onCheckedChange={(checked) => setCorrelationConfig({ buildCooccurrenceMesh: checked })}
                className="data-[state=checked]:bg-[#00FFC2]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#F2F5FF]">Temporal bridges</span>
              <Switch
                checked={correlationConfig.buildTemporalBridges}
                onCheckedChange={(checked) => setCorrelationConfig({ buildTemporalBridges: checked })}
                className="data-[state=checked]:bg-[#00FFC2]"
              />
            </div>
          </div>
        </div>

        {/* Rebuild button */}
        <Button
          onClick={handleRebuildGraph}
          className="w-full bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]/30"
        >
          <Settings2 size={14} className="mr-2" />
          Rebuild Graph
        </Button>

        {/* Best pairs hint */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-[#A7B0C8] mb-2">Best complementary pairs:</p>
          <div className="space-y-1 text-xs">
            <div className="text-[#00FFC2]">• related.user + related.hosts</div>
            <div className="text-[#7B8CFF]">• related.ip + temporal bridges</div>
            <div className="text-[#FFD166]">• document nodes + temporal bridges</div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default CorrelationPanel;
