import './config.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
export const mediaCacheDir = process.env.CLIP_STUDIO_CACHE_DIR || path.join(os.tmpdir(), 'clip-studio-media');
export const inFlightYoutubeDownloads = new Map<string, Promise<YoutubeAudio | null>>();
const failures = new Map<string, { at: number; message: string }>();

export function extractYoutubeVideoId(value: string): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return validId(url.pathname.split('/')[1]);
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) return null;
    return validId(url.searchParams.get('v') || (/^\/(embed|shorts|live|v)\//.test(url.pathname) ? url.pathname.split('/')[2] : ''));
  } catch { return null; }
}

function validId(value: string | null) { return value && /^[\w-]{11}$/.test(value) ? value : null; }

export function validateRange(start: unknown, end: unknown) {
  const startSec = Number(start), endSec = Number(end);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
    throw new Error('Start and end must be valid timestamps, with end after start.');
  }
  if (endSec - startSec > 3600) throw new Error('Select a clip of at most 60 minutes.');
  return { startSec, endSec };
}

export async function runMedia(command: string, args: string[]) {
  try { return await exec(command, ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 }); }
  catch (error: any) {
    if (error.code === 'ENOENT') throw new Error(`${command} is not installed. Install FFmpeg and ffprobe or configure FFMPEG_PATH / FFPROBE_PATH.`);
    throw new Error(String(error.stderr || error.message || 'Media processing failed').slice(-1200));
  }
}

export async function probeMedia(file: string): Promise<{ duration: number; streams: any[] }> {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout);
  return { duration: Number(data.format?.duration), streams: data.streams || [] };
}

function cacheKey(videoId: string, start: number, end: number) {
  // Preserve fractional timestamps; rounding the old keys reused the wrong segment.
  return `${videoId}-${crypto.createHash('sha256').update(`${start}:${end}`).digest('hex').slice(0, 20)}`;
}

export function isYoutubePending(videoId: string) {
  return [...inFlightYoutubeDownloads.keys()].some(key => key.startsWith(`${videoId}-`));
}

export function youtubeFailure(videoId: string) {
  return failures.get(videoId)?.message || 'The original YouTube media is unavailable. Retry or upload a downloaded copy of the audio.';
}

async function downloadSection(videoId: string, start: number, end: number, outputTemplate: string, video = false) {
  const bundled = path.resolve('bin/yt-dlp');
  const command = process.env.YT_DLP_PATH || process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
  const prefix = process.env.YT_DLP_PATH ? [] : [bundled];
  const args = [...prefix, '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
    '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
    '--js-runtimes', `node:${process.execPath}`,
    ...(process.env.FFMPEG_PATH ? ['--ffmpeg-location', FFMPEG] : []),
    '-f', video ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best' : 'bestaudio/best',
    '--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts',
    ...(video ? ['--merge-output-format', 'mp4'] : ['-x', '--audio-format', 'wav']),
    '-o', outputTemplate];
  if (process.env.YOUTUBE_COOKIES_FILE) args.push('--cookies', process.env.YOUTUBE_COOKIES_FILE);
  args.push(`https://www.youtube.com/watch?v=${videoId}`);
  await exec(command, args, { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
}

interface YoutubeAudio {
  mp3Buffer: Buffer; mp3Base64: string; wavBase64: string; slicedMp3Path: string; duration: number;
}

export async function extractYoutubeOriginalAudio(videoId: string, startSec = 0, endSec = 30, needTranscriptionWav = false): Promise<YoutubeAudio | null> {
  const { startSec: start, endSec: end } = validateRange(startSec, endSec);
  if (!validId(videoId)) throw new Error('Invalid YouTube video ID.');
  await fs.mkdir(mediaCacheDir, { recursive: true });
  const key = cacheKey(videoId, start, end);
  const mp3Path = path.join(mediaCacheDir, `${key}.mp3`);
  let task = inFlightYoutubeDownloads.get(key);
  if (!task) {
    task = (async () => {
      const workDir = await fs.mkdtemp(path.join(mediaCacheDir, 'extract-'));
      try {
        let cached = false;
        try { const info = await probeMedia(mp3Path); cached = info.duration > 0 && info.streams.some(s => s.codec_type === 'audio'); } catch {}
        if (!cached) {
          const recentFailure = failures.get(videoId);
          if (recentFailure && Date.now() - recentFailure.at < 10_000) throw new Error(recentFailure.message);
          // Old caches are usable only when they cover the entire requested range.
          const legacySource = path.join(os.tmpdir(), `yt-full-${videoId}.mp3`);
          let input = '', offset = 0;
          try {
            const sourceInfo = await probeMedia(legacySource);
            if (sourceInfo.duration >= end && sourceInfo.streams.some(s => s.codec_type === 'audio')) { input = legacySource; offset = start; }
          } catch {}
          if (!input) {
            await downloadSection(videoId, start, end, path.join(workDir, 'source.%(ext)s'));
            input = path.join(workDir, 'source.wav');
          }
          const staged = path.join(workDir, 'segment.mp3');
          await runMedia(FFMPEG, ['-y', '-ss', String(offset), '-i', input, '-t', String(end - start), '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', staged]);
          const info = await probeMedia(staged);
          if (!(info.duration > 0) || !info.streams.some(s => s.codec_type === 'audio')) throw new Error('No audio track was downloaded for this timeframe.');
          await fs.rename(staged, mp3Path);
          failures.delete(videoId);
        }
        const mp3Buffer = await fs.readFile(mp3Path);
        const info = await probeMedia(mp3Path);
        return { mp3Buffer, mp3Base64: mp3Buffer.toString('base64'), wavBase64: '', slicedMp3Path: mp3Path, duration: Math.min(end - start, info.duration) };
      } catch (error: any) {
        const message = error.code === 'ENOENT' ? 'YouTube extraction needs Python 3 (or YT_DLP_PATH), FFmpeg, and ffprobe installed on the server.' : `Could not download original YouTube audio: ${String(error.stderr || error.message).slice(-800)}`;
        failures.set(videoId, { at: Date.now(), message });
        console.warn(message);
        return null;
      } finally { await fs.rm(workDir, { recursive: true, force: true }); }
    })();
    inFlightYoutubeDownloads.set(key, task);
    void task.finally(() => inFlightYoutubeDownloads.delete(key));
  }
  const result = await task;
  if (!result || !needTranscriptionWav) return result;
  const wavPath = path.join(mediaCacheDir, `${key}-${crypto.randomUUID()}.wav`);
  try {
    await runMedia(FFMPEG, ['-y', '-i', result.slicedMp3Path, '-vn', '-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1', wavPath]);
    return { ...result, wavBase64: (await fs.readFile(wavPath)).toString('base64') };
  } finally { await fs.unlink(wavPath).catch(() => {}); }
}

const pendingVideo = new Map<string, Promise<string>>();
export async function extractYoutubeVideo(videoId: string, startSec: number, endSec: number) {
  const { startSec: start, endSec: end } = validateRange(startSec, endSec);
  if (!validId(videoId)) throw new Error('Invalid YouTube video ID.');
  await fs.mkdir(mediaCacheDir, { recursive: true });
  const key = cacheKey(videoId, start, end);
  const output = path.join(mediaCacheDir, `${key}.mp4`);
  try { const info = await probeMedia(output); if (info.duration > 0 && info.streams.some(s => s.codec_type === 'video')) return output; } catch {}
  let task = pendingVideo.get(key);
  if (!task) {
    task = (async () => {
      const dir = await fs.mkdtemp(path.join(mediaCacheDir, 'video-'));
      try {
        await downloadSection(videoId, start, end, path.join(dir, 'source.%(ext)s'), true);
        const files = await fs.readdir(dir);
        const source = files.find(file => /^source\.(mp4|mkv|webm)$/.test(file));
        if (!source) throw new Error('No video was downloaded.');
        const staged = path.join(dir, 'validated.mp4');
        await runMedia(FFMPEG, ['-y', '-i', path.join(dir, source), '-t', String(end - start), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', staged]);
        const info = await probeMedia(staged);
        if (!(info.duration > 0) || !info.streams.some(s => s.codec_type === 'video')) throw new Error('No valid video was downloaded for this timeframe.');
        await fs.rename(staged, output);
        return output;
      } finally { await fs.rm(dir, { recursive: true, force: true }); }
    })();
    pendingVideo.set(key, task);
    void task.finally(() => pendingVideo.delete(key)).catch(() => {});
  }
  return task;
}
