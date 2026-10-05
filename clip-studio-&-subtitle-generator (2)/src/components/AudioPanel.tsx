import React, { useState, useRef, useEffect } from 'react';
import { AudioSource, SubtitleCue } from '../types';
import { PRESET_AUDIO_TRACKS } from '../constants/presets';
import { formatTime, parseTimeToSeconds } from '../utils/time';
import { globalAudioEngine } from '../utils/audioEngine';
import {
  safeFetchJson,
  extractClientYoutubeId,
  fetchClientYoutubeMetadata,
} from '../utils/api';
import {
  Upload,
  Youtube,
  Music,
  Volume2,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Radio,
  FileAudio,
  AlertCircle,
  Video,
  Mic,
  RefreshCw,
} from 'lucide-react';

interface AudioPanelProps {
  audioSource: AudioSource;
  onAudioSourceChange: (source: AudioSource, newSubtitles?: SubtitleCue[]) => void;
  onLoadAudioBuffer: (fileOrUrl: File | string) => Promise<number>;
  onVolumeChange: (vol: number) => void;
  subtitles?: SubtitleCue[];
  onUseYoutubeAsBackground?: (videoId: string, title: string, thumbnail?: string, start?: number, end?: number) => void;
  onTriggerTranscription?: (lang: 'en' | 'ar' | 'auto') => void;
  isTranscribing?: boolean;
}

export const AudioPanel: React.FC<AudioPanelProps> = ({
  audioSource,
  onAudioSourceChange,
  onLoadAudioBuffer,
  onVolumeChange,
  subtitles = [],
  onUseYoutubeAsBackground,
  onTriggerTranscription,
  isTranscribing = false,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube' | 'presets'>('presets');
  const [youtubeUrl, setYoutubeUrl] = useState(audioSource.youtubeUrl || '');
  const [ytStartTime, setYtStartTime] = useState('00:00');
  const [ytEndTime, setYtEndTime] = useState('00:45');
  const [ytLanguage, setYtLanguage] = useState<'auto' | 'en' | 'ar'>('auto');
  const [autoTranscribeOnPull, setAutoTranscribeOnPull] = useState(false);
  const [useYtVideoBg, setUseYtVideoBg] = useState(false);
  const [isLoadingYt, setIsLoadingYt] = useState(false);
  const [ytSuccessMsg, setYtSuccessMsg] = useState<string | null>(null);
  const [ytErrorMsg, setYtErrorMsg] = useState<string | null>(null);

  // AI Voiceover TTS state
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir'>('Kore');
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsStatusMsg, setTtsStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-warm YouTube audio download in background as soon as user pastes a valid YouTube URL
  useEffect(() => {
    const trimmed = youtubeUrl.trim();
    if (
      trimmed.includes('youtube.com/') ||
      trimmed.includes('youtu.be/') ||
      /^[a-zA-Z0-9_-]{11}$/.test(trimmed)
    ) {
      const timer = setTimeout(() => {
        fetch('/api/youtube/prefetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, startTime: parseTimeToSeconds(ytStartTime), endTime: parseTimeToSeconds(ytEndTime) }),
        }).catch(() => {});
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [youtubeUrl, ytStartTime, ytEndTime]);

  // File Upload Handler (preserves complete audio duration without any 30s cap)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const duration = await onLoadAudioBuffer(file);

      onAudioSourceChange({
        type: 'upload',
        src: URL.createObjectURL(file),
        name: file.name,
        startTime: 0,
        endTime: duration,
        totalDuration: duration,
        volume: audioSource.volume,
      });
    } catch (err) {
      setTtsStatusMsg((err as Error).message || 'Could not load this audio file.');
    }
  };

  // Quick duration setter for YouTube clip extraction
  const setQuickDuration = (minutes: number) => {
    const startSec = parseTimeToSeconds(ytStartTime) || 0;
    const endSec = startSec + Math.round(minutes * 60);
    setYtEndTime(formatTime(endSec));
  };

  // YouTube Link Pull Handler (Separates audio pulling from optional transcription)
  const handlePullYoutube = async () => {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) return;

    const clientVideoId = extractClientYoutubeId(trimmedUrl);
    if (!clientVideoId) {
      setYtErrorMsg(
        'Invalid YouTube URL. Please paste a valid YouTube video, Shorts, or share link (e.g. youtube.com/watch?v=... or youtu.be/...).'
      );
      return;
    }

    setIsLoadingYt(true);
    setYtSuccessMsg(null);
    setYtErrorMsg(null);

    const startSec = parseTimeToSeconds(ytStartTime), endSec = parseTimeToSeconds(ytEndTime);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec || endSec - startSec > 3600) {
      setYtErrorMsg('Enter valid start and end timestamps, with end after start, for a clip of at most 60 minutes.'); setIsLoadingYt(false); return;
    }

    try {
      const { ok, data, isHtmlFallback } = await safeFetchJson<{
        videoId?: string;
        title?: string;
        author?: string;
        thumbnail?: string;
        embedUrl?: string;
        audioBase64?: string | null;
        subtitles?: SubtitleCue[];
        error?: string;
        warning?: string;
      }>(
        '/api/youtube/info',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: trimmedUrl,
            startTime: startSec,
            endTime: endSec,
            language: ytLanguage,
            autoTranscribe: autoTranscribeOnPull,
          }),
        },
        3
      );

      let resolvedVideoId = data?.videoId || clientVideoId;
      let resolvedTitle = data?.title || '';
      let resolvedAuthor = data?.author || 'YouTube Creator';
      let resolvedThumbnail =
        data?.thumbnail || `https://img.youtube.com/vi/${resolvedVideoId}/hqdefault.jpg`;
      let resolvedEmbedUrl =
        data?.embedUrl ||
        `https://www.youtube.com/embed/${resolvedVideoId}?enablejsapi=1&autoplay=0&controls=1&rel=0&playsinline=1&start=${Math.floor(
          startSec
        )}&end=${Math.ceil(endSec)}`;

      if (!ok && !isHtmlFallback && data?.error) {
        throw new Error(data.error);
      }

      if (!resolvedTitle || isHtmlFallback) {
        const clientMeta = await fetchClientYoutubeMetadata(resolvedVideoId);
        resolvedTitle = resolvedTitle || clientMeta.title;
        resolvedAuthor = data?.author || clientMeta.author;
        resolvedThumbnail = data?.thumbnail || clientMeta.thumbnail;
      }

      // Decode the genuine original YouTube audio segment into the WebAudio engine
      const ytLoadResult = await globalAudioEngine.loadYoutubeVideo(
        resolvedVideoId,
        startSec,
        endSec,
        data?.audioBase64 || undefined
      );
      const actualClipDuration = ytLoadResult.duration;
      const effectiveEndSec = startSec + actualClipDuration;

      // Update end time input if video was shorter than requested end timestamp
      if (Math.abs(effectiveEndSec - endSec) >= 1) {
        setYtEndTime(formatTime(effectiveEndSec));
      }

      const extractedCues: SubtitleCue[] | undefined =
        autoTranscribeOnPull && Array.isArray(data?.subtitles) && data.subtitles.length > 0
          ? data.subtitles
          : undefined;

      onAudioSourceChange(
        {
          type: 'youtube',
          src: resolvedEmbedUrl,
          videoId: resolvedVideoId,
          name:
            resolvedTitle ||
            `YouTube Clip [${formatTime(startSec)} - ${formatTime(effectiveEndSec)}]`,
          author: resolvedAuthor,
          thumbnail: resolvedThumbnail,
          startTime: 0,
          endTime: actualClipDuration,
          totalDuration: actualClipDuration,
          ytStartOffset: startSec,
          ytEndOffset: effectiveEndSec,
          youtubeUrl: trimmedUrl,
          volume: audioSource.volume,
        },
        extractedCues
      );

      if (useYtVideoBg && onUseYoutubeAsBackground && resolvedVideoId) {
        onUseYoutubeAsBackground(
          resolvedVideoId,
          resolvedTitle || 'YouTube Video',
          resolvedThumbnail, startSec, effectiveEndSec
        );
      }

      if (autoTranscribeOnPull && !extractedCues && data?.warning) setYtErrorMsg(data.warning);
      if (extractedCues) {
        setYtSuccessMsg(
          `Pulled "${resolvedTitle}" (${formatTime(startSec)} → ${formatTime(
            effectiveEndSec
          )}) & transcribed ${extractedCues.length} cues!`
        );
      } else {
        setYtSuccessMsg(
          `Pulled audio "${resolvedTitle}" (${formatTime(startSec)} → ${formatTime(
            effectiveEndSec
          )})! Press Play to listen, or optionally transcribe below.`
        );
      }
    } catch (err: any) {
      console.error('YouTube pull error:', err);
      const rawMsg = String(err?.message || '');
      const cleanMsg =
        rawMsg.includes('Unexpected token') || rawMsg.toLowerCase().includes('<!doctype')
          ? 'Server is warming up. Please click Pull Audio From Timeframe again in a moment.'
          : rawMsg || 'Could not load YouTube link. Please verify the URL.';
      setYtErrorMsg(cleanMsg);
    } finally {
      setIsLoadingYt(false);
    }
  };

  // Generate AI Spoken Voiceover from current subtitles
  const handleGenerateVoiceover = async (cuesToSpeak?: SubtitleCue[], customTitle?: string) => {
    const activeCues = cuesToSpeak && cuesToSpeak.length > 0 ? cuesToSpeak : subtitles;
    if (!activeCues.length) return;

    setIsGeneratingTts(true);
    setTtsStatusMsg(null);
    try {
      const { ok, data } = await safeFetchJson<{
        audioBase64?: string;
        error?: string;
      }>('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: activeCues,
          voiceName: selectedVoice,
        }),
      });
      if (!ok || !data?.audioBase64) {
        throw new Error(data?.error || 'Voiceover generation failed');
      }

      const decoded = await globalAudioEngine.loadAudioFromBase64(data.audioBase64, true);
      const dur = decoded.duration;

      // Proportionally align subtitle cues to match the spoken voiceover duration
      const maxCueEnd = Math.max(...activeCues.map((c) => c.end), 1);
      const scaleFactor = dur / maxCueEnd;
      const syncedCues: SubtitleCue[] = activeCues.map((c) => ({
        ...c,
        start: Number((c.start * scaleFactor).toFixed(2)),
        end: Number((c.end * scaleFactor).toFixed(2)),
        words: c.words?.map((w) => ({
          ...w,
          start: Number((w.start * scaleFactor).toFixed(2)),
          end: Number((w.end * scaleFactor).toFixed(2)),
        })),
      }));

      onAudioSourceChange(
        {
          type: 'preset',
          src: 'ai-tts-voiceover',
          name: customTitle || `AI Voiceover (${selectedVoice})`,
          startTime: 0,
          endTime: dur,
          totalDuration: dur,
          volume: audioSource.volume,
        },
        syncedCues
      );
      setTtsStatusMsg(`Generated ${formatTime(dur)} AI voiceover (${selectedVoice})!`);
    } catch (err: any) {
      console.warn('TTS generation fallback:', err);
      setTtsStatusMsg((err as Error).message || 'Voiceover generation failed.');
    } finally {
      setIsGeneratingTts(false);
    }
  };

  // Select Preset Audio
  const handleSelectPreset = async (preset: (typeof PRESET_AUDIO_TRACKS)[0]) => {
    globalAudioEngine.generateSyntheticBuffer(preset.duration);
    onAudioSourceChange(
      {
        type: 'preset',
        src: preset.audioUrl,
        name: preset.name,
        author: preset.author,
        startTime: 0,
        endTime: preset.duration,
        totalDuration: preset.duration,
        volume: audioSource.volume,
      },
      preset.defaultSubtitles
    );
    await handleGenerateVoiceover(preset.defaultSubtitles, `${preset.name} (AI Voiceover)`);
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-2xl bg-zinc-900 border-zinc-800 shadow-xl lg:overflow-y-auto lg:max-h-[640px]">
      {/* Tabs */}
      <div className="flex p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'presets'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Presets &amp; AI Voice
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'upload'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Audio
        </button>

        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'youtube'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Youtube className="w-3.5 h-3.5 text-red-500" />
          YouTube Link
        </button>
      </div>

      {/* Preset Tracks & AI Voiceover Generator */}
      {activeTab === 'presets' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            Select a viral preset script (auto-generates spoken AI voiceover) or synthesize speech for your current subtitles:
          </p>
          {PRESET_AUDIO_TRACKS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                audioSource.name.startsWith(preset.name)
                  ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-indigo-400" />
                  {preset.name}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    preset.language === 'ar'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                  }`}
                >
                  {preset.language === 'ar' ? 'العربية' : 'English'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-2">{preset.description}</p>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>By {preset.author}</span>
                <span>Duration: {formatTime(preset.duration)}</span>
              </div>
            </div>
          ))}

          {/* AI TTS Voiceover Generator for Current Subtitles */}
          <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-indigo-400" />
                AI Voiceover From Subtitles
              </span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value as any)}
                className="px-2 py-1 text-[11px] font-medium text-white bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none"
              >
                <option value="Kore">Kore (Clear Warm)</option>
                <option value="Puck">Puck (Energetic)</option>
                <option value="Charon">Charon (Deep Studio)</option>
                <option value="Fenrir">Fenrir (Bold Narrative)</option>
                <option value="Zephyr">Zephyr (Smooth Modern)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateVoiceover()}
              disabled={isGeneratingTts || subtitles.length === 0}
              className="w-full py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isGeneratingTts ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Synthesizing AI Voiceover...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Speak Current Subtitles ({subtitles.length} cues)
                </>
              )}
            </button>
            {ttsStatusMsg && (
              <p className="text-[11px] text-emerald-400 font-medium">{ttsStatusMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* Upload Audio File */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed rounded-xl border-zinc-700 hover:border-indigo-500/80 bg-zinc-950/40 hover:bg-zinc-950/80 transition-all cursor-pointer group"
          >
            <div className="p-3 mb-2 rounded-full bg-zinc-900 group-hover:bg-indigo-600/20 text-zinc-400 group-hover:text-indigo-400 transition-colors">
              <FileAudio className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-zinc-200">
              Click to select audio file (or video file)
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">
              MP3, WAV, M4A, AAC, OGG, MP4 (optional AI transcription after upload)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {audioSource.type === 'upload' && (
            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Radio className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="truncate text-zinc-200 font-semibold">{audioSource.name}</span>
                </div>
                <span className="text-zinc-500 font-mono text-[11px]">
                  {formatTime(audioSource.totalDuration)}
                </span>
              </div>

              {onTriggerTranscription && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                  <span className="block text-[11px] text-zinc-400 font-medium">
                    Optional: Transcribe Uploaded Audio to Subtitles
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onTriggerTranscription('en')}
                      disabled={isTranscribing}
                      className="py-1.5 px-2.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isTranscribing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Transcribe (EN)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onTriggerTranscription('ar')}
                      disabled={isTranscribing}
                      className="py-1.5 px-2.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isTranscribing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>تفريغ وترجمة (AR)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* YouTube Link & Timeframe Extraction */}
      {activeTab === 'youtube' && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            Paste any YouTube video or Shorts URL to extract the genuine audio segment. You can optionally transcribe it into subtitles after pulling:
          </p>

          <div>
            <label className="block mb-1 text-xs font-semibold text-zinc-300">
              YouTube Video or Shorts URL
            </label>
            <div className="flex items-center gap-2 p-2 border rounded-xl bg-zinc-950 border-zinc-800 focus-within:border-indigo-500">
              <Youtube className="w-4 h-4 text-red-500 shrink-0" />
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="w-full text-xs text-white bg-transparent focus:outline-none"
              />
            </div>
          </div>

          {/* Timeframe Selectors (MM:SS) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-xs text-zinc-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" /> Start Timestamp (MM:SS)
              </label>
              <input
                type="text"
                placeholder="00:00"
                value={ytStartTime}
                onChange={(e) => setYtStartTime(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs text-center font-mono text-white bg-zinc-950 border rounded-lg border-zinc-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs text-zinc-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-emerald-400" /> End Timestamp (MM:SS)
              </label>
              <input
                type="text"
                placeholder="00:45"
                value={ytEndTime}
                onChange={(e) => setYtEndTime(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs text-center font-mono text-white bg-zinc-950 border rounded-lg border-zinc-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Quick Duration Preset Chips */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
              <span>Quick Segment Duration:</span>
              <span className="text-[10px] text-emerald-400 font-medium">Real YouTube Audio Stream</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { label: '30s', mins: 0.5 },
                { label: '1 min', mins: 1 },
                { label: '3 min', mins: 3 },
                { label: '5 min', mins: 5 },
                { label: '10 min', mins: 10 },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setQuickDuration(item.mins)}
                  className="py-1 px-1.5 text-[11px] font-mono rounded-md bg-zinc-800/80 hover:bg-indigo-600 hover:text-white text-zinc-300 transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pull Options (Video Background & Optional Auto-Transcribe Toggle) */}
          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-2">
            <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-indigo-400" />
                Also display YouTube video on canvas
              </span>
              <input
                type="checkbox"
                checked={useYtVideoBg}
                onChange={(e) => setUseYtVideoBg(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-zinc-400 pt-1.5 border-t border-zinc-800/80 cursor-pointer">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Auto-transcribe subtitles while pulling (optional)
              </span>
              <input
                type="checkbox"
                checked={autoTranscribeOnPull}
                onChange={(e) => setAutoTranscribeOnPull(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Step 1: Pull Audio Button */}
          <button
            onClick={handlePullYoutube}
            disabled={!youtubeUrl.trim() || isLoadingYt}
            className="w-full py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-[0.99] rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoadingYt ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {autoTranscribeOnPull
                    ? 'Pulling YouTube Audio & Transcribing...'
                    : 'Pulling Original YouTube Audio...'}
                </span>
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4" />
                <span>
                  {autoTranscribeOnPull
                    ? 'Pull Audio & Transcribe Subtitles'
                    : 'Pull Audio From Timeframe'}
                </span>
              </>
            )}
          </button>

          {/* Active Pulled YouTube Track Card + Step 2: Separate Optional Transcription Controls */}
          {audioSource.type === 'youtube' && audioSource.videoId && (
            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
              <div className="flex items-center gap-3">
                {audioSource.thumbnail && (
                  <img
                    src={audioSource.thumbnail}
                    alt={audioSource.name}
                    className="w-14 h-10 object-cover rounded-lg border border-zinc-800 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{audioSource.name}</p>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    Segment: {formatTime(audioSource.ytStartOffset || 0)} →{' '}
                    {formatTime(audioSource.ytEndOffset || audioSource.totalDuration)} (
                    {formatTime(audioSource.totalDuration)})
                  </p>
                </div>
                {onUseYoutubeAsBackground && (
                  <button
                    type="button"
                    onClick={() =>
                      onUseYoutubeAsBackground(
                        audioSource.videoId!,
                        audioSource.name,
                        audioSource.thumbnail, audioSource.ytStartOffset, audioSource.ytEndOffset
                      )
                    }
                    className="px-2 py-1 text-[10px] font-semibold bg-zinc-800 hover:bg-indigo-600 text-zinc-200 hover:text-white rounded-lg transition-colors shrink-0 cursor-pointer"
                    title="Use YouTube Video as Canvas Background"
                  >
                    Use Video BG
                  </button>
                )}
              </div>

              {/* Separate Optional Transcription Section After Pulling */}
              {onTriggerTranscription && (
                <div className="pt-2.5 border-t border-zinc-800/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Optional: Transcribe Pulled Audio
                    </span>
                    <div className="flex gap-1">
                      {[
                        { id: 'auto', label: 'Original' },
                        { id: 'en', label: 'English' },
                        { id: 'ar', label: 'العربية' },
                      ].map((lang) => (
                        <button
                          key={lang.id}
                          type="button"
                          onClick={() => setYtLanguage(lang.id as any)}
                          className={`px-2 py-0.5 text-[10px] rounded font-semibold transition-colors cursor-pointer ${
                            ytLanguage === lang.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onTriggerTranscription(ytLanguage)}
                    disabled={isTranscribing}
                    className="w-full py-2 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isTranscribing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Transcribing Pulled YouTube Audio...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          Transcribe Pulled Audio (
                          {ytLanguage === 'ar'
                            ? 'Arabic / العربية'
                            : ytLanguage === 'en'
                            ? 'English'
                            : 'Original Language'}
                          )
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {ytSuccessMsg && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-emerald-400 border rounded-lg bg-emerald-950/40 border-emerald-800/60">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{ytSuccessMsg}</span>
            </div>
          )}

          {ytErrorMsg && (
            <div className="flex items-center gap-2 p-2.5 text-xs text-red-400 border rounded-lg bg-red-950/40 border-red-800/60">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{ytErrorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Volume & Boost Section */}
      <div className="pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-1 text-xs text-zinc-300">
          <span className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            Master Audio Volume &amp; Boost
          </span>
          <span className="font-mono text-white">
            {Math.round(audioSource.volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2.0"
          step="0.05"
          value={audioSource.volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onVolumeChange(v);
          }}
          className="w-full accent-indigo-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
          <span>0%</span>
          <span>100% (Original)</span>
          <span className="text-indigo-400 font-semibold">200% (Boosted)</span>
        </div>
      </div>
    </div>
  );
};
