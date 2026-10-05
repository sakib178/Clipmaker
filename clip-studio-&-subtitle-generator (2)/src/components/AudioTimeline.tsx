import React, { useRef, useEffect, useMemo } from 'react';
import { SubtitleCue } from '../types';
import { formatTime } from '../utils/time';
import { globalAudioEngine } from '../utils/audioEngine';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Repeat,
  Scissors,
  Clock,
} from 'lucide-react';

interface AudioTimelineProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  subtitles: SubtitleCue[];
  onSelectCue?: (cue: SubtitleCue) => void;
  activeCueId?: string;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  subtitles,
  onSelectCue,
  activeCueId,
  trimStart,
  trimEnd,
  onTrimChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  isLooping,
  onToggleLoop,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragModeRef = useRef<'playhead' | 'trim-start' | 'trim-end' | null>(null);

  const effectiveDuration = Math.max(0.05, duration || 30);
  const minTrim = Math.min(0.1, effectiveDuration);
  const clampedTrimStart = Math.max(0, Math.min(effectiveDuration - minTrim, trimStart));
  const clampedTrimEnd = Math.max(clampedTrimStart + minTrim, Math.min(effectiveDuration, trimEnd));
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  const waveformPeaks = useMemo(
    () => globalAudioEngine.getWaveformPeaks(90),
    [duration, subtitles.length, globalAudioEngine.getBufferRevision()]
  );

  const getTimeFromClientX = (clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    return Math.max(0, Math.min(effectiveDuration, (clickX / rect.width) * effectiveDuration));
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    dragModeRef.current = 'playhead';
    onSeek(getTimeFromClientX(e.clientX));
  };

  const handleTimelineTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      dragModeRef.current = 'playhead';
      onSeek(getTimeFromClientX(e.touches[0].clientX));
    }
  };

  useEffect(() => {
    const updateFromClientX = (clientX: number) => {
      if (!dragModeRef.current || !timelineRef.current) return;
      const targetTime = getTimeFromClientX(clientX);

      if (dragModeRef.current === 'playhead') {
        onSeek(targetTime);
      } else if (dragModeRef.current === 'trim-start') {
        const nextStart = Math.max(0, Math.min(clampedTrimEnd - minTrim, Number(targetTime.toFixed(1))));
        onTrimChange(nextStart, clampedTrimEnd);
      } else if (dragModeRef.current === 'trim-end') {
        const nextEnd = Math.min(
          effectiveDuration,
          Math.max(clampedTrimStart + minTrim, Number(targetTime.toFixed(1)))
        );
        onTrimChange(clampedTrimStart, nextEnd);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateFromClientX(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragModeRef.current) return;
      if (e.touches.length > 0) {
        updateFromClientX(e.touches[0].clientX);
      }
    };

    const handleEnd = () => {
      dragModeRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [effectiveDuration, clampedTrimStart, clampedTrimEnd, onSeek, onTrimChange]);

  const jump = (delta: number) => {
    const nextTime = Math.max(0, Math.min(effectiveDuration, currentTime + delta));
    onSeek(nextTime);
  };

  const trimStartPercent = (clampedTrimStart / effectiveDuration) * 100;
  const trimWidthPercent = Math.max(1, ((clampedTrimEnd - clampedTrimStart) / effectiveDuration) * 100);

  return (
    <div className="w-full p-4 border rounded-2xl bg-zinc-900/90 border-zinc-800 shadow-xl backdrop-blur-md">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 mb-3 border-b border-zinc-800/80">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeek(clampedTrimStart)}
            className="p-2 transition-colors rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="Reset to clip start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => jump(-5)}
            className="p-2 transition-colors rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="Jump back 5s"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Primary Play/Pause Button */}
          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-10 h-10 text-white transition-transform rounded-full shadow-lg bg-indigo-600 hover:bg-indigo-500 hover:scale-105 active:scale-95 shadow-indigo-600/30 cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={() => jump(5)}
            className="p-2 transition-colors rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="Jump forward 5s"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleLoop}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isLooping
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
            title="Loop playback"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Time Stamp Display (Formatted with HH:MM:SS support for long 60min clips) */}
        <div className="flex items-center gap-2 px-3 py-1 font-mono text-xs font-semibold rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>{formatTime(currentTime, effectiveDuration > 3600)}</span>
          <span className="text-zinc-500">/</span>
          <span className="text-zinc-400">
            {formatTime(effectiveDuration, effectiveDuration > 3600)}
          </span>
        </div>

        {/* Trimming & Speed controls */}
        <div className="flex items-center gap-3">
          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-zinc-500">Speed:</span>
            <select
              value={playbackSpeed}
              onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
              className="px-2 py-1 text-xs font-medium text-white transition-colors border rounded-md cursor-pointer bg-zinc-800 border-zinc-700 hover:border-zinc-600 focus:outline-none"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x (Normal)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>

          {/* Trim indicators */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Scissors className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px]">
              Trim: {formatTime(clampedTrimStart)} - {formatTime(clampedTrimEnd)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Multi-Track Scrubber Timeline */}
      <div className="relative flex flex-col gap-1.5 select-none">
        {/* Subtitle Cue Track Markers */}
        <div className="relative h-6 rounded-md bg-zinc-950/80 border border-zinc-800/60 overflow-hidden">
          {subtitles.map((cue) => {
            const leftPercent = Math.max(0, Math.min(99, (cue.start / effectiveDuration) * 100));
            const widthPercent = Math.max(
              1,
              Math.min(100 - leftPercent, ((cue.end - cue.start) / effectiveDuration) * 100)
            );
            const isActive =
              activeCueId === cue.id || (currentTime >= cue.start && currentTime <= cue.end);

            return (
              <div
                key={cue.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(cue.start);
                  if (onSelectCue) onSelectCue(cue);
                }}
                className={`absolute top-0.5 bottom-0.5 rounded px-1.5 text-[10px] font-medium truncate cursor-pointer transition-all flex items-center ${
                  isActive
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30 z-10 font-bold'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60'
                }`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={`${formatTime(cue.start)} - ${formatTime(cue.end)}: ${cue.text}`}
              >
                {cue.text}
              </div>
            );
          })}
        </div>

        {/* Audio Waveform Scrubber Track */}
        <div
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
          onTouchStart={handleTimelineTouchStart}
          className="relative h-11 rounded-lg cursor-pointer bg-zinc-950/90 border border-zinc-800 overflow-hidden group touch-none"
        >
          {/* Real / Dynamic Waveform Visuals */}
          <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none opacity-45 group-hover:opacity-65 transition-opacity">
            {waveformPeaks.map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-zinc-400"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          {/* Trim Region Highlight */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none bg-emerald-500/10 border-x-2 border-emerald-500/70"
            style={{
              left: `${trimStartPercent}%`,
              width: `${trimWidthPercent}%`,
            }}
          />

          {/* Draggable Trim Start Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              dragModeRef.current = 'trim-start';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              dragModeRef.current = 'trim-start';
            }}
            className="absolute top-0 bottom-0 w-5 -ml-2.5 cursor-ew-resize z-30 flex items-center justify-center group/trim"
            style={{ left: `${trimStartPercent}%` }}
            title="Drag to adjust Trim Start"
          >
            <div className="w-1.5 h-6 rounded-full bg-emerald-400 shadow group-hover/trim:scale-125 transition-transform" />
          </div>

          {/* Draggable Trim End Handle */}
          <div
            onMouseDown={(e) => {
              e.stopPropagation();
              dragModeRef.current = 'trim-end';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              dragModeRef.current = 'trim-end';
            }}
            className="absolute top-0 bottom-0 w-5 -ml-2.5 cursor-ew-resize z-30 flex items-center justify-center group/trim"
            style={{ left: `${trimStartPercent + trimWidthPercent}%` }}
            title="Drag to adjust Trim End"
          >
            <div className="w-1.5 h-6 rounded-full bg-emerald-400 shadow group-hover/trim:scale-125 transition-transform" />
          </div>

          {/* Played Elapsed Track Fill */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-indigo-500/25 pointer-events-none border-r border-indigo-400"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Scrub Playhead Line and Knob */}
          <div
            className="absolute top-0 bottom-0 -ml-[1px] w-[2px] bg-indigo-400 pointer-events-none z-20"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 border-indigo-600 scale-90 group-hover:scale-110 transition-transform" />
          </div>
        </div>

        {/* Time Labels ruler below */}
        <div className="flex justify-between px-1 text-[10px] font-mono text-zinc-500">
          <span>00:00</span>
          <span>{formatTime(effectiveDuration * 0.25)}</span>
          <span>{formatTime(effectiveDuration * 0.5)}</span>
          <span>{formatTime(effectiveDuration * 0.75)}</span>
          <span>{formatTime(effectiveDuration)}</span>
        </div>
      </div>
    </div>
  );
};
