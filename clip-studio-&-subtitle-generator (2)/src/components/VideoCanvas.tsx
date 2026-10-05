import React, { useRef, useEffect, useState } from 'react';
import { BackgroundConfig, ClipTitleConfig, SubtitleCue, SubtitleStyle } from '../types';
import { isArabicText } from '../utils/time';
import { globalAudioEngine } from '../utils/audioEngine';
import { Volume2, VolumeX, Move, Maximize2, Heading } from 'lucide-react';

interface VideoCanvasProps {
  currentTime: number;
  isPlaying: boolean;
  background: BackgroundConfig;
  subtitles: SubtitleCue[];
  style: SubtitleStyle;
  selectedCueId?: string;
  onSubtitlePositionChange?: (x: number, y: number) => void;
  onSubtitleWidthChange?: (widthPercent: number) => void;
  clipTitle?: ClipTitleConfig;
  onClipTitleChange?: (updated: Partial<ClipTitleConfig>) => void;
  watermarkText?: string;
  isMuted: boolean;
  onToggleMute: () => void;
}

type DragMode =
  | null
  | 'subtitles-move'
  | 'subtitles-resize-left'
  | 'subtitles-resize-right'
  | 'title-move'
  | 'title-resize-left'
  | 'title-resize-right';

export const VideoCanvas: React.FC<VideoCanvasProps> = ({
  currentTime,
  isPlaying,
  background,
  subtitles,
  style,
  selectedCueId,
  onSubtitlePositionChange,
  onSubtitleWidthChange,
  clipTitle,
  onClipTitleChange,
  watermarkText,
  isMuted,
  onToggleMute,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mirrorVideoRef = useRef<HTMLVideoElement>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [videoError, setVideoError] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<'subtitles' | 'title' | null>(null);
  const [isEditingTitleText, setIsEditingTitleText] = useState(false);

  // Reset video error on src change
  useEffect(() => {
    setVideoError(false);
  }, [background.src, background.type]);

  // Sync background video time with audio currentTime
  useEffect(() => {
    if (
      videoRef.current &&
      (background.type === 'video' || background.type === 'preset-video')
    ) {
      const v = videoRef.current;
      const duration = v.duration || 1;
      const targetTime = duration > 0 ? currentTime % duration : 0;

      if (Math.abs(v.currentTime - targetTime) > 0.35) {
        try {
          v.currentTime = targetTime;
        } catch (e) {}
      }

      if (isPlaying && v.paused) {
        v.play().catch(() => {});
      } else if (!isPlaying && !v.paused) {
        v.pause();
      }
    }

    if (
      mirrorVideoRef.current &&
      background.fit === 'blur-mirror' &&
      (background.type === 'video' || background.type === 'preset-video')
    ) {
      const mv = mirrorVideoRef.current;
      const duration = mv.duration || 1;
      const targetTime = duration > 0 ? currentTime % duration : 0;
      if (Math.abs(mv.currentTime - targetTime) > 0.35) {
        try {
          mv.currentTime = targetTime;
        } catch (e) {}
      }
      if (isPlaying && mv.paused) {
        mv.play().catch(() => {});
      } else if (!isPlaying && !mv.paused) {
        mv.pause();
      }
    }
  }, [currentTime, isPlaying, background.type, background.fit]);

  // Visualizer Animation Loop (supports 'bars', 'wave', and 'circle')
  useEffect(() => {
    if (!background.showVisualizer || background.visualizerStyle === 'off') return;

    let animId: number;
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const freqData = globalAudioEngine.getFrequencyData();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (freqData && freqData.length > 0) {
        const color = background.visualizerColor || '#FACC15';
        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        if (background.visualizerStyle === 'wave') {
          ctx.lineWidth = 3;
          ctx.beginPath();
          const sliceWidth = canvas.width / 32;
          let x = 0;
          for (let i = 0; i <= 32; i++) {
            const rawVal = freqData[i % freqData.length] || 0;
            const amplitude = (rawVal / 255) * (canvas.height * 0.42);
            const y =
              canvas.height / 2 +
              Math.sin(i * 0.5 + performance.now() / 180) * amplitude;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.stroke();
        } else if (background.visualizerStyle === 'circle') {
          const cx = canvas.width / 2;
          const cy = canvas.height / 2;
          const baseRadius = Math.min(cx, cy) * 0.45;
          const rays = 28;
          ctx.lineWidth = 3;
          for (let i = 0; i < rays; i++) {
            const angle = (i / rays) * Math.PI * 2;
            const val = (freqData[i % freqData.length] || 0) / 255;
            const r1 = baseRadius;
            const r2 = baseRadius + val * (Math.min(cx, cy) * 0.5) + 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
            ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
            ctx.stroke();
          }
        } else {
          // Default 'bars'
          const barCount = 32;
          const barWidth = canvas.width / barCount - 2;
          for (let i = 0; i < barCount; i++) {
            const rawVal = freqData[i % freqData.length] || 0;
            const h = Math.max(3, (rawVal / 255) * canvas.height * 0.85);
            const x = i * (barWidth + 2);
            const y = canvas.height - h;

            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, h, [3, 3, 0, 0]);
            ctx.fill();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [background.showVisualizer, background.visualizerStyle, background.visualizerColor]);

  // Active Subtitle Resolution
  const activeCue =
    subtitles.find((c) => currentTime >= c.start && currentTime <= c.end + 0.05) ||
    (!isPlaying && selectedCueId ? subtitles.find((c) => c.id === selectedCueId) : null);

  // Aspect ratio classes (mobile-friendly heights so scrolling & viewing work cleanly on phones)
  const getAspectRatioClasses = () => {
    switch (background.aspectRatio) {
      case '16:9':
        return 'aspect-[16/9] w-full max-h-[48vh] sm:max-h-[65vh] lg:max-h-[70vh] min-h-[200px] sm:min-h-[280px]';
      case '1:1':
        return 'aspect-square h-[300px] sm:h-[400px] lg:h-[440px] max-h-[54vh] sm:max-h-[65vh] lg:max-h-[70vh] w-auto max-w-full';
      case '4:5':
        return 'aspect-[4/5] h-[340px] sm:h-[440px] lg:h-[500px] max-h-[56vh] sm:max-h-[68vh] lg:max-h-[70vh] w-auto max-w-full';
      default:
        return 'aspect-[9/16] h-[360px] sm:h-[460px] lg:h-[520px] max-h-[56vh] sm:max-h-[68vh] lg:max-h-[70vh] w-auto max-w-full';
    }
  };

  // Mouse / Touch handlers for dragging and horizontal stretching
  const handleStartInteraction = (
    e: React.MouseEvent | React.TouchEvent,
    mode: DragMode
  ) => {
    e.stopPropagation();
    setDragMode(mode);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragMode || !containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current.getBoundingClientRect();
    const xPercent = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.max(5, Math.min(95, ((clientY - rect.top) / rect.height) * 100));

    if (dragMode === 'subtitles-move' && onSubtitlePositionChange) {
      onSubtitlePositionChange(Math.round(xPercent), Math.round(yPercent));
    } else if (
      (dragMode === 'subtitles-resize-left' || dragMode === 'subtitles-resize-right') &&
      onSubtitleWidthChange
    ) {
      const centerX = style.positionX;
      const halfWidth = Math.abs(xPercent - centerX);
      const newBoxWidth = Math.round(Math.min(100, Math.max(20, halfWidth * 2)));
      onSubtitleWidthChange(newBoxWidth);
    } else if (dragMode === 'title-move' && onClipTitleChange) {
      onClipTitleChange({
        positionX: Math.round(xPercent),
        positionY: Math.round(yPercent),
      });
    } else if (
      (dragMode === 'title-resize-left' || dragMode === 'title-resize-right') &&
      onClipTitleChange &&
      clipTitle
    ) {
      const centerX = clipTitle.positionX;
      const halfWidth = Math.abs(xPercent - centerX);
      const newBoxWidth = Math.round(Math.min(100, Math.max(20, halfWidth * 2)));
      onClipTitleChange({ boxWidth: newBoxWidth });
    }
  };

  const handleStopInteraction = () => {
    setDragMode(null);
  };

  // Text direction detection
  const isSubtitleRtl =
    style.direction === 'rtl' ||
    (style.direction === 'auto' && activeCue && isArabicText(activeCue.text));

  const isTitleRtl =
    clipTitle &&
    (clipTitle.direction === 'rtl' ||
      (clipTitle.direction === 'auto' && isArabicText(clipTitle.text)));

  const subtitleBoxWidth = style.boxWidth || 85;
  const titleBoxWidth = clipTitle?.boxWidth || 80;
  const isYoutubeBg = background.type === 'youtube-video';
  const hasActiveBackground =
    background.type !== 'none' && (Boolean(background.src?.trim()) || isYoutubeBg);

  return (
    <div
      className="relative flex items-center justify-center w-full h-full p-2 sm:p-4 overflow-hidden select-none bg-zinc-950/80 rounded-2xl touch-pan-y"
      onMouseMove={handlePointerMove}
      onTouchMove={dragMode ? handlePointerMove : undefined}
      onMouseUp={handleStopInteraction}
      onTouchEnd={handleStopInteraction}
      onMouseLeave={handleStopInteraction}
    >
      {/* Video Container Box with Aspect Ratio */}
      <div
        id="preview-canvas-container"
        ref={containerRef}
        className={`relative overflow-hidden rounded-xl shadow-2xl border border-zinc-800/80 transition-all duration-300 bg-zinc-950 ${getAspectRatioClasses()}`}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Mirror Blur Layer */}
        {hasActiveBackground && background.fit === 'blur-mirror' && !isYoutubeBg && background.type !== 'gradient' && (
          <div className="absolute inset-0 overflow-hidden scale-110 blur-xl opacity-60 pointer-events-none">
            {background.type === 'video' || background.type === 'preset-video' ? (
              <video
                ref={mirrorVideoRef}
                src={background.src}
                muted
                playsInline
                loop
                className="object-cover w-full h-full"
              />
            ) : (
              <img
                src={background.src}
                alt="Background mirror"
                className="object-cover w-full h-full"
              />
            )}
          </div>
        )}

        {/* Persistent YouTube Player Host (Visible when YouTube Video BG is active, invisible otherwise so audio never drops) */}
        <div
          id="yt-audio-bridge-host"
          className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
          style={{
            opacity: isYoutubeBg ? 1 : 0.001,
            zIndex: isYoutubeBg ? 5 : -10,
            transform: isYoutubeBg
              ? `scale(${
                  background.fit === 'cover' && background.aspectRatio === '9:16'
                    ? background.scale * 1.75
                    : background.scale
                }) translate(${background.offsetX}px, ${background.offsetY}px)`
              : 'none',
            filter: isYoutubeBg
              ? `blur(${background.blur}px) brightness(${background.brightness}%) contrast(${background.contrast}%)`
              : 'none',
          }}
        >
          <div id="yt-audio-bridge-player" className="w-full h-full pointer-events-none" />
        </div>

        {/* Primary Background Layer (Only rendered when user selects a background) */}
        {hasActiveBackground && !isYoutubeBg && (
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{
              transform: `scale(${background.scale}) translate(${background.offsetX}px, ${background.offsetY}px)`,
              filter: `blur(${background.blur}px) brightness(${background.brightness}%) contrast(${background.contrast}%)`,
            }}
          >
            {background.type === 'video' || background.type === 'preset-video' ? (
              !videoError ? (
                <video
                  ref={videoRef}
                  src={background.src}
                  muted
                  playsInline
                  loop
                  onError={() => setVideoError(true)}
                  className={`w-full h-full ${
                    background.fit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
              ) : (
                <div className="w-full h-full bg-zinc-950" />
              )
            ) : background.type === 'image' ? (
              <img
                src={background.src}
                alt={background.name}
                className={`w-full h-full ${
                  background.fit === 'contain' ? 'object-contain' : 'object-cover'
                }`}
              />
            ) : background.type === 'gradient' && background.src ? (
              <div
                className="w-full h-full"
                style={{
                  background: background.src,
                }}
              />
            ) : null}
          </div>
        )}

        {/* Darkening Overlay */}
        {background.darkenOverlay > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{ backgroundColor: `rgba(0, 0, 0, ${background.darkenOverlay})` }}
          />
        )}

        {/* Audio Visualizer Layer */}
        {background.showVisualizer && background.visualizerStyle !== 'off' && (
          <div className="absolute inset-x-4 bottom-20 h-20 pointer-events-none flex items-center justify-center opacity-80 z-15">
            <canvas
              ref={visualizerCanvasRef}
              width={360}
              height={80}
              className="w-full h-full"
            />
          </div>
        )}

        {/* Watermark Overlay */}
        {watermarkText && (
          <div className="absolute top-4 right-4 z-20 px-2.5 py-1 text-xs font-semibold tracking-wider text-white/90 bg-black/50 backdrop-blur-md rounded-md border border-white/10 uppercase">
            {watermarkText}
          </div>
        )}

        {/* Quick Canvas Controls Top-Left */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <span className="px-2 py-1 text-[11px] font-mono font-medium rounded-md bg-black/60 text-white/70 border border-white/10 backdrop-blur-md">
            {background.aspectRatio}
          </span>
        </div>

        {/* ==================== PERSISTENT CLIP TITLE ==================== */}
        {clipTitle && clipTitle.enabled && clipTitle.text && (
          <div
            id="draggable-clip-title"
            onMouseEnter={() => setHoveredElement('title')}
            onMouseLeave={() => setHoveredElement(null)}
            style={{
              position: 'absolute',
              top: `${clipTitle.positionY}%`,
              left: `${clipTitle.positionX}%`,
              transform: 'translate(-50%, -50%)',
              width: `${titleBoxWidth}%`,
              cursor: dragMode === 'title-move' ? 'grabbing' : 'grab',
              zIndex: 35,
              textAlign: 'center',
            }}
            className={`group transition-[box-shadow,border] ${
              hoveredElement === 'title' || dragMode?.startsWith('title')
                ? 'ring-1 ring-indigo-400/80 rounded-xl'
                : ''
            }`}
          >
            {/* Title Active Header & Width Spread Tooltip */}
            {(hoveredElement === 'title' || dragMode?.startsWith('title')) && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-indigo-950/90 text-indigo-200 border border-indigo-500/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 pointer-events-none whitespace-nowrap shadow-lg">
                <Heading className="w-3 h-3 text-indigo-400" />
                <span>Title ({titleBoxWidth}%) &bull; Drag sides to stretch spread</span>
              </div>
            )}

            {/* Left Stretch / Resize Handle */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'title-resize-left')}
              onTouchStart={(e) => handleStartInteraction(e, 'title-resize-left')}
              className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-8 cursor-ew-resize flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag horizontally to stretch title spread"
            >
              <div className="w-1.5 h-6 rounded-full bg-indigo-400 shadow-md border border-white/40" />
            </div>

            {/* Right Stretch / Resize Handle */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'title-resize-right')}
              onTouchStart={(e) => handleStartInteraction(e, 'title-resize-right')}
              className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-8 cursor-ew-resize flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag horizontally to stretch title spread"
            >
              <div className="w-1.5 h-6 rounded-full bg-indigo-400 shadow-md border border-white/40" />
            </div>

            {/* Title Body & Content Container */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'title-move')}
              onTouchStart={(e) => handleStartInteraction(e, 'title-move')}
              dir={isTitleRtl ? 'rtl' : 'ltr'}
              style={{
                fontFamily: clipTitle.fontFamily,
                fontSize: `${clipTitle.fontSize}px`,
                color: clipTitle.textColor,
                textTransform:
                  clipTitle.textCase === 'uppercase'
                    ? 'uppercase'
                    : clipTitle.textCase === 'capitalize'
                    ? 'capitalize'
                    : 'none',
                letterSpacing: `${clipTitle.letterSpacing}px`,
                WebkitTextStroke:
                  clipTitle.strokeWidth > 0
                    ? `${clipTitle.strokeWidth}px ${clipTitle.strokeColor}`
                    : undefined,
                paintOrder: 'stroke fill',
                textShadow: clipTitle.shadow
                  ? `0px 3px 12px ${clipTitle.shadowColor || 'rgba(0,0,0,0.85)'}, 0px 1px 3px rgba(0,0,0,0.8)`
                  : 'none',
                backgroundColor: clipTitle.boxBackground
                  ? `${clipTitle.boxColor}${Math.round(clipTitle.boxOpacity * 255)
                      .toString(16)
                      .padStart(2, '0')}`
                  : 'transparent',
                padding: clipTitle.boxBackground ? '6px 16px' : '0px',
                borderRadius: clipTitle.boxBackground ? '14px' : '0px',
                lineHeight: 1.25,
                wordBreak: 'break-word',
              }}
              className="w-full font-black tracking-tight select-none"
            >
              {isEditingTitleText ? (
                <input
                  type="text"
                  autoFocus
                  value={clipTitle.text}
                  onChange={(e) => onClipTitleChange?.({ text: e.target.value })}
                  onBlur={() => setIsEditingTitleText(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingTitleText(false);
                  }}
                  className="bg-black/60 text-white text-center w-full px-2 py-0.5 rounded border border-indigo-400 outline-none"
                />
              ) : (
                <span
                  onDoubleClick={() => setIsEditingTitleText(true)}
                  className="inline-block cursor-text"
                >
                  {clipTitle.text}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ==================== SUBTITLES OVERLAY ==================== */}
        {style.showSubtitles !== false && activeCue && (
          <div
            id="draggable-subtitle-cue"
            onMouseEnter={() => setHoveredElement('subtitles')}
            onMouseLeave={() => setHoveredElement(null)}
            style={{
              position: 'absolute',
              top: `${style.positionY}%`,
              left: `${style.positionX}%`,
              transform: 'translate(-50%, -50%)',
              width: `${subtitleBoxWidth}%`,
              cursor: dragMode === 'subtitles-move' ? 'grabbing' : 'grab',
              zIndex: 30,
              textAlign: 'center',
            }}
            className={`group transition-[box-shadow,border] ${
              hoveredElement === 'subtitles' || dragMode?.startsWith('subtitles')
                ? 'ring-1 ring-amber-400/80 rounded-xl'
                : ''
            }`}
          >
            {/* Subtitle Bounding Box Tooltip with Width */}
            {(hoveredElement === 'subtitles' || dragMode?.startsWith('subtitles')) && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/90 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 pointer-events-none whitespace-nowrap shadow-lg">
                <Move className="w-3 h-3 text-amber-400" />
                <span>Subtitles ({subtitleBoxWidth}%) &bull; Drag sides to spread</span>
              </div>
            )}

            {/* Left Stretch / Resize Handle */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'subtitles-resize-left')}
              onTouchStart={(e) => handleStartInteraction(e, 'subtitles-resize-left')}
              className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-8 cursor-ew-resize flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag horizontally to stretch subtitle width and spread text"
            >
              <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-md border border-white/40" />
            </div>

            {/* Right Stretch / Resize Handle */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'subtitles-resize-right')}
              onTouchStart={(e) => handleStartInteraction(e, 'subtitles-resize-right')}
              className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-8 cursor-ew-resize flex items-center justify-center z-40 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag horizontally to stretch subtitle width and spread text"
            >
              <div className="w-1.5 h-6 rounded-full bg-amber-400 shadow-md border border-white/40" />
            </div>

            {/* Subtitle Box Container */}
            <div
              onMouseDown={(e) => handleStartInteraction(e, 'subtitles-move')}
              onTouchStart={(e) => handleStartInteraction(e, 'subtitles-move')}
              dir={isSubtitleRtl ? 'rtl' : 'ltr'}
              style={{
                fontFamily: style.fontFamily,
                fontSize: `${style.fontSize}px`,
                color: style.textColor,
                textTransform:
                  style.textCase === 'uppercase'
                    ? 'uppercase'
                    : style.textCase === 'capitalize'
                    ? 'capitalize'
                    : 'none',
                letterSpacing: `${style.letterSpacing}px`,
                WebkitTextStroke:
                  style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
                paintOrder: 'stroke fill',
                textShadow: style.shadow
                  ? `0px 4px 14px ${style.shadowColor || 'rgba(0,0,0,0.9)'}, 0px 1px 3px rgba(0,0,0,0.8)`
                  : 'none',
                backgroundColor: style.boxBackground
                  ? `${style.boxColor}${Math.round(style.boxOpacity * 255)
                      .toString(16)
                      .padStart(2, '0')}`
                  : 'transparent',
                padding: style.boxBackground ? '8px 16px' : '0px',
                borderRadius: style.boxBackground ? '12px' : '0px',
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}
              className="w-full font-extrabold tracking-tight select-none"
            >
              {/* Karaoke animated words or full cue text */}
              {activeCue.words && activeCue.words.length > 0 ? (
                <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  {activeCue.words.map((w, wIdx) => {
                    const isWordActive =
                      currentTime >= w.start - 0.05 && currentTime <= w.end + 0.08;

                    return (
                      <span
                        key={wIdx}
                        style={{
                          color: isWordActive ? style.highlightColor : style.textColor,
                          transform:
                            isWordActive && style.animation === 'karaoke-bounce'
                              ? 'scale(1.18)'
                              : 'scale(1)',
                          transition: 'all 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          display: 'inline-block',
                          textShadow: isWordActive
                            ? `0 0 16px ${style.highlightColor}, 0 2px 8px rgba(0,0,0,0.8)`
                            : undefined,
                        }}
                        className={isWordActive ? 'font-black z-10' : ''}
                      >
                        {w.word}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span>{activeCue.text}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
