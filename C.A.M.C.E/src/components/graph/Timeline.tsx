import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Zap } from 'lucide-react';
import { useStore } from '@/store';
import { format } from 'date-fns';

export const Timeline = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const {
    findings,
    timeline,
    setTimelineWindow,
    setPlaying,
    setPlaybackSpeed,
    advanceTimeline
  } = useStore();

  // Compute histogram data
  const histogramData = useMemo(() => {
    if (findings.length === 0) return [];

    const minTime = Math.min(...findings.map(f => f.timestamp));
    const maxTime = Math.max(...findings.map(f => f.timestamp));
    const duration = maxTime - minTime;
    const bucketCount = Math.min(50, Math.max(20, Math.floor(duration / (5 * 60 * 1000))));
    const bucketSize = duration / bucketCount;

    const buckets: { time: number; count: number; severity: Record<string, number> }[] = [];
    
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        time: minTime + i * bucketSize,
        count: 0,
        severity: { critical: 0, high: 0, medium: 0, low: 0 }
      });
    }

    findings.forEach((finding) => {
      const bucketIndex = Math.min(
        Math.floor((finding.timestamp - minTime) / bucketSize),
        bucketCount - 1
      );
      
      if (buckets[bucketIndex]) {
        buckets[bucketIndex].count++;
        
        // Track severity
        const severity = finding.queries[0]?.tags?.find(t => 
          ['critical', 'high', 'medium', 'low'].includes(t)
        ) || 'low';
        buckets[bucketIndex].severity[severity]++;
      }
    });

    return buckets;
  }, [findings]);

  // Initialize timeline on data load
  useEffect(() => {
    if (findings.length > 0 && timeline.startTime === 0) {
      const minTime = Math.min(...findings.map(f => f.timestamp));
      const maxTime = Math.max(...findings.map(f => f.timestamp));
      const windowSize = Math.min(60 * 60 * 1000, maxTime - minTime); // 1 hour or full range
      
      useStore.getState().setTimeline({
        startTime: minTime,
        endTime: maxTime,
        currentWindowStart: minTime,
        currentWindowEnd: minTime + windowSize
      });
    }
  }, [findings, timeline.startTime]);

  // Playback animation
  useEffect(() => {
    if (timeline.isPlaying) {
      const animate = () => {
        advanceTimeline();
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [timeline.isPlaying, timeline.playbackSpeed, advanceTimeline]);

  // Draw histogram
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || histogramData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / histogramData.length;
    const maxCount = Math.max(...histogramData.map(b => b.count), 1);

    ctx.clearRect(0, 0, width, height);

    // Draw bars
    histogramData.forEach((bucket, i) => {
      const x = i * barWidth;
      const barHeight = (bucket.count / maxCount) * height * 0.8;
      
      // Gradient based on severity mix
      const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
      
      if (bucket.severity.critical > 0) {
        gradient.addColorStop(0, '#FF4D6D');
      } else if (bucket.severity.high > 0) {
        gradient.addColorStop(0, '#FFD166');
      } else if (bucket.severity.medium > 0) {
        gradient.addColorStop(0, '#7B8CFF');
      } else {
        gradient.addColorStop(0, '#00FFC2');
      }
      
      gradient.addColorStop(1, 'rgba(0, 240, 255, 0.2)');

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);
    });

    // Draw time window indicator
    if (timeline.startTime && timeline.endTime) {
      const timeRange = timeline.endTime - timeline.startTime;
      const windowStartX = ((timeline.currentWindowStart - timeline.startTime) / timeRange) * width;
      const windowEndX = ((timeline.currentWindowEnd - timeline.startTime) / timeRange) * width;
      const windowWidth = windowEndX - windowStartX;

      // Window background
      ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
      ctx.fillRect(windowStartX, 0, windowWidth, height);

      // Window borders
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(windowStartX, 0);
      ctx.lineTo(windowStartX, height);
      ctx.moveTo(windowEndX, 0);
      ctx.lineTo(windowEndX, height);
      ctx.stroke();

      // Handles
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(windowStartX - 3, height / 2 - 8, 6, 16);
      ctx.fillRect(windowEndX - 3, height / 2 - 8, 6, 16);
    }
  }, [histogramData, timeline]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !timeline.startTime || !timeline.endTime) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    const timeRange = timeline.endTime - timeline.startTime;
    const clickTime = timeline.startTime + (x / width) * timeRange;
    
    const windowSize = timeline.currentWindowEnd - timeline.currentWindowStart;
    let newStart = clickTime - windowSize / 2;
    let newEnd = clickTime + windowSize / 2;
    
    // Clamp to bounds
    if (newStart < timeline.startTime) {
      newStart = timeline.startTime;
      newEnd = newStart + windowSize;
    }
    if (newEnd > timeline.endTime) {
      newEnd = timeline.endTime;
      newStart = newEnd - windowSize;
    }
    
    setTimelineWindow(newStart, newEnd);
  }, [timeline, setTimelineWindow]);

  const handleReset = () => {
    if (findings.length === 0) return;
    
    const minTime = Math.min(...findings.map(f => f.timestamp));
    const maxTime = Math.max(...findings.map(f => f.timestamp));
    const windowSize = Math.min(60 * 60 * 1000, maxTime - minTime);
    
    setTimelineWindow(minTime, minTime + windowSize);
    setPlaying(false);
  };

  const handleStep = (direction: 'back' | 'forward') => {
    const windowSize = timeline.currentWindowEnd - timeline.currentWindowStart;
    const stepSize = windowSize * 0.5;
    
    let newStart = timeline.currentWindowStart + (direction === 'forward' ? stepSize : -stepSize);
    let newEnd = newStart + windowSize;
    
    // Clamp to bounds
    if (newStart < timeline.startTime) {
      newStart = timeline.startTime;
      newEnd = newStart + windowSize;
    }
    if (newEnd > timeline.endTime) {
      newEnd = timeline.endTime;
      newStart = newEnd - windowSize;
    }
    
    setTimelineWindow(newStart, newEnd);
  };

  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), 'HH:mm');
  };

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), 'MMM dd, yyyy');
  };

  return (
    <div className="bg-[#0E111A]/90 backdrop-blur-md border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        {/* Time display */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-[#A7B0C8]">
            <div>{formatDate(timeline.currentWindowStart)}</div>
            <div className="text-[#F2F5FF] font-mono text-sm">
              {formatTime(timeline.currentWindowStart)} → {formatTime(timeline.currentWindowEnd)}
            </div>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#A7B0C8] hover:text-[#F2F5FF] transition-colors"
            title="Reset"
          >
            <RotateCcw size={16} />
          </button>
          
          <button
            onClick={() => handleStep('back')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#A7B0C8] hover:text-[#F2F5FF] transition-colors"
            title="Step back"
          >
            <SkipBack size={16} />
          </button>
          
          <button
            onClick={() => setPlaying(!timeline.isPlaying)}
            className="p-2 rounded-lg bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] transition-colors"
            title={timeline.isPlaying ? 'Pause' : 'Play'}
          >
            {timeline.isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          
          <button
            onClick={() => handleStep('forward')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#A7B0C8] hover:text-[#F2F5FF] transition-colors"
            title="Step forward"
          >
            <SkipForward size={16} />
          </button>

          {/* Speed control */}
          <div className="flex items-center gap-1 ml-2">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  timeline.playbackSpeed === speed
                    ? 'bg-[#00F0FF]/30 text-[#00F0FF]'
                    : 'bg-white/5 text-[#A7B0C8] hover:bg-white/10'
                }`}
              >
                {speed}×
              </button>
            ))}
          </div>

          {/* Live button */}
          <button
            onClick={() => {
              if (timeline.endTime) {
                const windowSize = timeline.currentWindowEnd - timeline.currentWindowStart;
                setTimelineWindow(timeline.endTime - windowSize, timeline.endTime);
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#A7B0C8] hover:text-[#F2F5FF] transition-colors ml-2"
          >
            <Zap size={14} />
            <span className="text-xs">Live</span>
          </button>
        </div>
      </div>

      {/* Histogram canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-16 cursor-pointer rounded-lg"
        style={{ background: 'rgba(0,0,0,0.3)' }}
      />
    </div>
  );
};

export default Timeline;
