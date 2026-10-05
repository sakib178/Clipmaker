import './config.ts';
import express, { type Express } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { FFMPEG, runMedia, probeMedia, extractYoutubeOriginalAudio, extractYoutubeVideoId, youtubeFailure } from './media.ts';

export const exportDir = path.join(process.env.CLIP_STUDIO_DATA_DIR || path.join(process.cwd(), 'data'), 'exports');
const audioUploads = new Map<string, { path: string; expires: number }>();
let latestExportId = '';
export function exportPath(id: string) { return /^[a-f\d-]{36}$/.test(id) ? path.join(exportDir, `${id}.mp4`) : ''; }

function numberParam(value: unknown, fallback: number, min: number, max: number) {
  const num = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(num) || num < min || num > max) throw new Error(`Invalid numeric export setting (expected ${min}–${max}).`);
  return num;
}

export function registerExportRoutes(app: Express) {
  app.post('/api/export-audio-temp', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
    let audioPath = '';
    try {
      const buffer = req.body;
      if (!Buffer.isBuffer(buffer) || buffer.length <= 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        return res.status(400).json({ error: 'A valid, non-empty WAV audio file is required.' });
      }
      for (const [token, item] of audioUploads) {
        if (item.expires < Date.now()) { audioUploads.delete(token); await fs.unlink(item.path).catch(() => {}); }
      }
      const audioToken = crypto.randomUUID();
      audioPath = path.join(os.tmpdir(), `clip-audio-${audioToken}.wav`);
      await fs.writeFile(audioPath, buffer);
      const media = await probeMedia(audioPath);
      if (!media.streams.some(stream => stream.codec_type === 'audio') || !(media.duration > 0) || media.duration > 3601) throw new Error('The WAV file has no valid audio track or exceeds 60 minutes.');
      audioUploads.set(audioToken, { path: audioPath, expires: Date.now() + 30 * 60_000 });
      res.json({ audioToken, duration: media.duration });
    } catch (error: any) {
      if (audioPath) await fs.unlink(audioPath).catch(() => {});
      res.status(400).json({ error: error.message || 'Failed to prepare audio for export.' });
    }
  });

  app.delete('/api/export-audio-temp/:token', async (req, res) => {
    const item = audioUploads.get(req.params.token);
    if (item) { audioUploads.delete(req.params.token); await fs.unlink(item.path).catch(() => {}); }
    res.status(204).end();
  });

  app.post('/api/convert-mp4', express.raw({ type: 'application/octet-stream', limit: '200mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty video buffer provided.' });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-export-'));
    const inputPath = path.join(dir, 'input.webm'), outputPath = path.join(dir, 'output.mp4');
    let upload: { path: string; expires: number } | undefined;
    let completed = false;
    try {
      const duration = numberParam(req.query.ytDuration, 30, 0.05, 3600);
      const speed = numberParam(req.query.speedMultiplier, 1, 0.05, 20);
      const volume = numberParam(req.query.volume, 1, 0, 2);
      const fps = numberParam(req.query.fps, 30, 24, 60);
      if (![24, 30, 60].includes(fps)) throw new Error('Choose 24, 30, or 60 FPS.');
      const width = numberParam(req.query.width, 0, 0, 3840), height = numberParam(req.query.height, 0, 0, 3840);
      if ((width && (!height || width % 2)) || (height && (!width || height % 2))) throw new Error('Export dimensions must both be positive even numbers.');
      await fs.writeFile(inputPath, req.body);
      const input = await probeMedia(inputPath);
      if (!input.streams.some(stream => stream.codec_type === 'video')) throw new Error('The recording contains no video track.');

      // The decoded, pre-trimmed WAV is authoritative. Re-downloading first used
      // a different range and could replace working client audio with silence.
      const token = String(req.query.audioToken || '');
      upload = token ? audioUploads.get(token) : undefined;
      let audioPath = '', applyVolume = false;
      if (token && (!upload || upload.expires < Date.now())) return res.status(422).json({ error: 'Export audio is missing or expired. Retry the export to prepare the audio again.' });
      if (upload) {
        const audio = await probeMedia(upload.path);
        if (!audio.streams.some(stream => stream.codec_type === 'audio')) throw new Error('The prepared audio has no audio track.');
        audioPath = upload.path;
      } else if (req.query.videoId) {
        const videoId = extractYoutubeVideoId(String(req.query.videoId));
        if (!videoId) throw new Error('Invalid YouTube video ID.');
        const start = numberParam(req.query.ytStart, 0, 0, Number.MAX_SAFE_INTEGER);
        const extracted = await extractYoutubeOriginalAudio(videoId, start, start + duration);
        if (!extracted) return res.status(422).json({ error: youtubeFailure(videoId) });
        audioPath = extracted.slicedMp3Path;
        applyVolume = true;
      }
      if (!audioPath && req.query.audioRequired !== 'false') return res.status(422).json({ error: 'No original audio is ready for export. Pull the YouTube audio successfully, upload an audio file, or generate a voiceover first.' });

      const stretch = Number.isFinite(input.duration) && input.duration > 0 ? duration / input.duration : speed;
      const dimensions = width && height ? `${width}:${height}` : 'trunc(iw/2)*2:trunc(ih/2)*2';
      const args = ['-y', '-threads', '2', '-i', inputPath];
      if (audioPath) args.push('-i', audioPath);
      args.push('-map', '0:v:0');
      if (audioPath) args.push('-map', '1:a:0', '-af', `${applyVolume ? `volume=${volume},` : ''}apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`, '-c:a', 'aac', '-b:a', '192k');
      else args.push('-an');
      args.push('-vf', `setpts=${stretch}*(PTS-STARTPTS),scale=${dimensions},fps=${fps},tpad=stop_mode=clone:stop_duration=${duration}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-t', String(duration), '-movflags', '+faststart', outputPath);
      await runMedia(FFMPEG, args);
      const output = await probeMedia(outputPath);
      if (!output.streams.some(stream => stream.codec_type === 'video') || (audioPath && !output.streams.some(stream => stream.codec_type === 'audio'))) throw new Error('Export validation failed: the MP4 is missing a required media track.');
      if (!(output.duration > 0) || Math.abs(output.duration - duration) > 0.2) throw new Error('Export validation failed: the MP4 duration does not match the selected clip.');
      const exportId = crypto.randomUUID();
      await fs.mkdir(exportDir, { recursive: true });
      await fs.copyFile(outputPath, exportPath(exportId));
      latestExportId = exportId;
      completed = true;
      const buffer = await fs.readFile(outputPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('X-Clip-Export-Id', exportId);
      res.setHeader('Content-Disposition', `attachment; filename="clip-${exportId}.mp4"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('MP4 export failed:', error.message);
      res.status(500).json({ error: error.message || 'MP4 conversion failed.' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      if (upload && completed) { audioUploads.delete(String(req.query.audioToken)); await fs.unlink(upload.path).catch(() => {}); }
    }
  });

  app.get(['/api/exports/latest.mp4', '/api/n8n/latest-export.mp4'], async (_req, res) => {
    const file = exportPath(latestExportId);
    if (!file) return res.status(404).json({ error: 'Export a clip first.' });
    res.sendFile(file);
  });
  app.get('/api/exports/:id.mp4', async (req, res) => {
    const file = exportPath(req.params.id);
    try { if (!file) throw new Error(); await fs.access(file); } catch { return res.status(404).json({ error: 'Export not found. Export the clip again.' }); }
    res.type('video/mp4').sendFile(file);
  });
}
