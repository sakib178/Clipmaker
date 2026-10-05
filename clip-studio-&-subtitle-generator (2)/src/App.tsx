/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AudioSource,
  BackgroundConfig,
  CanvaAccountConfig,
  ClipTitleConfig,
  N8nConfig,
  SubtitleCue,
  SubtitleStyle,
} from './types';
import { PRESET_AUDIO_TRACKS } from './constants/presets';
import { globalAudioEngine } from './utils/audioEngine';
import { safeFetchJson } from './utils/api';
import { isArabicText } from './utils/time';
import { VideoCanvas } from './components/VideoCanvas';
import { AudioTimeline } from './components/AudioTimeline';
import { SubtitleEditor } from './components/SubtitleEditor';
import { StylePanel } from './components/StylePanel';
import { BackgroundPanel } from './components/BackgroundPanel';
import { AudioPanel } from './components/AudioPanel';
import { N8nPanel } from './components/N8nPanel';
import { ExportModal } from './components/ExportModal';
import {
  Film,
  Sparkles,
  Type,
  Video,
  Music,
  Download,
  Workflow,
  Palette,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  // Default audio preset
  const initialPresetAudio = PRESET_AUDIO_TRACKS[0];

  // State: Background (Starts with NO default video/bg and all extra effects at 0/off)
  const [background, setBackground] = useState<BackgroundConfig>({
    type: 'none',
    src: '',
    name: 'No Background',
    aspectRatio: '9:16',
    fit: 'cover',
    blur: 0,
    darkenOverlay: 0,
    scale: 1.0,
    offsetX: 0,
    offsetY: 0,
    brightness: 100,
    contrast: 100,
    showVisualizer: false,
    visualizerStyle: 'off',
    visualizerColor: '#FACC15',
  });

  // State: Connected Canva Account
  const [canvaAccount, setCanvaAccount] = useState<CanvaAccountConfig>({
    connected: false,
    accountName: '',
    email: '',
    workspaceName: '',
    authMethod: 'oauth',
    designs: [],
  });

  // State: Audio
  const [audioSource, setAudioSource] = useState<AudioSource>({
    type: 'preset',
    src: initialPresetAudio.audioUrl,
    name: initialPresetAudio.name,
    author: initialPresetAudio.author,
    startTime: 0,
    endTime: initialPresetAudio.duration,
    totalDuration: initialPresetAudio.duration,
    volume: 1.0,
  });

  // State: Subtitles & Cues
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>(
    initialPresetAudio.defaultSubtitles
  );
  const [selectedCueId, setSelectedCueId] = useState<string | undefined>(
    initialPresetAudio.defaultSubtitles[0]?.id
  );

  // State: Subtitle Typography & Styles (Extra options like stroke, shadow, box, animation at 0/off by default)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 34,
    textColor: '#FFFFFF',
    highlightColor: '#FACC15',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: false,
    shadowColor: 'rgba(0,0,0,0.9)',
    boxBackground: false,
    boxColor: '#000000',
    boxOpacity: 0,
    textCase: 'none',
    positionY: 78,
    positionX: 50,
    animation: 'static',
    wordsPerLine: 3,
    direction: 'auto',
    letterSpacing: 0,
    boxWidth: 85,
    showSubtitles: true,
  });

  // State: Persistent Clip Title (All extra options at 0/off by default)
  const [clipTitle, setClipTitle] = useState<ClipTitleConfig>({
    enabled: false,
    text: '',
    fontFamily: "'Alexandria', sans-serif",
    fontSize: 22,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: false,
    shadowColor: 'rgba(0,0,0,0.8)',
    boxBackground: false,
    boxColor: '#000000',
    boxOpacity: 0,
    positionY: 14,
    positionX: 50,
    boxWidth: 80,
    textCase: 'none',
    direction: 'auto',
    letterSpacing: 0,
  });

  // State: Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // State: Trimming (supporting clips up to 60 minutes)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(initialPresetAudio.duration);

  // State: Active Dashboard Tab
  const [activeTab, setActiveTab] = useState<
    'subtitles' | 'style' | 'background' | 'audio' | 'n8n'
  >('subtitles');

  // State: n8n Social Automation Config
  const [n8nConfig, setN8nConfig] = useState<N8nConfig>({
    webhookUrl: '',
    authHeaderName: '',
    authHeaderValue: '',
    caption: '',
    hashtags: '',
    scheduleMode: 'immediate',
    scheduledTime: '',
    accounts: [
      {
        id: 'tiktok',
        name: 'TikTok',
        handle: '@creator.clips',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'instagram',
        name: 'Instagram Reels',
        handle: '@creator.reels',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'youtube_shorts',
        name: 'YouTube Shorts',
        handle: '@CreatorShorts',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'x_twitter',
        name: 'X (Twitter)',
        handle: '@creator_x',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'facebook_reels',
        name: 'Facebook Reels',
        handle: '@CreatorPage',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn Video',
        handle: '@creator-network',
        connected: false,
        enabledForPost: false,
      },
    ],
  });

  // State: Modals & Overlays
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | undefined>();
  useEffect(() => { setExportId(undefined); }, [audioSource, background, subtitles, subtitleStyle, clipTitle, trimStart, trimEnd, watermarkText]);
  useEffect(() => { globalAudioEngine.setVolume(isMuted ? 0 : audioSource.volume); }, [isMuted, audioSource.volume]);
  useEffect(() => () => { if (background.src.startsWith('blob:')) URL.revokeObjectURL(background.src); }, [background.src]);
  useEffect(() => () => { if (audioSource.src.startsWith('blob:')) URL.revokeObjectURL(audioSource.src); }, [audioSource.src]);

  // Animation frame loop for continuous time sync
  const animFrameRef = useRef<number | null>(null);

  // Load initial studio ambient pad on mount (zero harsh beats)
  useEffect(() => {
    try {
      globalAudioEngine.generateSyntheticBuffer(initialPresetAudio.duration);
    } catch (e) {
      // AudioContext will initialize on first user gesture
    }
  }, []);

  // Load persisted external platform connections (Canva, Social Accounts, n8n)
  useEffect(() => {
    safeFetchJson('/api/integrations', {}, 1)
      .then(({ data }) => {
        if (data?.canva) {
          setCanvaAccount(data.canva);
        }
        if (Array.isArray(data?.socialAccounts)) {
          setN8nConfig((prev) => ({
            ...prev,
            accounts: data.socialAccounts,
            webhookUrl: data?.n8n?.webhookUrl || prev.webhookUrl,
            authHeaderName: data?.n8n?.authHeaderName || prev.authHeaderName,
            executions: data?.n8n?.executions || prev.executions,
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Global listener for Canva separate window studio & OAuth popup messages
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'CANVA_STUDIO_EXPORT' && msg.dataUrl) {
        setBackground((prev) => ({
          ...prev,
          type: 'image',
          src: msg.dataUrl,
          name: msg.title || 'Canva Studio Background',
          canvaDesignUrl: msg.canvaDesignUrl || prev.canvaDesignUrl,
        }));
      } else if (msg.type === 'CANVA_OAUTH_SUCCESS' && msg.canva) {
        setCanvaAccount(msg.canva);
      } else if (msg.type === 'CANVA_DESIGN_SAVED' && Array.isArray(msg.designs)) {
        setCanvaAccount((prev) => ({
          ...prev,
          designs: msg.designs,
        }));
      } else if (msg.type === 'SOCIAL_OAUTH_SUCCESS' && Array.isArray(msg.accounts)) {
        setN8nConfig((prev) => ({
          ...prev,
          accounts: msg.accounts,
        }));
      }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, []);

  // Launch Canva Studio in a separate window
  const handleOpenCanvaSeparateWindow = () => {
    setActiveTab('background');
    const width = 1120;
    const height = 780;
    const left = Math.max(20, Math.round((window.screen.width - width) / 2));
    const top = Math.max(20, Math.round((window.screen.height - height) / 2));
    const studioUrl = `/canva-studio-window?aspectRatio=${encodeURIComponent(
      background.aspectRatio
    )}&designUrl=${encodeURIComponent(background.canvaDesignUrl || '')}`;
    const win = window.open(
      studioUrl,
      'CanvaBackgroundEditorWindow',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (win) {
      win.focus();
    }
  };

  // Update time smoothly when playing
  useEffect(() => {
    if (isPlaying) {
      const updateLoop = () => {
        const t = globalAudioEngine.getCurrentTime();
        if (t >= trimEnd) {
          if (isLooping) {
            globalAudioEngine.seek(trimStart);
            globalAudioEngine.play(trimStart);
            setCurrentTime(trimStart);
          } else {
            setIsPlaying(false);
            globalAudioEngine.pause();
            setCurrentTime(trimEnd);
          }
        } else {
          setCurrentTime(t);
        }
        animFrameRef.current = requestAnimationFrame(updateLoop);
      };
      animFrameRef.current = requestAnimationFrame(updateLoop);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, trimEnd, trimStart, isLooping]);

  // Handle Play/Pause toggle
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      globalAudioEngine.pause();
      setIsPlaying(false);
    } else {
      let startAt = currentTime;
      if (startAt >= trimEnd - 0.15 || startAt < trimStart) {
        startAt = trimStart;
        setCurrentTime(trimStart);
      }
      globalAudioEngine.play(startAt, () => {
        if (isLooping) {
          globalAudioEngine.seek(trimStart);
          globalAudioEngine.play(trimStart);
          setCurrentTime(trimStart);
        } else {
          setIsPlaying(false);
        }
      });
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, trimEnd, trimStart, isLooping]);

  // Handle Seek
  const handleSeek = useCallback((newTime: number) => {
    setCurrentTime(newTime);
    globalAudioEngine.seek(newTime);
  }, []);

  // Handle Audio buffer loader helper
  const handleLoadAudioBuffer = async (fileOrUrl: File | string): Promise<number> => {
    setIsPlaying(false);
    globalAudioEngine.pause();
    let duration = 30;
    try {
      if (typeof fileOrUrl === 'string') {
        const res = await globalAudioEngine.loadAudioFromUrl(fileOrUrl);
        duration = res.duration;
      } else {
        const res = await globalAudioEngine.loadAudioFromFile(fileOrUrl);
        duration = res.duration;
      }
      setTrimStart(0);
      setTrimEnd(duration);
      setCurrentTime(0);
      return duration;
    } catch (e) {
      throw e;
    }
  };

  // Keyboard shortcut listener (Space = play/pause, arrows = seek)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isExportModalOpen || (e.target as HTMLElement)?.isContentEditable) return;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 2));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(trimEnd, currentTime + 2));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSeek, currentTime, trimEnd, isExportModalOpen]);

  // Helper to apply automatic font/direction when subtitles language changes
  const syncFontForSubtitles = (cues: SubtitleCue[], explicitLang?: 'en' | 'ar') => {
    const isArabic =
      explicitLang === 'ar' ||
      (!explicitLang && cues.some((c) => isArabicText(c.text)));
    if (isArabic) {
      setSubtitleStyle((prev) => ({
        ...prev,
        fontFamily: "'Cairo', sans-serif",
        direction: 'rtl',
        textCase: 'none',
      }));
    } else {
      setSubtitleStyle((prev) => ({
        ...prev,
        fontFamily: "'Montserrat', sans-serif",
        direction: 'ltr',
      }));
    }
  };

  // Trigger AI Transcription (supports YouTube videos, uploaded audio files, and presets)
  const handleTriggerTranscription = async (language: 'en' | 'ar' | 'auto' = 'auto') => {
    setIsTranscribing(true);
    setOperationError(null);
    try {
      const clipDuration = trimEnd - trimStart;
      const ytBaseStart = audioSource.ytStartOffset || 0;

      if (audioSource.type === 'youtube' && !globalAudioEngine.hasDecodedAudioBuffer() && audioSource.videoId) {
        await globalAudioEngine.ensureRealYoutubeBuffer(
          audioSource.videoId,
          ytBaseStart,
          audioSource.ytEndOffset || ytBaseStart + clipDuration,
          audioSource.youtubeUrl
        );
      }

      let audioData: string | null = null;
      if (globalAudioEngine.hasDecodedAudioBuffer()) {
        audioData = globalAudioEngine.exportWavBase64(trimStart, trimEnd);
      }

      const { ok, data } = await safeFetchJson<{ subtitles?: SubtitleCue[]; error?: string }>(
        '/api/transcribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language,
            targetDuration: clipDuration,
            audioTitle: audioSource.name,
            audioData,
            mimeType: 'audio/wav',
            videoId: audioSource.type === 'youtube' ? audioSource.videoId : undefined,
            youtubeUrl: audioSource.type === 'youtube' ? audioSource.youtubeUrl : undefined,
            startTime: audioSource.type === 'youtube' ? ytBaseStart + trimStart : trimStart,
            endTime: audioSource.type === 'youtube' ? ytBaseStart + trimEnd : trimEnd,
          }),
        },
        0
      );
      if (!ok || !Array.isArray(data?.subtitles)) throw new Error(data?.error || 'Transcription failed.');
      const aligned = data.subtitles.map(cue => ({ ...cue, start: cue.start + trimStart, end: cue.end + trimStart,
        words: cue.words?.map(word => ({ ...word, start: word.start + trimStart, end: word.end + trimStart })) }));
      setSubtitles(aligned);
      setSelectedCueId(aligned[0]?.id);
      if (aligned.length > 0) {
        syncFontForSubtitles(
          data.subtitles,
          language === 'auto' ? undefined : language
        );
      }
    } catch (e) {
      setOperationError((e as Error).message || 'Transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Trigger Subtitle Translation
  const handleTranslate = async (targetLang: 'en' | 'ar') => {
    setIsTranslating(true);
    setOperationError(null);
    try {
      const { ok, data } = await safeFetchJson<{ subtitles?: SubtitleCue[]; error?: string }>(
        '/api/translate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subtitles,
            targetLanguage: targetLang,
          }),
        },
        0
      );
      if (!ok || !Array.isArray(data?.subtitles)) throw new Error(data?.error || 'Translation failed.');
      if (data.subtitles.length > 0) {
        setSubtitles(data.subtitles);
        syncFontForSubtitles(data.subtitles, targetLang);
      }
    } catch (e) {
      setOperationError((e as Error).message || 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {operationError && <div role="alert" className="p-3 text-sm text-red-300 bg-red-950/50 border-b border-red-900 flex justify-between gap-4">{operationError}<button onClick={() => setOperationError(null)}>Dismiss</button></div>}
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-md shadow-indigo-500/20 text-white shrink-0">
            <Film className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-2 truncate">
              <span className="truncate">Clip Studio &amp; Subtitle Generator</span>
              <span className="hidden md:inline-block px-2 py-0.5 text-[10px] font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-full shrink-0">
                4K UHD &bull; 60 FPS
              </span>
            </h1>
            <p className="hidden sm:block text-[11px] text-zinc-400 truncate">
              Synchronized AI captions in English &amp; Arabic with precision video editing
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Watermark handle toggle */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 text-xs border rounded-lg bg-zinc-900 border-zinc-800">
            <span className="text-zinc-500 text-[11px]">Tag:</span>
            <input
              type="text"
              placeholder="@username"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="w-24 text-xs text-white bg-transparent focus:outline-none placeholder:text-zinc-600 font-mono"
            />
          </div>

          {/* Open Canva Studio in Separate Window Quick Action */}
          <button
            type="button"
            onClick={handleOpenCanvaSeparateWindow}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-cyan-200 bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/30 rounded-xl transition-all cursor-pointer"
            title="Open Canva Background Studio in a separate window"
          >
            <Palette className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Canva BG</span>
            {canvaAccount.connected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
            <ExternalLink className="w-3 h-3 opacity-75 hidden sm:inline" />
          </button>

          {/* n8n Social Automation Quick Button */}
          <button
            type="button"
            onClick={() => setActiveTab('n8n')}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-orange-200 bg-orange-950/60 hover:bg-orange-900/70 border border-orange-500/30 rounded-xl transition-all cursor-pointer"
            title="Connect social accounts & automate posting via n8n"
          >
            <Workflow className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span className="hidden xs:inline sm:inline">n8n Auto-Post</span>
            <span className="xs:hidden sm:hidden">n8n</span>
          </button>

          {/* Export MP4 Video Button */}
          <button
            type="button"
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
                globalAudioEngine.pause();
              }
              setIsExportModalOpen(true);
            }}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Export .MP4</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 p-3 sm:p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 max-w-[1600px] mx-auto w-full">
        {/* Left / Center Column: Video Canvas & Timeline Scrubber */}
        <div className="flex flex-col gap-3 sm:gap-4 lg:col-span-7 xl:col-span-8">
          {/* Preview Canvas Box */}
          <div className="flex-1 min-h-[300px] sm:min-h-[420px] flex items-center justify-center p-2 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-2xl relative">
            <VideoCanvas
              currentTime={currentTime}
              isPlaying={isPlaying}
              background={background}
              subtitles={subtitles}
              style={subtitleStyle}
              selectedCueId={selectedCueId}
              onSubtitlePositionChange={(x, y) =>
                setSubtitleStyle((prev) => ({ ...prev, positionX: x, positionY: y }))
              }
              onSubtitleWidthChange={(w) =>
                setSubtitleStyle((prev) => ({ ...prev, boxWidth: w }))
              }
              clipTitle={clipTitle}
              onClipTitleChange={(updated) =>
                setClipTitle((prev) => ({ ...prev, ...updated }))
              }
              watermarkText={watermarkText}
              isMuted={isMuted}
              onToggleMute={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                globalAudioEngine.setVolume(nextMuted ? 0 : audioSource.volume);
              }}
            />
          </div>

          {/* Timeline Scrubber Component */}
          <AudioTimeline
            currentTime={currentTime}
            duration={audioSource.totalDuration}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            subtitles={subtitles}
            onSelectCue={(cue) => {
              setSelectedCueId(cue.id);
              setActiveTab('subtitles');
            }}
            activeCueId={selectedCueId}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={(s, e) => {
              setTrimStart(s);
              setTrimEnd(e);
            }}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={(spd) => {
              setPlaybackSpeed(spd);
              globalAudioEngine.setPlaybackRate(spd);
            }}
            isLooping={isLooping}
            onToggleLoop={() => setIsLooping(!isLooping)}
          />
        </div>

        {/* Right Column: Dashboard Tools & Subtitle Correction */}
        <div className="flex flex-col lg:col-span-5 xl:col-span-4 h-full">
          {/* Dashboard Navigation Tabs */}
          <div className="grid grid-cols-5 p-1 mb-3 border bg-zinc-900/90 border-zinc-800 rounded-2xl shadow-sm sticky top-[57px] sm:top-[61px] lg:static z-30 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab('subtitles')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === 'subtitles'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 mb-0.5" />
              <span>Subtitles</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === 'style'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Type className="w-4 h-4 mb-0.5" />
              <span>Typography</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('background')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === 'background'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4 mb-0.5" />
              <span>BG / Canva</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === 'audio'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Music className="w-4 h-4 mb-0.5" />
              <span>Audio/YT</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('n8n')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer ${
                activeTab === 'n8n'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Workflow className="w-4 h-4 mb-0.5" />
              <span>n8n Post</span>
            </button>
          </div>

          {/* Active Tool Dashboard View */}
          <div className="flex-1 pb-8 lg:pb-0">
            {activeTab === 'subtitles' && (
              <SubtitleEditor
                subtitles={subtitles}
                onSubtitlesChange={setSubtitles}
                currentTime={currentTime}
                onSeek={handleSeek}
                selectedCueId={selectedCueId}
                onSelectCue={setSelectedCueId}
                isTranscribing={isTranscribing}
                onTriggerTranscription={handleTriggerTranscription}
                onTranslate={handleTranslate}
                isTranslating={isTranslating}
                trimStart={trimStart}
                trimEnd={trimEnd}
              />
            )}

            {activeTab === 'style' && (
              <StylePanel
                style={subtitleStyle}
                onStyleChange={setSubtitleStyle}
                clipTitle={clipTitle}
                onClipTitleChange={setClipTitle}
              />
            )}

            {activeTab === 'background' && (
              <BackgroundPanel
                background={background}
                onBackgroundChange={setBackground}
                canvaAccount={canvaAccount}
                onCanvaAccountChange={setCanvaAccount}
              />
            )}

            {activeTab === 'audio' && (
              <AudioPanel
                audioSource={audioSource}
                subtitles={subtitles}
                onAudioSourceChange={(newSource, newCues) => {
                  setIsPlaying(false);
                  setAudioSource(newSource);
                  setTrimStart(0);
                  setTrimEnd(newSource.totalDuration);
                  setCurrentTime(0);
                  globalAudioEngine.setVolume(isMuted ? 0 : newSource.volume);
                  if (newCues && newCues.length > 0) {
                    setSubtitles(newCues);
                    setSelectedCueId(newCues[0]?.id);
                    syncFontForSubtitles(newCues);
                  }
                }}
                onLoadAudioBuffer={handleLoadAudioBuffer}
                onVolumeChange={(vol) => {
                  setAudioSource((prev) => ({ ...prev, volume: vol }));
                  if (!isMuted) globalAudioEngine.setVolume(vol);
                }}
                onUseYoutubeAsBackground={(videoId, title, thumb, start = 0, end = 30) => {
                  setBackground((prev) => ({
                    ...prev,
                    type: 'video',
                    youtubeVideoId: videoId,
                    src: `/api/youtube/video?${new URLSearchParams({ videoId, startTime: String(start), endTime: String(end) })}`,
                    name: title,
                  }));
                }}
                onTriggerTranscription={handleTriggerTranscription}
                isTranscribing={isTranscribing}
              />
            )}

            {activeTab === 'n8n' && (
              <N8nPanel
                n8nConfig={n8nConfig}
                onN8nConfigChange={setN8nConfig}
                subtitles={subtitles}
                clipTitleText={clipTitle.enabled ? clipTitle.text : audioSource.name}
                clipDuration={Math.max(0.05, trimEnd - trimStart)}
                aspectRatio={background.aspectRatio}
                audioName={audioSource.name}
                exportId={exportId}
              />
            )}
          </div>
        </div>
      </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        background={background}
        subtitles={subtitles}
        style={subtitleStyle}
        trimStart={trimStart}
        duration={Math.max(0.05, trimEnd - trimStart)}
        watermarkText={watermarkText}
        clipTitle={clipTitle}
        audioSource={audioSource}
        currentTime={currentTime}
        onPausePreview={() => {
          setIsPlaying(false);
          globalAudioEngine.pause();
        }}
        onOpenN8nPanel={() => setActiveTab('n8n')}
        onExportComplete={setExportId}
      />
    </div>
  );
}
