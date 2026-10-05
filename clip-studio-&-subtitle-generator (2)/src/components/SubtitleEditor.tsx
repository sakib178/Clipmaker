import React, { useState } from 'react';
import { SubtitleCue } from '../types';
import { formatTimePrecise, parseTimeToSeconds, generateSrtContent, generateVttContent, downloadTextFile, isArabicText, parseSubtitleContent, trimSubtitleCues } from '../utils/time';
import {
  Sparkles,
  Languages,
  Plus,
  Trash2,
  Split,
  Merge,
  Download,
  Upload,
  Search,
  Clock,
  Check,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface SubtitleEditorProps {
  subtitles: SubtitleCue[];
  onSubtitlesChange: (cues: SubtitleCue[]) => void;
  currentTime: number;
  onSeek: (time: number) => void;
  selectedCueId?: string;
  onSelectCue: (cueId: string) => void;
  isTranscribing: boolean;
  onTriggerTranscription: (lang: 'en' | 'ar') => void;
  onTranslate: (targetLang: 'en' | 'ar') => void;
  isTranslating: boolean;
  trimStart?: number;
  trimEnd?: number;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  subtitles,
  onSubtitlesChange,
  currentTime,
  onSeek,
  selectedCueId,
  onSelectCue,
  isTranscribing,
  onTriggerTranscription,
  onTranslate,
  isTranslating,
  trimStart = 0,
  trimEnd = Infinity,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [timeOffset, setTimeOffset] = useState<string>('0.2');

  // Add new cue at current time
  const handleAddCue = () => {
    const newStart = Math.max(0, currentTime);
    const newEnd = newStart + 2.5;
    const newCue: SubtitleCue = {
      id: `cue-${Date.now()}`,
      start: Number(newStart.toFixed(2)),
      end: Number(newEnd.toFixed(2)),
      text: 'New subtitle caption',
      words: [
        { word: 'New', start: newStart, end: newStart + 0.8 },
        { word: 'subtitle', start: newStart + 0.8, end: newStart + 1.6 },
        { word: 'caption', start: newStart + 1.6, end: newEnd },
      ],
    };

    const updated = [...subtitles, newCue].sort((a, b) => a.start - b.start);
    onSubtitlesChange(updated);
    onSelectCue(newCue.id);
  };

  // Delete cue
  const handleDeleteCue = (id: string) => {
    const updated = subtitles.filter((c) => c.id !== id);
    onSubtitlesChange(updated);
  };

  const buildProportionalWords = (text: string, start: number, end: number) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const cueDuration = Math.max(0.2, end - start);
    const wordDur = cueDuration / Math.max(1, words.length);
    return words.map((w, idx) => ({
      word: w,
      start: Number((start + idx * wordDur).toFixed(2)),
      end: Number((start + (idx + 1) * wordDur).toFixed(2)),
    }));
  };

  // Text change
  const handleTextChange = (id: string, newText: string) => {
    const updated = subtitles.map((cue) => {
      if (cue.id !== id) return cue;
      return {
        ...cue,
        text: newText,
        words: buildProportionalWords(newText, cue.start, cue.end),
      };
    });
    onSubtitlesChange(updated);
  };

  // Timing change
  const handleTimeChange = (id: string, field: 'start' | 'end', valStr: string) => {
    const parsed = parseTimeToSeconds(valStr);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const updated = subtitles.map((cue) => {
      if (cue.id !== id) return cue;
      const updatedCue = { ...cue, [field]: parsed };
      if (field === 'start' && updatedCue.start >= updatedCue.end) {
        updatedCue.end = Number((updatedCue.start + 0.5).toFixed(2));
      }
      if (field === 'end' && updatedCue.end <= updatedCue.start) updatedCue.end = updatedCue.start + 0.1;
      updatedCue.words = buildProportionalWords(
        updatedCue.text,
        updatedCue.start,
        updatedCue.end
      );
      return updatedCue;
    });
    onSubtitlesChange(updated.sort((a, b) => a.start - b.start));
  };

  // Split cue at current time
  const handleSplitCue = (cue: SubtitleCue) => {
    const splitTime =
      currentTime > cue.start + 0.1 && currentTime < cue.end - 0.1
        ? currentTime
        : (cue.start + cue.end) / 2;
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    const midWordIdx = Math.max(1, Math.floor(words.length / 2));
    const firstHalfText = words.slice(0, midWordIdx).join(' ') || cue.text;
    const secondHalfText = words.slice(midWordIdx).join(' ') || '...';

    const splitPt = Number(splitTime.toFixed(2));
    const cue1: SubtitleCue = {
      ...cue,
      end: splitPt,
      text: firstHalfText,
      words: buildProportionalWords(firstHalfText, cue.start, splitPt),
    };
    const cue2: SubtitleCue = {
      id: `cue-${Date.now()}`,
      start: splitPt,
      end: cue.end,
      text: secondHalfText,
      words: buildProportionalWords(secondHalfText, splitPt, cue.end),
    };

    const updated = subtitles
      .map((c) => (c.id === cue.id ? cue1 : c))
      .concat(cue2)
      .sort((a, b) => a.start - b.start);

    onSubtitlesChange(updated);
  };

  // Merge cue with next
  const handleMergeNext = (index: number) => {
    if (index >= subtitles.length - 1) return;
    const currentCue = subtitles[index];
    const nextCue = subtitles[index + 1];

    const mergedText = `${currentCue.text} ${nextCue.text}`.trim();
    const mergedCue: SubtitleCue = {
      id: currentCue.id,
      start: currentCue.start,
      end: nextCue.end,
      text: mergedText,
      words:
        currentCue.words && nextCue.words
          ? [...currentCue.words, ...nextCue.words]
          : buildProportionalWords(mergedText, currentCue.start, nextCue.end),
    };

    const updated = subtitles
      .filter((_, i) => i !== index + 1)
      .map((c) => (c.id === currentCue.id ? mergedCue : c));

    onSubtitlesChange(updated);
  };

  // Shift all timings by delta
  const handleShiftAll = (delta: number) => {
    const updated = subtitles.map((c) => ({
      ...c,
      start: Math.max(0, Number((c.start + delta).toFixed(2))),
      end: Math.max(0.1, Number((c.end + delta).toFixed(2))),
      words: c.words?.map((w) => ({
        ...w,
        start: Math.max(0, Number((w.start + delta).toFixed(2))),
        end: Math.max(0.1, Number((w.end + delta).toFixed(2))),
      })),
    }));
    onSubtitlesChange(updated);
  };

  // Search & Replace
  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const updated = subtitles.map((c) => {
      const nextText = c.text.replace(regex, replaceQuery);
      return {
        ...c,
        text: nextText,
        words: buildProportionalWords(nextText, c.start, c.end),
      };
    });
    onSubtitlesChange(updated);
  };

  // Subtitle File Import (SRT / VTT)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const parsedCues = parseSubtitleContent(content);
      if (parsedCues.length > 0) {
        onSubtitlesChange(parsedCues);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-900 border rounded-2xl border-zinc-800 shadow-xl">
      {/* Header with AI & Language Action Buttons */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Automated Subtitles &amp; AI Corrections
            </h2>
            <p className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[10px]">
                Audio Transcription
              </span>
              <span>&rarr;</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                Subtitle Translation
              </span>
              <span>Understanding &amp; Translation</span>
            </p>
          </div>

          {/* AI Transcribe & Translate Buttons */}
          <div className="flex items-center gap-2">
            {/* Generate English Subtitles */}
            <button
              onClick={() => onTriggerTranscription('en')}
              disabled={isTranscribing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 rounded-lg shadow-sm transition-all disabled:opacity-50"
              title="Auto transcribe in English with AI word synchronization"
            >
              {isTranscribing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              AI English (EN)
            </button>

            {/* Generate Arabic Subtitles */}
            <button
              onClick={() => onTriggerTranscription('ar')}
              disabled={isTranscribing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-lg shadow-sm transition-all disabled:opacity-50"
              title="توليد ترجمة نصية تلقائية باللغة العربية مع محاذاة الكلمات"
            >
              {isTranscribing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
              توليد عربي (AR)
            </button>

            {/* Translate Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTranslateMenu((prev) => !prev)}
                disabled={isTranslating || subtitles.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700 disabled:opacity-40 cursor-pointer"
              >
                {isTranslating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5 text-indigo-400" />
                )}
                Translate
              </button>
              {showTranslateMenu && (
                <div className="absolute right-0 top-full mt-1 flex flex-col bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-1 z-30 min-w-[150px]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTranslateMenu(false);
                      onTranslate('ar');
                    }}
                    className="px-2.5 py-1.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 rounded cursor-pointer"
                  >
                    To Arabic (إلى العربية)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTranslateMenu(false);
                      onTranslate('en');
                    }}
                    className="px-2.5 py-1.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 rounded cursor-pointer"
                  >
                    To English (إلى الإنجليزية)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddCue}
              className="flex items-center gap-1 px-2.5 py-1 font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Cue
            </button>
            <button
              onClick={() => setShowSearchReplace(!showSearchReplace)}
              className={`flex items-center gap-1 px-2.5 py-1 font-medium rounded-md transition-colors border cursor-pointer ${
                showSearchReplace
                  ? 'bg-zinc-700 text-white border-zinc-600'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <Search className="w-3.5 h-3.5" /> Search & Replace
            </button>
          </div>

          {/* Timing offset buttons & File Exports */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span>Shift:</span>
              <button
                onClick={() => handleShiftAll(-parseFloat(timeOffset))}
                className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 font-mono cursor-pointer"
                title="Shift all cues earlier"
              >
                -{timeOffset}s
              </button>
              <button
                onClick={() => handleShiftAll(parseFloat(timeOffset))}
                className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 font-mono cursor-pointer"
                title="Shift all cues later"
              >
                +{timeOffset}s
              </button>
            </div>

            {/* Export SRT / VTT */}
            <div className="flex items-center gap-1 pl-2 border-l border-zinc-800">
              <button
                onClick={() => downloadTextFile('clip-subtitles.srt', generateSrtContent(trimSubtitleCues(subtitles, trimStart, trimEnd)), 'text/plain')}
                className="px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 cursor-pointer"
                title="Download SRT subtitle file"
              >
                .SRT
              </button>
              <button
                onClick={() => downloadTextFile('clip-subtitles.vtt', generateVttContent(trimSubtitleCues(subtitles, trimStart, trimEnd)), 'text/vtt')}
                className="px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 cursor-pointer"
                title="Download WebVTT file"
              >
                .VTT
              </button>
              {/* Import SRT */}
              <label className="cursor-pointer px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <input
                  type="file"
                  accept=".srt,.vtt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Search & Replace Panel */}
        {showSearchReplace && (
          <div className="flex flex-wrap items-center gap-2 p-2 mt-2 border rounded-lg bg-zinc-950 border-zinc-800">
            <input
              type="text"
              placeholder="Search word..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[110px] px-2.5 py-1 text-xs text-white bg-zinc-900 border rounded border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="flex-1 min-w-[110px] px-2.5 py-1 text-xs text-white bg-zinc-900 border rounded border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleReplaceAll}
              className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-500 cursor-pointer"
            >
              Replace All
            </button>
          </div>
        )}
      </div>

      {/* Subtitles Cue List */}
      <div className="flex-1 p-3 space-y-2.5 lg:overflow-y-auto lg:max-h-[540px]">
        {subtitles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <FileText className="w-10 h-10 mb-2 opacity-40 text-zinc-600" />
            <p className="text-sm font-medium">No subtitles yet</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              Click &quot;AI English&quot; or &quot;توليد عربي&quot; above to auto-generate synchronized speech subtitles, or click &quot;Add Cue&quot; to write manually.
            </p>
          </div>
        ) : (
          subtitles.map((cue, index) => {
            const isCurrentlyPlaying = currentTime >= cue.start && currentTime <= cue.end;
            const isSelected = selectedCueId === cue.id;
            const isRtl = isArabicText(cue.text);

            return (
              <div
                key={cue.id}
                onClick={() => {
                  onSelectCue(cue.id);
                  onSeek(cue.start);
                }}
                className={`p-3 rounded-xl border transition-all ${
                  isCurrentlyPlaying
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30'
                    : isSelected
                    ? 'bg-zinc-800/80 border-zinc-600'
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {/* Top row: Timing editor & quick actions */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-[10px] text-zinc-500 font-sans">#{index + 1}</span>
                    <input
                      type="text"
                      key={`${cue.id}-start-${cue.start}`}
                      defaultValue={formatTimePrecise(cue.start)}
                      onBlur={(e) => { handleTimeChange(cue.id, 'start', e.target.value); e.target.value = formatTimePrecise(cue.start); }}
                      className="w-20 px-1.5 py-0.5 text-center text-xs bg-zinc-900 border rounded border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-zinc-600">&rarr;</span>
                    <input
                      type="text"
                      key={`${cue.id}-end-${cue.end}`}
                      defaultValue={formatTimePrecise(cue.end)}
                      onBlur={(e) => { handleTimeChange(cue.id, 'end', e.target.value); e.target.value = formatTimePrecise(cue.end); }}
                      className="w-20 px-1.5 py-0.5 text-center text-xs bg-zinc-900 border rounded border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-zinc-500">
                      ({(cue.end - cue.start).toFixed(1)}s)
                    </span>
                  </div>

                  {/* Cue Action Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSplitCue(cue);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Split cue into two"
                    >
                      <Split className="w-3.5 h-3.5" />
                    </button>
                    {index < subtitles.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeNext(index);
                        }}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Merge with next cue"
                      >
                        <Merge className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCue(cue.id);
                      }}
                      className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete cue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Textarea for Caption Editing with auto RTL / LTR direction */}
                <textarea
                  rows={2}
                  value={cue.text}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  onChange={(e) => handleTextChange(cue.id, e.target.value)}
                  className={`w-full p-2 text-sm text-white bg-zinc-900/90 border rounded-lg border-zinc-800 focus:outline-none focus:border-indigo-500 transition-colors resize-none ${
                    isRtl ? 'font-arabic' : ''
                  }`}
                  placeholder="Subtitle caption text..."
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
