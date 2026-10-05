import './server/config.ts';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { pathToFileURL } from 'node:url';
import { FFMPEG, runMedia, probeMedia, extractYoutubeOriginalAudio, extractYoutubeVideo, extractYoutubeVideoId, validateRange, isYoutubePending, youtubeFailure } from './server/media.ts';
import { registerExportRoutes, exportPath } from './server/exports.ts';
export { extractYoutubeVideoId } from './server/media.ts';


const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
export const app = express();

async function waitForMedia<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

async function safeParseResponseJson(res: Response): Promise<any | null> {
  try {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<') || /^<!doctype/i.test(trimmed)) {
      return null;
    }
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function getSafeFileSize(filePath: string): number {
  try {
    if (!filePath || !fs.existsSync(filePath)) return 0;
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

app.use(express.json({ limit: '80mb' }));
app.use(express.urlencoded({ extended: true, limit: '80mb' }));

// Lazy init Gemini AI
function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SUBTITLE_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      start: { type: Type.NUMBER },
      end: { type: Type.NUMBER },
      text: { type: Type.STRING },
      words: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
          },
          required: ['word', 'start', 'end'],
        },
      },
    },
    required: ['id', 'start', 'end', 'text', 'words'],
  },
};

function normalizeSubtitleCues(raw: any[], duration: number): any[] {
  if (!Array.isArray(raw)) throw new Error('The transcription service returned invalid subtitle data.');
  return raw.flatMap((cue, index) => {
    const start = Math.max(0, Number(cue.start)), end = Math.min(duration, Number(cue.end));
    const text = String(cue.text || '').trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start >= duration) return [];
    const tokens = text.split(/\s+/);
    const proportional = tokens.map((word, i) => ({ word, start: start + (end - start) * i / tokens.length, end: start + (end - start) * (i + 1) / tokens.length }));
    const words = Array.isArray(cue.words) && cue.words.length ? cue.words.flatMap((word: any) => {
      const ws = Math.max(start, Number(word.start)), we = Math.min(end, Number(word.end));
      return word.word && Number.isFinite(ws) && Number.isFinite(we) && we > ws ? [{ word: String(word.word), start: ws, end: we }] : [];
    }) : proportional;
    return [{ id: `cue-${index + 1}`, start, end, text, words: words.length ? words : proportional }];
  }).sort((a, b) => a.start - b.start);
}

const TRANSCRIPTION_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-3.8-flash';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts';

async function transcribeDecodedAudio(ai: GoogleGenAI, audio: string, mimeType: string, duration: number, language: string) {
  const target = language === 'en' ? 'English' : language === 'ar' ? 'Arabic' : 'the original spoken language';
  const response = await ai.models.generateContent({
    model: TRANSCRIPTION_MODEL,
    contents: { parts: [
      { inlineData: { mimeType, data: audio.replace(/^data:[^;]+;base64,/, '') } },
      { text: `Transcribe only the speech actually audible in this ${duration}-second audio clip, in ${target}. Return short subtitle cues with word timings, in seconds relative to the beginning of this audio. Listen to the audio to determine all timings. Preserve pauses; do not spread words over silence. Do not invent speech or infer it from a title. If there is no speech return []. Cue and word times must be within 0 and ${duration}.` },
    ] },
    config: { responseMimeType: 'application/json', responseSchema: SUBTITLE_RESPONSE_SCHEMA },
  });
  return normalizeSubtitleCues(JSON.parse(response.text?.trim() || '[]'), duration);
}

async function transcribeAndUnderstandYoutubePortion(ai: GoogleGenAI, videoId: string, start: number, end: number, language = 'auto', _title = '', wav?: string) {
  const extracted = wav ? null : await extractYoutubeOriginalAudio(videoId, start, end, true);
  const audio = wav || extracted?.wavBase64;
  if (!audio) throw new Error(youtubeFailure(videoId));
  const cues = await transcribeDecodedAudio(ai, audio, 'audio/wav', extracted?.duration || end - start, language);
  return { cues, rawTranscript: cues.map(c => c.text).join(' ') };
}

app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType = 'audio/wav', language = 'auto', targetDuration = 30, videoId = '', youtubeUrl = '', startTime = 0, endTime = 30 } = req.body || {};
    const ai = getAI();
    if (!ai) return res.status(503).json({ error: 'Configure GEMINI_API_KEY to transcribe audio. Your existing subtitles have been kept.' });
    const duration = Number(targetDuration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) return res.status(400).json({ error: 'Select an audio clip of at most 60 minutes.' });
    let subtitles: any[];
    if (typeof audioData === 'string' && audioData.length) subtitles = await transcribeDecodedAudio(ai, audioData, mimeType, duration, language);
    else {
      const id = extractYoutubeVideoId(videoId || youtubeUrl);
      if (!id) return res.status(400).json({ error: 'Real audio is required for transcription. Upload audio or pull a YouTube timeframe first.' });
      const { startSec, endSec } = validateRange(startTime, endTime);
      subtitles = (await transcribeAndUnderstandYoutubePortion(ai, id, startSec, endSec, language)).cues;
    }
    return res.json({ subtitles, model: TRANSCRIPTION_MODEL });
  } catch (error: any) { return res.status(502).json({ error: error.message || 'Transcription failed. Your existing subtitles have been kept.' }); }
});

app.post('/api/translate', async (req, res) => {
  try {
    const { subtitles, targetLanguage } = req.body || {};
    if (!Array.isArray(subtitles) || !subtitles.length || !['en', 'ar'].includes(targetLanguage)) return res.status(400).json({ error: 'Provide subtitle cues and choose English or Arabic.' });
    const ai = getAI();
    if (!ai) return res.status(503).json({ error: 'Configure GEMINI_API_KEY to translate subtitles. Your original text has been kept.' });
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Translate each subtitle into ${targetLanguage === 'ar' ? 'Arabic' : 'English'}. Keep exactly the same IDs, start and end times. Redistribute translated word timings within each original cue. Return the JSON subtitle array.\n${JSON.stringify(subtitles)}`,
      config: { responseMimeType: 'application/json', responseSchema: SUBTITLE_RESPONSE_SCHEMA },
    });
    const parsed = JSON.parse(response.text?.trim() || '[]');
    if (!Array.isArray(parsed) || parsed.length !== subtitles.length) throw new Error('Translation did not return all subtitle cues.');
    const translated = subtitles.map((cue: any) => {
      const result = parsed.find((item: any) => item.id === cue.id);
      if (!result?.text?.trim()) throw new Error('Translation returned an incomplete cue.');
      const tokens = result.text.trim().split(/\s+/);
      return { ...cue, text: result.text.trim(), words: tokens.map((word: string, i: number) => ({ word, start: cue.start + (cue.end - cue.start) * i / tokens.length, end: cue.start + (cue.end - cue.start) * (i + 1) / tokens.length })) };
    });
    return res.json({ subtitles: translated, model: TEXT_MODEL });
  } catch (error: any) { return res.status(502).json({ error: error.message || 'Translation failed. Your original subtitles have been kept.' }); }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, subtitles, voiceName = 'Kore' } = req.body;
    const ai = getAI();
    if (!ai) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const spokenText =
      text ||
      (Array.isArray(subtitles)
        ? subtitles
            .map((c: any) => c.text)
            .filter(Boolean)
            .join('. ')
        : '');

    if (!spokenText.trim()) {
      return res.status(400).json({ error: 'No text provided for speech synthesis' });
    }

    if (spokenText.length > 12000) return res.status(400).json({ error: 'Voiceover text is too long. Use at most 12,000 characters.' });
    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: spokenText,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const inlineData = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
    if (!inlineData?.data) {
      return res.status(500).json({ error: 'No audio data returned from TTS model' });
    }

    // Ensure returned audioBase64 has a valid 44-byte RIFF WAVE header so decodeAudioData never fails
    const rawPcmBuf = Buffer.from(inlineData.data, 'base64');
    let finalWavBase64 = inlineData.data;
    if (rawPcmBuf.length > 4 && rawPcmBuf.toString('ascii', 0, 4) !== 'RIFF') {
      const sampleRate = 24000;
      const numChannels = 1;
      const bytesPerSample = 2;
      const dataLen = rawPcmBuf.length - (rawPcmBuf.length % 2);
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + dataLen, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(numChannels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
      header.writeUInt16LE(numChannels * bytesPerSample, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataLen, 40);
      finalWavBase64 = Buffer.concat([header, rawPcmBuf.subarray(0, dataLen)]).toString('base64');
    }

    return res.json({
      audioBase64: finalWavBase64,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate AI voiceover' });
  }
});

// Background Prefetch API: starts resolving & caching the YouTube audio stream as soon as the user pastes a link
app.post('/api/youtube/prefetch', async (req, res) => {
  const { url, videoId: rawVideoId } = req.body || {};
  const videoId = extractYoutubeVideoId(rawVideoId || url || '');
  if (!videoId) {
    return res.status(400).json({ ok: false });
  }
  const alreadyCached = isYoutubePending(videoId);
  if (!alreadyCached) {
    try { validateRange(req.body.startTime ?? 0, req.body.endTime ?? 60); } catch (error: any) { return res.status(400).json({ error: error.message }); }
    extractYoutubeOriginalAudio(videoId, Number(req.body.startTime) || 0, Number(req.body.endTime) || 60).catch(() => {});
  }
  return res.json({ ok: true, videoId, cached: alreadyCached });
});

// YouTube Metadata, Real Original Audio Extraction & Optional Subtitle Extraction API
app.get('/api/youtube/video', async (req, res) => {
  try {
    const id = extractYoutubeVideoId(String(req.query.videoId || ''));
    if (!id) return res.status(400).json({ error: 'Valid YouTube video ID is required.' });
    const { startSec, endSec } = validateRange(req.query.startTime ?? 0, req.query.endTime ?? 30);
    res.type('video/mp4').sendFile(await extractYoutubeVideo(id, startSec, endSec));
  } catch (error: any) { res.status(502).json({ error: error.message || 'The YouTube background video could not be downloaded.' }); }
});

app.post('/api/youtube/info', async (req, res) => {
  try {
    const { url, startTime = 0, endTime = 30, language = 'auto', autoTranscribe = false } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        error:
          'Invalid YouTube URL. Please provide a valid YouTube video, Shorts, or share link (e.g. youtube.com/watch?v=... or youtu.be/...)',
      });
    }

    let title = `YouTube Video (${videoId})`;
    let author = 'YouTube Creator';
    let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const { startSec: start, endSec: end } = validateRange(startTime, endTime);

    // Cap synchronous wait so /api/youtube/info never triggers proxy/gateway HTML timeouts.
    // If a very long uncached video takes longer than fastWaitMs, ensureYoutubeSourceAudioFile
    // continues in the background (inFlightYoutubeDownloads) and the client picks it up automatically.
    const fastWaitMs = autoTranscribe ? 18000 : 11000;
    const extractionPromise = extractYoutubeOriginalAudio(
      videoId,
      start,
      end,
      Boolean(autoTranscribe)
    );

    const [, extractedAudio] = await Promise.all([
      (async () => {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
            {
              signal: AbortSignal.timeout(4000),
            }
          );
          if (oembedRes.ok) {
            const oembedData = await safeParseResponseJson(oembedRes);
            if (oembedData?.title) title = oembedData.title;
            if (oembedData?.author_name) author = oembedData.author_name;
            if (oembedData?.thumbnail_url) thumbnail = oembedData.thumbnail_url;
            return;
          }
        } catch (e) {
          console.warn('oEmbed fetch error:', e);
        }
        try {
          const noembedRes = await fetch(
            `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (noembedRes.ok) {
            const noembedData = await safeParseResponseJson(noembedRes);
            if (noembedData?.title) title = noembedData.title;
            if (noembedData?.author_name) author = noembedData.author_name;
            if (noembedData?.thumbnail_url) thumbnail = noembedData.thumbnail_url;
          }
        } catch {}
      })(),
      waitForMedia(extractionPromise, fastWaitMs),
    ]);

    const duration = extractedAudio?.duration || end - start;
    const effectiveEnd = Number((start + duration).toFixed(2));

    let subtitles: any[] | null = null;
    let rawTranscript = '';
    let warning = '';
    if (autoTranscribe) {
      const ai = getAI();
      if (ai) {
        try {
        const ytResult = await transcribeAndUnderstandYoutubePortion(
          ai,
          videoId,
          start,
          effectiveEnd,
          language,
          title,
          extractedAudio?.wavBase64
        );
        if (ytResult) {
          subtitles = ytResult.cues;
          rawTranscript = ytResult.rawTranscript;
        }
        } catch (error: any) { warning = error.message || 'Audio pulled; optional transcription failed.'; }
      } else { warning = 'Audio pulled. Configure GEMINI_API_KEY for optional transcription.'; }
    }

    return res.json({
      videoId,
      title,
      author,
      thumbnail,
      startTime: start,
      endTime: effectiveEnd,
      duration,
      audioBase64: extractedAudio?.mp3Base64 || null,
      audioMimeType: 'audio/mpeg',
      warmingUp: !extractedAudio && isYoutubePending(videoId),
      subtitles: subtitles || [],
      rawTranscript,
      warning,
      pipeline: {
        transcriptionModel: TRANSCRIPTION_MODEL,
        understandingModel: TEXT_MODEL,
      },
      embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=1&rel=0&playsinline=1&start=${Math.floor(
        start
      )}&end=${Math.ceil(effectiveEnd)}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to process YouTube link' });
  }
});

// Dedicated Original YouTube Audio Segment Extractor API (for trim updates & direct export)
// Note: Never returns HTTP 502/503/504 because Nginx intercepts 502/503/504 with warmup.html (<!doctype html>)
app.post('/api/youtube/audio', async (req, res) => {
  try {
    const { videoId: rawVideoId, url, startTime = 0, endTime = 30 } = req.body || {};
    const videoId = extractYoutubeVideoId(rawVideoId || url || '');
    if (!videoId) {
      return res.status(400).json({ ok: false, error: 'Valid YouTube videoId or URL is required' });
    }

    const { startSec: start, endSec: end } = validateRange(startTime, endTime);

    const extracted = await waitForMedia(extractYoutubeOriginalAudio(videoId, start, end, false), 12000);

    if (!extracted) {
      return res.status(200).json({
        ok: false,
        warmingUp: isYoutubePending(videoId),
        videoId,
        audioBase64: null,
        error: isYoutubePending(videoId) ? 'The original audio is still being downloaded.' : youtubeFailure(videoId),
      });
    }

    return res.json({
      ok: true,
      videoId,
      startTime: start,
      endTime: start + extracted.duration,
      duration: extracted.duration,
      audioBase64: extracted.mp3Base64,
      mimeType: 'audio/mpeg',
    });
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      audioBase64: null,
      error: error.message || 'Failed to extract YouTube audio',
    });
  }
});

registerExportRoutes(app);

// ==================== PERSISTENT EXTERNAL ACCOUNTS & INTEGRATIONS STORE ====================
interface StoredIntegrationsState {
  canva: {
    connected: boolean;
    accountName: string;
    email: string;
    workspaceName: string;
    authMethod: 'oauth' | 'api_token' | 'workspace_link';
    accessToken?: string;
    clientId?: string;
    refreshToken?: string;
    expiresAt?: number;
    connectedAt?: string;
    designs: {
      id: string;
      title: string;
      aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
      previewUrl: string;
      mediaUrl: string;
      mediaType: 'image' | 'video' | 'gradient';
      canvaEditUrl?: string;
      updatedAt: string;
      exportable?: boolean;
    }[];
    latestSyncedBackground?: {
      src: string;
      type: 'image' | 'video' | 'gradient';
      name: string;
      canvaDesignUrl?: string;
      updatedAt: number;
    } | null;
  };
  n8n: {
    webhookUrl: string;
    authHeaderName: string;
    authHeaderValue: string;
    lastTestedAt?: string;
    lastTestStatus?: string;
    executions: any[];
  };
  socialAccounts: {
    id: string;
    name: string;
    handle: string;
    connected: boolean;
    enabledForPost: boolean;
    authMethod?: 'oauth' | 'api_token' | 'n8n_credential';
    credentialName?: string;
    connectedAt?: string;
  }[];
}

const INTEGRATIONS_FILE_PATH = path.join(process.env.CLIP_STUDIO_DATA_DIR || path.join(process.cwd(), 'data'), 'integrations.json');

const DEFAULT_CANVA_DESIGNS: StoredIntegrationsState['canva']['designs'] = [
  {
    id: 'canva-dsn-916-obsidian',
    title: 'Canva Dark Studio Reel Backdrop (9:16)',
    aspectRatio: '9:16',
    previewUrl: 'linear-gradient(160deg, #09090b 0%, #1e1b4b 55%, #09090b 100%)',
    mediaUrl: 'linear-gradient(160deg, #09090b 0%, #1e1b4b 55%, #09090b 100%)',
    mediaType: 'gradient',
    canvaEditUrl: 'https://www.canva.com/create/instagram-reels/',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'canva-dsn-916-emerald',
    title: 'Canva Emerald Executive Frame (9:16)',
    aspectRatio: '9:16',
    previewUrl: 'linear-gradient(160deg, #022c22 0%, #09090b 65%, #064e3b 100%)',
    mediaUrl: 'linear-gradient(160deg, #022c22 0%, #09090b 65%, #064e3b 100%)',
    mediaType: 'gradient',
    canvaEditUrl: 'https://www.canva.com/create/instagram-reels/',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'canva-dsn-169-youtube',
    title: 'Canva Cinema Wide Stage (16:9)',
    aspectRatio: '16:9',
    previewUrl: 'linear-gradient(135deg, #09090b 0%, #172554 50%, #020617 100%)',
    mediaUrl: 'linear-gradient(135deg, #09090b 0%, #172554 50%, #020617 100%)',
    mediaType: 'gradient',
    canvaEditUrl: 'https://www.canva.com/create/youtube-videos/',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'canva-dsn-11-square',
    title: 'Canva Minimalist Feed Card (1:1)',
    aspectRatio: '1:1',
    previewUrl: 'linear-gradient(135deg, #18181b 0%, #27272a 50%, #09090b 100%)',
    mediaUrl: 'linear-gradient(135deg, #18181b 0%, #27272a 50%, #09090b 100%)',
    mediaType: 'gradient',
    canvaEditUrl: 'https://www.canva.com/create/instagram-posts/',
    updatedAt: new Date().toISOString(),
  },
];

function loadIntegrationsState(): StoredIntegrationsState {
  try {
    if (fs.existsSync(INTEGRATIONS_FILE_PATH)) {
      const raw = fs.readFileSync(INTEGRATIONS_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load integrations state:', e);
  }

  return {
    canva: {
      connected: false,
      accountName: process.env.CANVA_ACCOUNT_NAME || '',
      email: process.env.CANVA_ACCOUNT_EMAIL || '',
      workspaceName: process.env.CANVA_WORKSPACE_NAME || 'Personal Canva Studio',
      authMethod: process.env.CANVA_ACCESS_TOKEN ? 'api_token' : 'workspace_link',
      accessToken: process.env.CANVA_ACCESS_TOKEN || '',
      clientId: process.env.CANVA_CLIENT_ID || '',
      designs: DEFAULT_CANVA_DESIGNS,
      latestSyncedBackground: null,
    },
    n8n: {
      webhookUrl: process.env.N8N_WEBHOOK_URL || '',
      authHeaderName: process.env.N8N_AUTH_HEADER_NAME || '',
      authHeaderValue: process.env.N8N_AUTH_HEADER_VALUE || '',
      executions: [],
    },
    socialAccounts: [
      {
        id: 'tiktok',
        name: 'TikTok',
        handle: '@tiktok_creator',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'instagram',
        name: 'Instagram Reels',
        handle: '@instagram_reels',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'youtube_shorts',
        name: 'YouTube Shorts',
        handle: '@youtube_shorts',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'x_twitter',
        name: 'X (Twitter)',
        handle: '@x_creator',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'facebook_reels',
        name: 'Facebook Reels',
        handle: '@facebook_page',
        connected: false,
        enabledForPost: false,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn Video',
        handle: '@linkedin_profile',
        connected: false,
        enabledForPost: false,
      },
    ],
  };
}

function saveIntegrationsState(state: StoredIntegrationsState) {
  try {
    fs.mkdirSync(path.dirname(INTEGRATIONS_FILE_PATH), { recursive: true });
    fs.writeFileSync(INTEGRATIONS_FILE_PATH + '.tmp', JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(INTEGRATIONS_FILE_PATH + '.tmp', INTEGRATIONS_FILE_PATH);
  } catch (e) {
    throw new Error('Could not save integration settings. Check that CLIP_STUDIO_DATA_DIR is writable.');
  }
}

let integrationsState = loadIntegrationsState();

// Get all integration statuses (Canva, n8n, Social Accounts)
app.get(['/api/integrations', '/api/integrations/status'], (_req, res) => {
  const { accessToken, refreshToken, expiresAt, ...safeCanva } = integrationsState.canva;
  return res.json({
    canva: {
      ...safeCanva,
      accessTokenPreview: accessToken ? 'Configured on server' : undefined,
    },
    n8n: { ...integrationsState.n8n, authHeaderValue: undefined, hasAuthHeaderValue: Boolean(integrationsState.n8n.authHeaderValue) },
    socialAccounts: integrationsState.socialAccounts,
  });
});

function safeCanvaState() {
  const { accessToken, refreshToken, expiresAt, ...state } = integrationsState.canva;
  return { ...state, accessTokenPreview: accessToken ? 'Configured on server' : undefined };
}

async function canvaRequest(endpoint: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`https://api.canva.com/rest/v1/${endpoint}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error?.message || `Canva request failed (HTTP ${response.status}). Check the access token and required scopes.`);
  return data;
}

async function connectVerifiedCanva(token: string, settings: any = {}, oauth: any = {}) {
  if (!token?.trim()) throw new Error('Provide a Canva access token or use OAuth after configuring CANVA_CLIENT_ID and CANVA_CLIENT_SECRET. Manual Canva file imports work without a connection.');
  const profile = await canvaRequest('users/me/profile', token.trim());
  const library = await canvaRequest('designs', token.trim());
  const designs = (library.items || []).slice(0, 24).map((design: any) => ({
    id: design.id, title: design.title || 'Canva Design', aspectRatio: '9:16' as const,
    previewUrl: design.thumbnail?.url || '', mediaUrl: '', mediaType: 'image' as const,
    canvaEditUrl: design.urls?.edit_url || design.urls?.view_url, updatedAt: new Date().toISOString(), exportable: true,
  }));
  integrationsState.canva = { ...integrationsState.canva, connected: true, accountName: profile.profile?.display_name || settings.accountName || 'Canva User',
    email: String(settings.email || ''), workspaceName: String(settings.workspaceName || 'Canva Workspace'), authMethod: oauth.refreshToken ? 'oauth' : 'api_token',
    accessToken: token.trim(), refreshToken: oauth.refreshToken, expiresAt: oauth.expiresAt,
    connectedAt: new Date().toISOString(), designs: [...designs, ...integrationsState.canva.designs.filter(design => !design.exportable)].slice(0, 36) };
  saveIntegrationsState(integrationsState);
  return safeCanvaState();
}

async function canvaAccessToken() {
  const state = integrationsState.canva;
  if (!state.accessToken) throw new Error('Connect a Canva account first.');
  if (state.expiresAt && state.expiresAt <= Date.now() + 60_000) {
    if (!state.refreshToken || !process.env.CANVA_CLIENT_ID || !process.env.CANVA_CLIENT_SECRET) throw new Error('The Canva token expired. Reconnect your account.');
    const response = await fetch('https://api.canva.com/rest/v1/oauth/token', { method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: state.refreshToken }), signal: AbortSignal.timeout(15_000) });
    const data: any = await response.json();
    if (!response.ok || !data.access_token) throw new Error('Could not refresh the Canva token. Reconnect your account.');
    state.accessToken = data.access_token; state.refreshToken = data.refresh_token || state.refreshToken; state.expiresAt = Date.now() + Number(data.expires_in) * 1000;
    saveIntegrationsState(integrationsState);
  }
  return state.accessToken!;
}

app.post(['/api/canva/connect', '/api/integrations/canva/connect'], async (req, res) => {
  try { res.json({ success: true, canva: await connectVerifiedCanva(String(req.body?.accessToken || ''), req.body) }); }
  catch (error: any) { res.status(400).json({ error: error.message || 'Canva connection failed.' }); }
});

app.post('/api/canva/export', async (req, res) => {
  try {
    const designId = String(req.body?.designId || ''), format = req.body?.format === 'mp4' ? 'mp4' : 'png';
    if (!/^[a-zA-Z0-9_-]+$/.test(designId)) return res.status(400).json({ error: 'A valid Canva design is required.' });
    const token = await canvaAccessToken();
    let { job } = await canvaRequest('exports', token, { method: 'POST', body: JSON.stringify({ design_id: designId, format: { type: format } }) });
    for (let attempt = 0; attempt < 30 && job?.status === 'in_progress'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      ({ job } = await canvaRequest(`exports/${encodeURIComponent(job.id)}`, token));
    }
    if (job?.status !== 'success' || !job.urls?.[0]) throw new Error(job?.error?.message || 'Canva export did not complete. Retry or import the downloaded Canva export.');
    const media = await fetch(job.urls[0], { signal: AbortSignal.timeout(30_000) });
    if (!media.ok) throw new Error('Could not download the exported Canva design.');
    const bytes = Buffer.from(await media.arrayBuffer());
    if (bytes.length > 80 * 1024 * 1024) throw new Error('Canva export exceeds 80 MB. Download and import it as a file.');
    res.type(format === 'mp4' ? 'video/mp4' : 'image/png').send(bytes);
  } catch (error: any) { res.status(502).json({ error: error.message || 'Canva export failed.' }); }
});

// Disconnect Canva Account
app.post(['/api/canva/disconnect', '/api/integrations/canva/disconnect'], (_req, res) => {
  integrationsState.canva = {
    connected: false,
    accountName: '',
    email: '',
    workspaceName: '',
    authMethod: 'workspace_link',
    accessToken: '',
    designs: DEFAULT_CANVA_DESIGNS,
    latestSyncedBackground: null,
  };
  saveIntegrationsState(integrationsState);
  return res.json({ success: true, canva: integrationsState.canva });
});

// Add or Save a Canva Design to the connected Canva workspace library
app.post(['/api/canva/designs', '/api/integrations/canva/designs'], (req, res) => {
  const {
    title = 'Custom Canva Background',
    aspectRatio = '9:16',
    mediaUrl = '',
    previewUrl = '',
    mediaType = 'image',
    canvaEditUrl = 'https://www.canva.com/',
  } = req.body || {};

  const resolvedUrl = mediaUrl || previewUrl || 'linear-gradient(135deg, #09090b 0%, #1e1b4b 55%, #09090b 100%)';
  const newItem = {
    id: `canva-dsn-${Date.now()}`,
    title: String(title).trim() || 'Canva Design',
    aspectRatio: (['9:16', '16:9', '1:1', '4:5'].includes(aspectRatio) ? aspectRatio : '9:16') as any,
    previewUrl: previewUrl || resolvedUrl,
    mediaUrl: resolvedUrl,
    mediaType: (['image', 'video', 'gradient'].includes(mediaType) ? mediaType : 'image') as any,
    canvaEditUrl,
    updatedAt: new Date().toISOString(),
  };

  integrationsState.canva.designs = [
    newItem,
    ...(integrationsState.canva.designs || DEFAULT_CANVA_DESIGNS),
  ].slice(0, 24);
  integrationsState.canva.latestSyncedBackground = {
    src: newItem.mediaUrl,
    type: newItem.mediaType,
    name: `Canva: ${newItem.title}`,
    canvaDesignUrl: newItem.canvaEditUrl,
    updatedAt: Date.now(),
  };
  saveIntegrationsState(integrationsState);

  return res.json({
    success: true,
    design: newItem,
    designs: integrationsState.canva.designs,
    latestSyncedBackground: integrationsState.canva.latestSyncedBackground,
  });
});

// Get latest synced background from separate Canva window
app.get('/api/canva/latest-background', (_req, res) => {
  return res.json({
    latestSyncedBackground: integrationsState.canva.latestSyncedBackground || null,
    designs: integrationsState.canva.designs || DEFAULT_CANVA_DESIGNS,
  });
});

const pendingCanvaOAuth = new Map<string, { verifier: string; origin: string; redirect: string; expires: number }>();
function safeScriptJson(value: any) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

app.get('/api/oauth/url', (req, res) => {
  if (req.query.provider && req.query.provider !== 'canva') return res.status(400).json({ error: 'Social OAuth is managed by your n8n credentials. Map the credential in the social account form.' });
  if (!process.env.CANVA_CLIENT_ID || !process.env.CANVA_CLIENT_SECRET) return res.status(503).json({ error: 'Configure CANVA_CLIENT_ID and CANVA_CLIENT_SECRET for Canva OAuth, or import a Canva export file.' });
  const origin = new URL(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).origin;
  const redirect = process.env.CANVA_REDIRECT_URI || `${origin}/auth/callback`;
  const state = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(48).toString('base64url');
  for (const [key, item] of pendingCanvaOAuth) if (item.expires < Date.now()) pendingCanvaOAuth.delete(key);
  pendingCanvaOAuth.set(state, { verifier, origin, redirect, expires: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({ client_id: process.env.CANVA_CLIENT_ID, redirect_uri: redirect, response_type: 'code',
    scope: 'design:content:read design:meta:read profile:read', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  res.json({ url: `https://www.canva.com/api/oauth/authorize?${params}`, provider: 'canva', mode: 'oauth_provider' });
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const state = String(req.query.state || ''), pending = pendingCanvaOAuth.get(state);
  pendingCanvaOAuth.delete(state);
  if (!pending || pending.expires < Date.now() || !req.query.code || req.query.error) return res.status(400).send('Canva authorization was cancelled, expired, or invalid. Return to Clip Studio and reconnect.');
  try {
    const response = await fetch('https://api.canva.com/rest/v1/oauth/token', { method: 'POST', headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), code_verifier: pending.verifier, redirect_uri: pending.redirect }), signal: AbortSignal.timeout(15_000) });
    const token: any = await response.json();
    if (!response.ok || !token.access_token) throw new Error('Canva authorization code exchange failed.');
    const canva = await connectVerifiedCanva(token.access_token, {}, { refreshToken: token.refresh_token, expiresAt: Date.now() + Number(token.expires_in) * 1000 });
    res.send(`<!doctype html><meta charset="utf-8"><title>Canva connected</title><p>Canva connected. Return to Clip Studio.</p><script>window.opener?.postMessage(${safeScriptJson({ type: 'CANVA_OAUTH_SUCCESS', canva })}, ${safeScriptJson(pending.origin)});window.close();</script>`);
  } catch (error: any) { res.status(502).send(escapeHtml(error.message || 'Canva connection failed.')); }
});

app.get(['/auth/connect-window', '/api/oauth/:provider/start'], (_req, res) => {
  res.status(400).send('<meta charset="utf-8"><title>Connect through n8n</title><p>Authenticate your social account in n8n, then enter that credential name in the Clip Studio social account form. Canva accounts use the Canva OAuth button or a valid access token.</p>');
});

// Standalone Separate-Window Canva Background Editor & Bridge
app.get('/canva-studio-window', (req, res) => {
  const rawRatio = String(req.query.aspectRatio || req.query.ratio || '9:16');
  const ratio = ['9:16', '16:9', '1:1', '4:5'].includes(rawRatio) ? rawRatio : '9:16';
  const designUrl = String(req.query.designUrl || '');
  const canvaTargetUrl =
    designUrl && /^https?:\/\//i.test(designUrl)
      ? designUrl
      : ratio === '16:9'
      ? 'https://www.canva.com/create/youtube-videos/'
      : ratio === '1:1'
      ? 'https://www.canva.com/create/instagram-posts/'
      : 'https://www.canva.com/create/instagram-reels/';

  return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Canva Background Studio (${ratio}) — Separate Window Editor</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; min-height: 100vh; }
    header { padding: 12px 20px; background: #18181b; border-bottom: 1px solid #27272a; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 14px; }
    .badge { background: rgba(6,182,212,0.15); color: #67e8f9; border: 1px solid rgba(6,182,212,0.3); padding: 2px 8px; border-radius: 6px; font-size: 11px; }
    .main { flex: 1; display: grid; grid-template-columns: 1fr 340px; gap: 20px; padding: 20px; max-width: 1200px; margin: 0 auto; width: 100%; }
    @media (max-width: 800px) { .main { grid-template-columns: 1fr; } }
    .canvas-stage { background: #121215; border: 1px solid #27272a; border-radius: 20px; display: flex; align-items: center; justify-content: center; padding: 20px; min-height: 420px; }
    canvas { max-width: 100%; max-height: 72vh; border-radius: 12px; box-shadow: 0 20px 45px rgba(0,0,0,0.7); border: 1px solid #3f3f46; }
    .sidebar { background: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
    label { display: block; font-size: 11px; font-weight: 700; color: #d4d4d8; margin-bottom: 6px; }
    input[type="color"] { width: 100%; height: 36px; border: 1px solid #3f3f46; border-radius: 8px; background: #09090b; cursor: pointer; }
    input[type="text"], input[type="file"] { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #3f3f46; background: #09090b; color: #fff; font-size: 12px; }
    .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .preset-btn { padding: 10px; border-radius: 10px; border: 1px solid #3f3f46; color: #fff; font-size: 11px; font-weight: 700; cursor: pointer; text-align: left; }
    .btn-primary { width: 100%; padding: 12px; border: none; border-radius: 12px; background: linear-gradient(90deg, #06b6d4, #4f46e5); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; }
    .btn-external { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 10px; background: #27272a; color: #67e8f9; text-decoration: none; font-size: 12px; font-weight: 700; border: 1px solid rgba(6,182,212,0.3); }
    #status { font-size: 12px; color: #34d399; font-weight: 600; min-height: 18px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>Canva Background Studio — Separate Window</span>
      <span class="badge">${ratio} Aspect Ratio</span>
    </div>
    <a href="${escapeHtml(canvaTargetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-external">
      Launch Canva.com Web Editor ↗
    </a>
  </header>
  <div class="main">
    <div class="canvas-stage">
      <canvas id="bgCanvas" width="${ratio === '16:9' ? 1280 : 720}" height="${ratio === '16:9' ? 720 : ratio === '1:1' ? 720 : ratio === '4:5' ? 900 : 1280}"></canvas>
    </div>
    <div class="sidebar">
      <div>
        <label>Quick Studio Gradient Presets</label>
        <div class="presets">
          <button class="preset-btn" style="background: linear-gradient(135deg,#09090b,#1e1b4b)" onclick="setColors('#09090b','#1e1b4b','#020617')">Midnight Indigo</button>
          <button class="preset-btn" style="background: linear-gradient(135deg,#022c22,#064e3b)" onclick="setColors('#022c22','#09090b','#065f46')">Emerald Executive</button>
          <button class="preset-btn" style="background: linear-gradient(135deg,#2e1065,#4c1d95)" onclick="setColors('#09090b','#3b0764','#1e1b4b')">Royal Velvet</button>
          <button class="preset-btn" style="background: linear-gradient(135deg,#450a0a,#18181b)" onclick="setColors('#09090b','#450a0a','#18181b')">Crimson Noir</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div><label>Top Color</label><input type="color" id="c1" value="#09090b" oninput="draw()" /></div>
        <div><label>Mid Color</label><input type="color" id="c2" value="#1e1b4b" oninput="draw()" /></div>
        <div><label>Bottom Color</label><input type="color" id="c3" value="#020617" oninput="draw()" /></div>
      </div>
      <div>
        <label>Overlay Image / Canva Export File</label>
        <input type="file" id="imgInput" accept="image/*" onchange="loadImage(event)" />
      </div>
      <div>
        <label>Background Title / Label</label>
        <input type="text" id="bgTitle" value="Canva Custom Background (${ratio})" />
      </div>
      <button class="btn-primary" onclick="applyToClipStudio()">✓ Apply Background to Clip Studio Player</button>
      <div id="status"></div>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');
    let loadedImg = null;

    function setColors(a, b, c) {
      document.getElementById('c1').value = a;
      document.getElementById('c2').value = b;
      document.getElementById('c3').value = c;
      loadedImg = null;
      draw();
    }

    function loadImage(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => { loadedImg = img; draw(); };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }

    function draw() {
      const W = canvas.width, H = canvas.height;
      if (loadedImg) {
        const r = Math.max(W / loadedImg.width, H / loadedImg.height);
        const dw = loadedImg.width * r, dh = loadedImg.height * r;
        ctx.drawImage(loadedImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, document.getElementById('c1').value);
        g.addColorStop(0.5, document.getElementById('c2').value);
        g.addColorStop(1, document.getElementById('c3').value);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    draw();

    async function applyToClipStudio() {
      const dataUrl = canvas.toDataURL('image/png');
      const title = document.getElementById('bgTitle').value || 'Canva Studio Background';
      let savedDesigns = null;
      try {
        const res = await fetch('/api/integrations/canva/designs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            aspectRatio: ${JSON.stringify(ratio)},
            mediaUrl: dataUrl,
            previewUrl: dataUrl,
            mediaType: 'image',
          }),
        });
        const data = await res.json();
        if (data && Array.isArray(data.designs)) {
          savedDesigns = data.designs;
        }
      } catch (e) {}

      if (window.opener) {
        window.opener.postMessage({
          type: 'CANVA_STUDIO_EXPORT',
          dataUrl,
          title
        }, window.location.origin);
        if (savedDesigns) {
          window.opener.postMessage({
            type: 'CANVA_DESIGN_SAVED',
            designs: savedDesigns
          }, window.location.origin);
        }
      }
      try {
        const bc = new BroadcastChannel('clip_studio_canva_bridge');
        bc.postMessage({ type: 'CANVA_STUDIO_EXPORT', dataUrl, title });
      } catch (e) {}

      document.getElementById('status').textContent = '✓ Sent to Clip Studio Player! You can close this window or keep editing.';
    }
  </script>
</body>
</html>`);
});

// Connect or Disconnect a Social Media Account for n8n Auto-Posting
app.post(['/api/accounts/connect', '/api/integrations/social/connect'], (req, res) => {
  const {
    id,
    handle = '',
    authMethod = 'n8n_credential',
    credentialName = '',
  } = req.body || {};

  if (!integrationsState.socialAccounts.some(account => account.id === id)) return res.status(400).json({ error: 'Choose a supported social platform.' });
  if (authMethod === 'api_token') return res.status(400).json({ error: 'Store platform API tokens in n8n, then map the n8n credential name here.' });
  if (!String(credentialName).trim()) return res.status(400).json({ error: 'Enter the credential name configured in n8n.' });

  integrationsState.socialAccounts = integrationsState.socialAccounts.map((acc) => {
    if (acc.id !== id) return acc;
    const cleanHandle = handle.trim()
      ? handle.trim().startsWith('@')
        ? handle.trim()
        : `@${handle.trim()}`
      : acc.handle;
    return {
      ...acc,
      handle: cleanHandle,
      connected: true,
      enabledForPost: true,
      authMethod: 'n8n_credential',
      credentialName: credentialName.trim() || `n8n_${id}_oauth2`,
      connectedAt: new Date().toISOString(),
    };
  });

  saveIntegrationsState(integrationsState);
  return res.json({
    success: true,
    accounts: integrationsState.socialAccounts,
  });
});

app.post(['/api/accounts/disconnect', '/api/integrations/social/disconnect'], (req, res) => {
  const { id } = req.body || {};
  integrationsState.socialAccounts = integrationsState.socialAccounts.map((acc) =>
    acc.id === id
      ? { ...acc, connected: false, enabledForPost: false, connectedAt: undefined }
      : acc
  );
  saveIntegrationsState(integrationsState);
  return res.json({
    success: true,
    accounts: integrationsState.socialAccounts,
  });
});

// Save n8n Webhook Configuration
app.post('/api/integrations/n8n/config', (req, res) => {
  const { webhookUrl = '', authHeaderName = '', authHeaderValue = '' } = req.body || {};
  try { if (webhookUrl) webhookUrlCheck(String(webhookUrl), true); } catch (error: any) { return res.status(400).json({ error: error.message }); }
  integrationsState.n8n.webhookUrl = String(webhookUrl).trim();
  integrationsState.n8n.authHeaderName = String(authHeaderName).trim();
  if (authHeaderValue) integrationsState.n8n.authHeaderValue = String(authHeaderValue).trim();
  else if (!authHeaderName) integrationsState.n8n.authHeaderValue = '';
  saveIntegrationsState(integrationsState);
  return res.json({
    success: true,
    n8n: { ...integrationsState.n8n, authHeaderValue: undefined, hasAuthHeaderValue: Boolean(integrationsState.n8n.authHeaderValue) },
  });
});

// Built-in Local n8n Webhook Endpoint Receiver (so n8n webhook calls work out-of-the-box & can be tested live)
function webhookUrlCheck(value: unknown, allowPreview = false) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Configure the production webhook URL from your n8n workflow.');
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a valid HTTP or HTTPS n8n webhook URL.');
  if (!allowPreview && url.pathname === '/api/n8n/webhook/clip-studio-autopost') throw new Error('The built-in receiver is for testing only. Configure a real n8n workflow webhook for publishing.');
  return url.toString();
}
function webhookHeaders(name: string, value: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (name && value) headers.set(name, value);
  return headers;
}
app.post('/api/n8n/webhook/clip-studio-autopost', (req, res) => {
  res.json({ status: 'preview_only', receivedEvent: req.body?.event, message: 'Payload received for testing. This local receiver does not publish to social platforms.' });
});

app.post('/api/n8n/test-webhook', async (req, res) => {
  try {
    const config = req.body || {};
    const targetUrl = webhookUrlCheck(config.webhookUrl || integrationsState.n8n.webhookUrl, true);
    const start = Date.now();
    const response = await fetch(targetUrl, { method: 'POST', headers: webhookHeaders(config.authHeaderName || integrationsState.n8n.authHeaderName, config.authHeaderValue || integrationsState.n8n.authHeaderValue),
      body: JSON.stringify({ event: 'clip_studio.webhook_test', timestamp: new Date().toISOString(), targetAccounts: [] }), signal: AbortSignal.timeout(8000) });
    const text = (await response.text()).slice(0, 400);
    res.status(response.ok ? 200 : 502).json({ ok: response.ok, success: response.ok, status: response.status, latencyMs: Date.now() - start, targetUrl, responseText: text });
  } catch (error: any) { res.status(400).json({ ok: false, success: false, error: error.message || 'Could not reach the n8n webhook.' }); }
});

// n8n AI Viral Caption & Hashtag Generator (powered by Gemini 3.8 Flash)
app.post('/api/n8n/generate-caption', async (req, res) => {
  try {
    const { subtitles = [], clipTitle = '', language = 'en' } = req.body;
    const ai = getAI();
    const scriptText = subtitles.map((c: any) => c.text).join(' ');

    if (!ai) {
      return res.json({
        warning: 'Using a template caption; GEMINI_API_KEY is not configured.',
        caption:
          language === 'ar'
            ? `${clipTitle || 'مقطع ملهم'} 🔥 شاهد حتى النهاية وشاركنا رأيك!`
            : `${clipTitle || 'Must-watch clip'} 🔥 Watch till the end and drop your thoughts below!`,
        hashtags:
          language === 'ar'
            ? '#ريلز #شورتس #تيك_توك #تحفيز #نجاح #اكسبلور'
            : '#shorts #reels #tiktok #viral #motivation #mindset #fyp',
      });
    }

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Generate an engaging, high-converting social media caption and trending hashtags in ${
        language === 'ar' ? 'Arabic (العربية)' : 'English'
      } for a short-form viral video (TikTok, Instagram Reels, YouTube Shorts).
Clip Title: "${clipTitle}"
Transcript: "${scriptText}"`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            caption: { type: Type.STRING },
            hashtags: { type: Type.STRING },
          },
          required: ['caption', 'hashtags'],
        },
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return res.json({
      caption: parsed.caption || clipTitle || 'New viral clip!',
      hashtags: parsed.hashtags || '#shorts #reels #tiktok #viral',
    });
  } catch (error: any) {
    const { subtitles = [], clipTitle = '', language = 'en' } = req.body || {};
    const firstLine = subtitles[0]?.text || clipTitle || 'Must-watch clip';
    return res.json({
      warning: error.message || 'AI caption generation failed; using a template caption.',
      caption:
        language === 'ar'
          ? `${clipTitle ? `${clipTitle} — ` : ''}${firstLine} 🔥 شاهد للنهاية وشاركنا رأيك!`
          : `${clipTitle ? `${clipTitle}: ` : ''}"${firstLine}" 🔥 Watch till the end & follow for more!`,
      hashtags:
        language === 'ar'
          ? '#ريلز #شورتس #تيك_توك #تحفيز #نجاح #اكسبلور'
          : '#shorts #reels #tiktok #viral #motivation #mindset #fyp',
    });
  }
});

// n8n Webhook Social Media Auto-Post Dispatcher
app.post('/api/n8n/publish', async (req, res) => {
  try {
    const request = req.body || {};
    const target = webhookUrlCheck(request.webhookUrl || integrationsState.n8n.webhookUrl);
    const selected = Array.isArray(request.accounts) ? request.accounts.filter((account: any) => account.enabledForPost) : [];
    const active = selected.map((account: any) => integrationsState.socialAccounts.find(stored => stored.id === account.id && stored.connected)).filter(Boolean) as StoredIntegrationsState['socialAccounts'];
    if (!active.length) return res.status(400).json({ error: 'Map and enable at least one n8n social credential first.' });
    const id = String(request.clipMetadata?.exportId || '');
    const file = exportPath(id);
    if (!file || !fs.existsSync(file)) return res.status(409).json({ error: 'Export the current clip before sending it to n8n.' });
    const scheduled = request.scheduleMode === 'scheduled';
    const scheduleDate = scheduled ? new Date(request.scheduledTime) : null;
    if (scheduled && (!scheduleDate || !Number.isFinite(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now())) return res.status(400).json({ error: 'Choose a valid future date and time for scheduling.' });
    const origin = new URL(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).origin;
    const payload = { event: 'clip_studio.publish_video', timestamp: new Date().toISOString(),
      schedule: { mode: scheduled ? 'scheduled' : 'immediate', scheduledTime: scheduleDate?.toISOString() || null },
      post: { caption: request.caption || '', hashtags: request.hashtags || '', fullText: `${request.caption || ''}\n\n${request.hashtags || ''}`.trim() },
      targetAccounts: active.map(account => ({ platform: account.id, platformName: account.name, handle: account.handle, authMethod: 'n8n_credential', credentialName: account.credentialName })),
      clip: { ...request.clipMetadata, format: 'mp4', videoMp4Url: `${origin}/api/exports/${id}.mp4`, hasExportedMp4Ready: true, subtitles: request.subtitles || [] } };
    const response = await fetch(target, { method: 'POST', headers: webhookHeaders(request.authHeaderName || integrationsState.n8n.authHeaderName, request.authHeaderValue || integrationsState.n8n.authHeaderValue), body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
    const responseText = (await response.text()).slice(0, 800);
    const executionId = crypto.randomUUID();
    const results = active.map(account => ({ platform: account.id, name: account.name, handle: account.handle, status: response.ok ? 'accepted_by_n8n' : 'failed', timestamp: new Date().toISOString() }));
    const execution = { executionId, timestamp: new Date().toISOString(), webhookStatus: response.status, webhookDelivered: response.ok, webhookResponseText: responseText, results, payloadSent: payload };
    integrationsState.n8n.executions = [execution, ...integrationsState.n8n.executions].slice(0, 15);
    saveIntegrationsState(integrationsState);
    if (!response.ok) return res.status(502).json({ success: false, error: `n8n rejected the request (HTTP ${response.status}): ${responseText}`, executionId, results });
    res.json({ success: true, webhookDelivered: true, webhookStatus: response.status, webhookResponseText: responseText,
      executionId, results, payloadSent: payload, executions: integrationsState.n8n.executions, message: 'Accepted by n8n. Check its execution log for platform publication or scheduling status.' });
  } catch (error: any) { res.status(502).json({ success: false, error: error.message || 'n8n delivery failed. No publication was confirmed.' }); }
});

export async function start() {
  // Ensure any unmatched /api/* route or Express error returns JSON instead of HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      return res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch(error => { console.error(error); process.exitCode = 1; });
}
