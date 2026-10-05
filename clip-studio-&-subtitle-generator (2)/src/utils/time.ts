import { SubtitleCue } from '../types';

/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number, includeHours: boolean = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  seconds = Math.round(seconds * 1000) / 1000;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0 || includeHours) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats seconds into MM:SS.ms for precise subtitle editing
 */
export function formatTimePrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const hundredths = Math.round(seconds * 100);
  const mins = Math.floor(hundredths / 6000), secs = Math.floor(hundredths / 100) % 60, ms = hundredths % 100;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Parses MM:SS or MM:SS.ms or seconds string into number
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (typeof timeStr !== 'string') return NaN;
  const cleaned = timeStr.trim();
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const parts = cleaned.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((part, index) => index === parts.length - 1 ? /^\d{1,2}(?:\.\d+)?$/.test(part) : /^\d+$/.test(part))) return NaN;
  const values = parts.map(Number);
  if (values[values.length - 1] >= 60 || (values.length === 3 && values[1] >= 60)) return NaN;
  return values.reduce((seconds, value) => seconds * 60 + value, 0);
}

/**
 * Formats time for SubRip (.srt) HH:MM:SS,mmm
 */
export function formatSrtTime(seconds: number): string {
  const milliseconds = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const hrs = Math.floor(milliseconds / 3600000), mins = Math.floor(milliseconds / 60000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60, ms = milliseconds % 1000;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Formats time for WebVTT (.vtt) HH:MM:SS.mmm
 */
export function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(',', '.');
}

/**
 * Exports cues to standard SRT subtitle text
 */
export function generateSrtContent(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  return sorted
    .map((cue, index) => {
      const idx = index + 1;
      const startStr = formatSrtTime(cue.start);
      const endStr = formatSrtTime(cue.end);
      return `${idx}\n${startStr} --> ${endStr}\n${cue.text}\n`;
    })
    .join('\n');
}

/**
 * Exports cues to WebVTT subtitle text
 */
export function generateVttContent(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  let vtt = 'WEBVTT\n\n';
  vtt += sorted
    .map((cue, index) => {
      const idx = index + 1;
      const startStr = formatVttTime(cue.start);
      const endStr = formatVttTime(cue.end);
      return `${idx}\n${startStr} --> ${endStr}\n${cue.text}\n`;
    })
    .join('\n');
  return vtt;
}

/** Align a subtitle download to the exported, trimmed MP4 timeline. */
export function trimSubtitleCues(cues: SubtitleCue[], start = 0, end = Infinity): SubtitleCue[] {
  return cues.filter(cue => cue.end > start && cue.start < end).map(cue => ({
    ...cue,
    start: Math.max(start, cue.start) - start,
    end: Math.min(end, cue.end) - start,
    words: cue.words?.filter(word => word.end > start && word.start < end).map(word => ({
      ...word, start: Math.max(start, word.start) - start, end: Math.min(end, word.end) - start,
    })),
  }));
}

/**
 * Triggers file download in browser
 */
export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Detects if a text string is primarily Arabic
 */
export function isArabicText(text: string): boolean {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  return arabicPattern.test(text);
}

/** Parses SRT/VTT blocks, retaining numeric captions and ignoring VTT cue settings. */
export function parseSubtitleContent(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const block of content.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => line.includes('-->'));
    if (index < 0) continue;
    const [startText, endText] = lines[index].split('-->').map(text => text.trim().split(/\s+/)[0].replace(',', '.'));
    const start = parseTimeToSeconds(startText), end = parseTimeToSeconds(endText);
    const text = lines.slice(index + 1).join('\n').trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const words = text.split(/\s+/);
    cues.push({ id: `imported-${cues.length + 1}`, start, end, text, words: words.map((word, i) => ({ word, start: start + (end - start) * i / words.length, end: start + (end - start) * (i + 1) / words.length })) });
  }
  return cues.sort((a, b) => a.start - b.start);
}
