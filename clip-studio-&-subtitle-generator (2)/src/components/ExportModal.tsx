import React, { useState, useRef, useEffect } from 'react';
import {
  AspectRatio,
  AudioSource,
  BackgroundConfig,
  ClipTitleConfig,
  ExportFPS,
  ExportResolution,
  SubtitleCue,
  SubtitleStyle,
  SubtitleWord,
  TextCase,
} from '../types';
import { getResolutionDimensions } from '../constants/presets';
import { formatTime, isArabicText } from '../utils/time';
import { globalAudioEngine } from '../utils/audioEngine';
import { safeFetchJson } from '../utils/api';
import {
  Download,
  X,
  CheckCircle2,
  Film,
  Camera,
  AlertCircle,
  Workflow,
  Zap,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  background: BackgroundConfig;
  subtitles: SubtitleCue[];
  style: SubtitleStyle;
  trimStart?: number;
  duration: number;
  watermarkText?: string;
  clipTitle?: ClipTitleConfig;
  audioSource?: AudioSource;
  currentTime?: number;
  onPausePreview?: () => void;
  onOpenN8nPanel?: () => void;
  onExportComplete?: (exportId: string) => void;
}

interface PrecomputedLayers {
  staticFullBgCanvas: HTMLCanvasElement | null;
  staticOverlayCanvas: HTMLCanvasElement | null;
  cueLayoutCache: Map<
    string,
    {
      isRtl: boolean;
      scaledFontSize: number;
      posX: number;
      posY: number;
      containerBoxW: number;
      padY: number;
      lineHeight: number;
      wordGap: number;
      totalBlockH: number;
      wrappedLines: {
        words: { item: SubtitleWord; text: string; width: number }[];
        totalWidth: number;
      }[];
    }
  >;
}

function applyTextCase(text: string, textCase: TextCase): string {
  if (!text) return '';
  if (textCase === 'uppercase') return text.toUpperCase();
  if (textCase === 'capitalize') {
    return text.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return text;
}

function hexWithOpacity(hexColor: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const clean = (hexColor || '#000000').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    const alphaHex = Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0');
    return `${clean}${alphaHex}`;
  }
  return `rgba(0, 0, 0, ${clamped})`;
}

/**
 * Measures the exact rendered width & height of the #preview-canvas-container DOM element
 * so exported font sizes, strokes, and positions match the video viewing window 1:1.
 */
function getPreviewWindowDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  const el = document.getElementById('preview-canvas-container');
  if (el) {
    const cw = el.clientWidth || el.getBoundingClientRect().width;
    const ch = el.clientHeight || el.getBoundingClientRect().height;
    if (cw > 80 && ch > 80) {
      return { width: cw, height: ch };
    }
  }
  switch (aspectRatio) {
    case '9:16':
      return { width: 270, height: 480 };
    case '4:5':
      return { width: 384, height: 480 };
    case '1:1':
      return { width: 440, height: 440 };
    case '16:9':
    default:
      return { width: 520, height: 292.5 };
  }
}

async function loadSafeMediaElement(
  background: BackgroundConfig,
  audioSource?: AudioSource
): Promise<HTMLVideoElement | HTMLImageElement | null> {
  if (
    background.type === 'none' ||
    background.type === 'gradient' ||
    (!background.src && background.type !== 'youtube-video')
  ) {
    return null;
  }

  if (background.type === 'youtube-video') {
    const id = background.youtubeVideoId || audioSource?.videoId;
    if (!id) throw new Error('No YouTube background video was selected.');
    const params = new URLSearchParams({ videoId: id, startTime: String(audioSource?.ytStartOffset || 0), endTime: String(audioSource?.ytEndOffset || 30) });
    return loadSafeMediaElement({ ...background, type: 'video', src: `/api/youtube/video?${params}` }, audioSource);
  }

  if (background.type === 'image') {
    return loadCorsSafeImage(background.src);
  }

  if (background.type === 'video' || background.type === 'preset-video') {
    return new Promise((resolve, reject) => {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.preload = 'auto';

      let settled = false;
      const finish = (result: HTMLVideoElement | null) => {
        if (settled) return;
        settled = true;
        if (!result) { vid.pause(); vid.removeAttribute('src'); vid.load(); reject(new Error('The selected background video could not be loaded for export. Upload a local copy or use a CORS-enabled media URL.')); } else resolve(result);
      };

      const timer = setTimeout(() => {
        finish(null);
      }, 20000);

      vid.onloadeddata = () => {
        clearTimeout(timer);
        try {
          const testCanvas = document.createElement('canvas');
          testCanvas.width = 2;
          testCanvas.height = 2;
          const tCtx = testCanvas.getContext('2d');
          if (tCtx && vid.videoWidth > 0) {
            tCtx.drawImage(vid, 0, 0, 2, 2);
            tCtx.getImageData(0, 0, 1, 1);
            finish(vid);
            return;
          }
        } catch (e) {
          console.warn('Video background CORS taint avoided, using procedural fallback');
        }
        finish(null);
      };

      vid.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };

      vid.src = background.src;
      vid.load();
    });
  }

  return null;
}

function loadCorsSafeImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      if (!res) reject(new Error('The selected background image could not be loaded for export. Upload a local copy or use a CORS-enabled image URL.')); else resolve(res);
    };
    const timer = setTimeout(() => finish(null), 3500);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 2;
        testCanvas.height = 2;
        const tCtx = testCanvas.getContext('2d');
        if (tCtx && img.naturalWidth > 0) {
          tCtx.drawImage(img, 0, 0, 2, 2);
          tCtx.getImageData(0, 0, 1, 1);
          finish(img);
          return;
        }
      } catch (e) {}
      finish(null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

function drawBackgroundAndDarken(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  mediaElement: HTMLVideoElement | HTMLImageElement | null,
  background: BackgroundConfig,
  fontScale: number,
  heightScale: number
) {
  ctx.save();
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  const hasValidMedia =
    mediaElement &&
    (mediaElement instanceof HTMLVideoElement
      ? mediaElement.readyState >= 2 && mediaElement.videoWidth > 0
      : mediaElement.naturalWidth > 0);

  if (hasValidMedia && mediaElement) {
    const imgWidth =
      mediaElement instanceof HTMLVideoElement
        ? mediaElement.videoWidth
        : mediaElement.naturalWidth;
    const imgHeight =
      mediaElement instanceof HTMLVideoElement
        ? mediaElement.videoHeight
        : mediaElement.naturalHeight;

    if (background.fit === 'blur-mirror') {
      ctx.save();
      const coverRatio = Math.max(W / imgWidth, H / imgHeight) * 1.12;
      const bw = imgWidth * coverRatio;
      const bh = imgHeight * coverRatio;
      ctx.filter = `blur(${Math.round(20 * fontScale)}px) brightness(65%)`;
      ctx.drawImage(mediaElement, (W - bw) / 2, (H - bh) / 2, bw, bh);
      ctx.restore();
    }

    ctx.save();
    const hRatio = W / imgWidth;
    const vRatio = H / imgHeight;
    const ratio =
      background.fit === 'contain' || background.fit === 'blur-mirror'
        ? Math.min(hRatio, vRatio)
        : Math.max(hRatio, vRatio);

    const drawW = imgWidth * ratio * background.scale;
    const drawH = imgHeight * ratio * background.scale;
    const drawX = (W - drawW) / 2 + background.offsetX * fontScale;
    const drawY = (H - drawH) / 2 + background.offsetY * heightScale;

    if (
      background.blur > 0 ||
      background.brightness !== 100 ||
      background.contrast !== 100
    ) {
      ctx.filter = `blur(${background.blur * fontScale}px) brightness(${background.brightness}%) contrast(${background.contrast}%)`;
    }
    ctx.drawImage(mediaElement, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else if (background.type === 'gradient' && background.src) {
    const css = background.src;
    const degrees = Number(css.match(/linear-gradient\(\s*(-?[\d.]+)deg/i)?.[1] ?? 135);
    const angle = degrees * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
    const halfLength = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
    const grad = ctx.createLinearGradient(W / 2 - dx * halfLength, H / 2 - dy * halfLength, W / 2 + dx * halfLength, H / 2 + dy * halfLength);
    const colors = [...css.matchAll(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*([\d.]+%)?/g)];
    if (colors.length >= 2) colors.forEach((match, index) => grad.addColorStop(match[2] ? Math.max(0, Math.min(1, parseFloat(match[2]) / 100)) : index / (colors.length - 1), match[1]));
    else { grad.addColorStop(0, '#09090b'); grad.addColorStop(1, '#030712'); }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  if (background.darkenOverlay > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${background.darkenOverlay})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawStaticWatermarkAndTitle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fontScale: number,
  heightScale: number,
  clipTitle?: ClipTitleConfig,
  watermarkText?: string
) {
  if (watermarkText) {
    ctx.save();
    const wmFontSize = Math.round(12 * fontScale);
    ctx.font = `600 ${wmFontSize}px sans-serif`;
    const wmText = watermarkText.toUpperCase();
    const wmMetrics = ctx.measureText(wmText);
    const padX = 10 * fontScale;
    const padY = 4 * fontScale;
    const bw = wmMetrics.width + padX * 2;
    const bh = wmFontSize * 1.3 + padY * 2;
    const bx = W - bw - 16 * fontScale;
    const by = 16 * heightScale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6 * fontScale);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wmText, bx + bw / 2, by + bh / 2);
    ctx.restore();
  }

  if (clipTitle && clipTitle.enabled && clipTitle.text) {
    ctx.save();
    const titleText = applyTextCase(clipTitle.text, clipTitle.textCase);
    const isTitleRtl =
      clipTitle.direction === 'rtl' ||
      (clipTitle.direction === 'auto' && isArabicText(titleText));
    ctx.direction = isTitleRtl ? 'rtl' : 'ltr';

    const titleFontSize = Math.max(10, Math.round(clipTitle.fontSize * fontScale));
    ctx.font = `900 ${titleFontSize}px ${clipTitle.fontFamily}`;
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${(clipTitle.letterSpacing || 0) * fontScale}px`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tX = (clipTitle.positionX / 100) * W;
    const tY = (clipTitle.positionY / 100) * H;
    const containerBoxW = ((clipTitle.boxWidth || 80) / 100) * W;
    const padX = clipTitle.boxBackground ? 16 * fontScale : 0;
    const padY = clipTitle.boxBackground ? 6 * fontScale : 0;
    const maxTextW = Math.max(40, containerBoxW - padX * 2);

    const titleWords = titleText.split(/\s+/).filter(Boolean);
    const titleLines: string[] = [];
    let currentLine = '';
    for (const word of titleWords) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextW && currentLine) {
        titleLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) titleLines.push(currentLine);

    const lineHeight = titleFontSize * 1.25;
    const totalTitleH = titleLines.length * lineHeight;

    if (clipTitle.boxBackground) {
      const boxW = containerBoxW;
      const boxH = totalTitleH + padY * 2;

      ctx.fillStyle = hexWithOpacity(clipTitle.boxColor, clipTitle.boxOpacity);
      ctx.beginPath();
      ctx.roundRect(tX - boxW / 2, tY - boxH / 2, boxW, boxH, 14 * fontScale);
      ctx.fill();
    }

    titleLines.forEach((line, idx) => {
      const lineY = tY - totalTitleH / 2 + idx * lineHeight + lineHeight / 2;

      if (clipTitle.shadow) {
        ctx.shadowColor = clipTitle.shadowColor || 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 12 * fontScale;
        ctx.shadowOffsetY = 3 * fontScale;
      }

      if (clipTitle.strokeWidth > 0) {
        ctx.lineWidth = clipTitle.strokeWidth * fontScale * 2;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = clipTitle.strokeColor;
        ctx.strokeText(line, tX, lineY);
      }

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = clipTitle.textColor;
      ctx.fillText(line, tX, lineY);
    });

    ctx.restore();
  }
}

/**
 * Pre-renders static background layers (including blur filters, gradients, watermark, and title)
 * and pre-calculates subtitle word layouts once so the export frame loop runs in <1ms per frame.
 */
function buildPrecomputedLayers(
  W: number,
  H: number,
  mediaElement: HTMLVideoElement | HTMLImageElement | null,
  background: BackgroundConfig,
  subtitles: SubtitleCue[],
  style: SubtitleStyle,
  previewDims: { width: number; height: number },
  clipTitle?: ClipTitleConfig,
  watermarkText?: string
): PrecomputedLayers {
  const fontScale = W / previewDims.width;
  const heightScale = H / previewDims.height;

  let staticFullBgCanvas: HTMLCanvasElement | null = null;
  let staticOverlayCanvas: HTMLCanvasElement | null = null;

  const isVideoBg = mediaElement instanceof HTMLVideoElement;

  if (!isVideoBg) {
    staticFullBgCanvas = document.createElement('canvas');
    staticFullBgCanvas.width = W;
    staticFullBgCanvas.height = H;
    const sCtx = staticFullBgCanvas.getContext('2d', { alpha: false });
    if (sCtx) {
      drawBackgroundAndDarken(sCtx, W, H, mediaElement, background, fontScale, heightScale);
      drawStaticWatermarkAndTitle(sCtx, W, H, fontScale, heightScale, clipTitle, watermarkText);
    }
  } else if (watermarkText || (clipTitle && clipTitle.enabled && clipTitle.text)) {
    staticOverlayCanvas = document.createElement('canvas');
    staticOverlayCanvas.width = W;
    staticOverlayCanvas.height = H;
    const oCtx = staticOverlayCanvas.getContext('2d');
    if (oCtx) {
      drawStaticWatermarkAndTitle(oCtx, W, H, fontScale, heightScale, clipTitle, watermarkText);
    }
  }

  const cueLayoutCache = new Map<
    string,
    {
      isRtl: boolean;
      scaledFontSize: number;
      posX: number;
      posY: number;
      containerBoxW: number;
      padY: number;
      lineHeight: number;
      wordGap: number;
      totalBlockH: number;
      wrappedLines: {
        words: { item: SubtitleWord; text: string; width: number }[];
        totalWidth: number;
      }[];
    }
  >();

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d');
  if (mCtx && style.showSubtitles !== false) {
    const scaledFontSize = Math.max(10, Math.round(style.fontSize * fontScale));
    mCtx.font = `800 ${scaledFontSize}px ${style.fontFamily}`;
    if ('letterSpacing' in mCtx) {
      (mCtx as any).letterSpacing = `${(style.letterSpacing || 0) * fontScale}px`;
    }

    const posX = (style.positionX / 100) * W;
    const posY = (style.positionY / 100) * H;
    const containerBoxW = ((style.boxWidth || 85) / 100) * W;
    const padX = style.boxBackground ? 16 * fontScale : 0;
    const padY = style.boxBackground ? 8 * fontScale : 0;
    const maxTextW = Math.max(40, containerBoxW - padX * 2);
    const lineGapY = 4 * fontScale;
    const lineHeight = scaledFontSize * 1.3 + lineGapY;
    const wordGap = 8 * fontScale;

    for (const cue of subtitles) {
      const isRtl =
        style.direction === 'rtl' ||
        (style.direction === 'auto' && isArabicText(cue.text));

      const rawWords: SubtitleWord[] =
        cue.words && cue.words.length > 0
          ? cue.words
          : cue.text
              .split(/\s+/)
              .filter(Boolean)
              .map((w, i, arr) => {
                const dur = (cue.end - cue.start) / Math.max(1, arr.length);
                return {
                  word: w,
                  start: cue.start + i * dur,
                  end: cue.start + (i + 1) * dur,
                };
              });

      const wrappedLines: {
        words: { item: SubtitleWord; text: string; width: number }[];
        totalWidth: number;
      }[] = [];
      let currentLineWords: { item: SubtitleWord; text: string; width: number }[] = [];
      let currentLineWidth = 0;

      for (const wObj of rawWords) {
        const casedWord = applyTextCase(wObj.word, style.textCase);
        const wordW = mCtx.measureText(casedWord).width;
        const nextWidth =
          currentLineWords.length === 0 ? wordW : currentLineWidth + wordGap + wordW;

        if (nextWidth > maxTextW && currentLineWords.length > 0) {
          wrappedLines.push({ words: currentLineWords, totalWidth: currentLineWidth });
          currentLineWords = [{ item: wObj, text: casedWord, width: wordW }];
          currentLineWidth = wordW;
        } else {
          currentLineWords.push({ item: wObj, text: casedWord, width: wordW });
          currentLineWidth = nextWidth;
        }
      }
      if (currentLineWords.length > 0) {
        wrappedLines.push({ words: currentLineWords, totalWidth: currentLineWidth });
      }

      cueLayoutCache.set(cue.id, {
        isRtl,
        scaledFontSize,
        posX,
        posY,
        containerBoxW,
        padY,
        lineHeight,
        wordGap,
        totalBlockH: wrappedLines.length * lineHeight,
        wrappedLines,
      });
    }
  }

  return {
    staticFullBgCanvas,
    staticOverlayCanvas,
    cueLayoutCache,
  };
}

function renderSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clipTimeSec: number,
  mediaElement: HTMLVideoElement | HTMLImageElement | null,
  background: BackgroundConfig,
  subtitles: SubtitleCue[],
  style: SubtitleStyle,
  previewDims: { width: number; height: number },
  clipTitle?: ClipTitleConfig,
  watermarkText?: string,
  precomputed?: PrecomputedLayers
) {
  const W = canvas.width;
  const H = canvas.height;
  const fontScale = W / previewDims.width;
  const heightScale = H / previewDims.height;

  ctx.save();

  // 1-3 & 5-6: Fast composite from precomputed static layer when available
  if (precomputed?.staticFullBgCanvas) {
    ctx.drawImage(precomputed.staticFullBgCanvas, 0, 0);
  } else {
    drawBackgroundAndDarken(ctx, W, H, mediaElement, background, fontScale, heightScale);
    if (precomputed?.staticOverlayCanvas) {
      ctx.drawImage(precomputed.staticOverlayCanvas, 0, 0);
    } else {
      drawStaticWatermarkAndTitle(ctx, W, H, fontScale, heightScale, clipTitle, watermarkText);
    }
  }

  // 4. Audio Visualizer Overlay (only if explicitly enabled)
  if (background.showVisualizer && background.visualizerStyle !== 'off') {
    ctx.save();
    const spectrum = globalAudioEngine.getFrequencyDataAt(clipTimeSec);
    const vColor = background.visualizerColor || '#FACC15';
    ctx.fillStyle = vColor;
    ctx.strokeStyle = vColor;
    ctx.globalAlpha = 0.8;

    const vizW = W - 32 * fontScale;
    const vizH = 80 * heightScale;
    const vizX = 16 * fontScale;
    const vizY = H - 80 * heightScale - vizH;

    if (background.visualizerStyle === 'wave') {
      ctx.lineWidth = Math.max(2, 3 * fontScale);
      ctx.beginPath();
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const amp =
          (spectrum[i % spectrum.length] / 255) * (vizH * 0.42);
        const px = vizX + (i / steps) * vizW;
        const py = vizY + vizH / 2 + Math.sin(i * 0.5 + clipTimeSec * 6) * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else if (background.visualizerStyle === 'circle') {
      const cx = W / 2;
      const cy = vizY + vizH / 2;
      const baseR = vizH * 0.35;
      const rays = 28;
      ctx.lineWidth = Math.max(2, 3 * fontScale);
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        const val = spectrum[i % spectrum.length] / 255;
        const r2 = baseR + val * (vizH * 0.4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * baseR, cy + Math.sin(angle) * baseR);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.stroke();
      }
    } else {
      const barCount = 32;
      const gap = 2 * fontScale;
      const barW = Math.max(2, vizW / barCount - gap);
      for (let i = 0; i < barCount; i++) {
        const val = spectrum[i % spectrum.length] / 255;
        const bh = Math.max(4, Math.min(vizH * 0.85, val * vizH));
        const bx = vizX + i * (barW + gap);
        const by = vizY + vizH - bh;
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, bh, 3 * fontScale);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 7. Synchronized Subtitles
  const activeCue =
    style.showSubtitles !== false
      ? subtitles.find(
          (c) => clipTimeSec >= c.start && clipTimeSec <= c.end + 0.06
        )
      : null;

  if (activeCue) {
    ctx.save();
    const cachedLayout = precomputed?.cueLayoutCache.get(activeCue.id);

    const isRtl = cachedLayout
      ? cachedLayout.isRtl
      : style.direction === 'rtl' ||
        (style.direction === 'auto' && isArabicText(activeCue.text));
    ctx.direction = isRtl ? 'rtl' : 'ltr';

    const scaledFontSize = cachedLayout
      ? cachedLayout.scaledFontSize
      : Math.max(10, Math.round(style.fontSize * fontScale));
    ctx.font = `800 ${scaledFontSize}px ${style.fontFamily}`;
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${(style.letterSpacing || 0) * fontScale}px`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const posX = cachedLayout ? cachedLayout.posX : (style.positionX / 100) * W;
    const posY = cachedLayout ? cachedLayout.posY : (style.positionY / 100) * H;
    const containerBoxW = cachedLayout
      ? cachedLayout.containerBoxW
      : ((style.boxWidth || 85) / 100) * W;
    const padY = cachedLayout
      ? cachedLayout.padY
      : style.boxBackground
      ? 8 * fontScale
      : 0;
    const lineHeight = cachedLayout
      ? cachedLayout.lineHeight
      : scaledFontSize * 1.3 + 4 * fontScale;
    const wordGap = cachedLayout ? cachedLayout.wordGap : 8 * fontScale;

    let wrappedLines = cachedLayout?.wrappedLines;
    if (!wrappedLines) {
      const padX = style.boxBackground ? 16 * fontScale : 0;
      const maxTextW = Math.max(40, containerBoxW - padX * 2);
      const rawWords: SubtitleWord[] =
        activeCue.words && activeCue.words.length > 0
          ? activeCue.words
          : activeCue.text
              .split(/\s+/)
              .filter(Boolean)
              .map((w, i, arr) => {
                const dur = (activeCue.end - activeCue.start) / Math.max(1, arr.length);
                return {
                  word: w,
                  start: activeCue.start + i * dur,
                  end: activeCue.start + (i + 1) * dur,
                };
              });

      wrappedLines = [];
      let currentLineWords: { item: SubtitleWord; text: string; width: number }[] = [];
      let currentLineWidth = 0;

      for (const wObj of rawWords) {
        const casedWord = applyTextCase(wObj.word, style.textCase);
        const wordW = ctx.measureText(casedWord).width;
        const nextWidth =
          currentLineWords.length === 0 ? wordW : currentLineWidth + wordGap + wordW;

        if (nextWidth > maxTextW && currentLineWords.length > 0) {
          wrappedLines.push({ words: currentLineWords, totalWidth: currentLineWidth });
          currentLineWords = [{ item: wObj, text: casedWord, width: wordW }];
          currentLineWidth = wordW;
        } else {
          currentLineWords.push({ item: wObj, text: casedWord, width: wordW });
          currentLineWidth = nextWidth;
        }
      }
      if (currentLineWords.length > 0) {
        wrappedLines.push({ words: currentLineWords, totalWidth: currentLineWidth });
      }
    }

    const totalBlockH = cachedLayout
      ? cachedLayout.totalBlockH
      : wrappedLines.length * lineHeight;

    if (style.boxBackground) {
      const boxW = containerBoxW;
      const boxH = totalBlockH + padY * 2;

      ctx.fillStyle = hexWithOpacity(style.boxColor, style.boxOpacity);
      ctx.beginPath();
      ctx.roundRect(posX - boxW / 2, posY - boxH / 2, boxW, boxH, 12 * fontScale);
      ctx.fill();
    }

    wrappedLines.forEach((lineObj, lineIdx) => {
      const lineY =
        posY - totalBlockH / 2 + lineIdx * lineHeight + lineHeight / 2;

      let cursorX = isRtl
        ? posX + lineObj.totalWidth / 2
        : posX - lineObj.totalWidth / 2;

      lineObj.words.forEach((wEntry) => {
        const isWordActive =
          clipTimeSec >= wEntry.item.start - 0.05 &&
          clipTimeSec <= wEntry.item.end + 0.08;
        const wordCenterX = isRtl
          ? cursorX - wEntry.width / 2
          : cursorX + wEntry.width / 2;

        ctx.save();
        ctx.font = `${isWordActive ? 900 : 800} ${scaledFontSize}px ${style.fontFamily}`;
        if (isWordActive && style.animation === 'karaoke-bounce') {
          ctx.translate(wordCenterX, lineY);
          ctx.scale(1.18, 1.18);
          ctx.translate(-wordCenterX, -lineY);
        }

        if (style.shadow) {
          ctx.shadowColor = isWordActive
            ? style.highlightColor
            : style.shadowColor || 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = (isWordActive ? 16 : 14) * fontScale;
          ctx.shadowOffsetY = (isWordActive ? 2 : 4) * fontScale;
        }

        if (style.strokeWidth > 0) {
          ctx.lineWidth = style.strokeWidth * fontScale * 2;
          ctx.lineJoin = 'round';
          ctx.miterLimit = 2;
          ctx.strokeStyle = style.strokeColor;
          ctx.strokeText(wEntry.text, wordCenterX, lineY);
        }

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = isWordActive ? style.highlightColor : style.textColor;
        ctx.fillText(wEntry.text, wordCenterX, lineY);
        ctx.restore();

        cursorX = isRtl
          ? cursorX - (wEntry.width + wordGap)
          : cursorX + (wEntry.width + wordGap);
      });
    });

    ctx.restore();
  }

  ctx.restore();
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  background,
  subtitles,
  style,
  trimStart = 0,
  duration,
  watermarkText,
  clipTitle,
  audioSource,
  currentTime = 0,
  onPausePreview,
  onOpenN8nPanel,
  onExportComplete,
}) => {
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [fps, setFps] = useState<ExportFPS>(30);
  const [renderSpeedMode, setRenderSpeedMode] = useState<'turbo' | 'standard'>('turbo');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusLabel, setExportStatusLabel] = useState<string>('');
  const [exportProgress, setExportProgress] = useState(0);
  const [currentRenderTime, setCurrentRenderTime] = useState(0);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cancelExportRef = useRef(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { cancelExportRef.current = true; exportAbortRef.current?.abort(); }, []);
  useEffect(() => {
    if (isOpen) setErrorMessage(null);
    if (!isOpen) { cancelExportRef.current = true; exportAbortRef.current?.abort(); setExportedUrl(null); }
  }, [isOpen]);
  useEffect(() => () => { if (exportedUrl) URL.revokeObjectURL(exportedUrl); }, [exportedUrl]);

  if (!isOpen) return null;

  const targetDimensions = getResolutionDimensions(background.aspectRatio, resolution);
  const effectiveDuration = Math.min(3600, Math.max(0.05, duration || 30));

  // Select the fastest hardware-friendly video codec (prefer H.264 / VP8 over slow software VP9)
  const createSafeMediaRecorder = (
    stream: MediaStream,
    res: ExportResolution
  ): { recorder: MediaRecorder; mimeType: string } => {
    const targetBitrate =
      res === '4k' ? 14000000 : res === '1440p' ? 9000000 : res === '1080p' ? 6000000 : 4000000;

    const candidates: string[] = [
      'video/webm;codecs=h264',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        try {
          const rec = new MediaRecorder(stream, {
            mimeType: mime,
            videoBitsPerSecond: targetBitrate,
          });
          return { recorder: rec, mimeType: mime };
        } catch (e) {
          // Try next codec
        }
      }
    }

    const fallbackRec = new MediaRecorder(stream);
    return {
      recorder: fallbackRec,
      mimeType: fallbackRec.mimeType || 'video/webm',
    };
  };

  const handleStartExport = async () => {
    onPausePreview?.();
    globalAudioEngine.stop();
    const abort = new AbortController();
    exportAbortRef.current = abort;
    cancelExportRef.current = false;
    setIsExporting(true); setExportProgress(0); setCurrentRenderTime(0);
    setExportedUrl(null); setErrorMessage(null);
    let audioToken: string | null = null;
    let cleanup = () => {};
    const checkCancelled = () => { if (abort.signal.aborted || cancelExportRef.current) throw new DOMException('Export cancelled', 'AbortError'); };
    try {
      setExportStatusLabel('Preparing original audio and canvas layers...');
      await document.fonts?.ready;
      checkCancelled();
      if (!globalAudioEngine.hasDecodedAudioBuffer()) {
        if (audioSource?.type === 'youtube') {
          await globalAudioEngine.ensureRealYoutubeBuffer(audioSource.videoId || '', audioSource.ytStartOffset || 0,
            audioSource.ytEndOffset || (audioSource.ytStartOffset || 0) + audioSource.totalDuration, audioSource.youtubeUrl);
        } else if (audioSource?.type === 'upload' || audioSource?.type === 'url') {
          await globalAudioEngine.loadAudioFromUrl(audioSource.src);
        } else {
          throw new Error('No audio is ready. Upload audio, pull a YouTube timeframe, or generate a voiceover in the Audio panel first.');
        }
      }
      checkCancelled();
      const wav = globalAudioEngine.exportHighQualityWavBlob(trimStart, trimStart + effectiveDuration, audioSource?.volume ?? 1);
      if (!wav || wav.size <= 44) throw new Error('The selected trim contains no audio. Adjust the clip start and end.');
      const prepared = await safeFetchJson<{ audioToken?: string; error?: string }>('/api/export-audio-temp', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: wav, signal: abort.signal,
      }, 0);
      if (!prepared.ok || !prepared.data?.audioToken) throw new Error(prepared.data?.error || 'Could not prepare the original audio for export.');
      audioToken = prepared.data.audioToken;
      checkCancelled();
      const previewDims = getPreviewWindowDimensions(background.aspectRatio);
      // The encoder may record a smaller working canvas; FFmpeg explicitly scales
      // to the selected final dimensions instead of silently exporting a smaller file.
      const workingScale = Math.min(1, 2560 / Math.max(targetDimensions.width, targetDimensions.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(targetDimensions.width * workingScale / 2) * 2;
      canvas.height = Math.round(targetDimensions.height * workingScale / 2) * 2;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not initialize the video canvas.');
      const media = await loadSafeMediaElement(background, audioSource);
      checkCancelled();
      if (media instanceof HTMLVideoElement) {
        const targetTime = trimStart % media.duration;
        if (Math.abs(media.currentTime - targetTime) > 0.01) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { media.onseeked = null; reject(new Error('Could not seek the background video.')); }, 5000);
            media.onseeked = () => { clearTimeout(timer); media.onseeked = null; resolve(); };
            media.currentTime = targetTime;
          });
        }
      }
      const layers = buildPrecomputedLayers(canvas.width, canvas.height, media, background, subtitles, style, previewDims, clipTitle, watermarkText);
      const targetSpeed = renderSpeedMode === 'turbo' ? (resolution === '4k' || resolution === '1440p' ? 2.5 : 3.5) : 1;
      if (media instanceof HTMLVideoElement) { media.playbackRate = targetSpeed; await media.play(); }
      renderSceneToCanvas(ctx, canvas, trimStart, media, background, subtitles, style, previewDims, clipTitle, watermarkText, layers);
      const stream = canvas.captureStream(60);
      const track = stream.getVideoTracks()[0];
      const { recorder, mimeType } = createSafeMediaRecorder(stream, resolution);
      const chunks: Blob[] = [];
      let interval: ReturnType<typeof setInterval> | undefined;
      let frame = 0;
      let stopped = false;
      let renderError: Error | null = null;
      let actualWall = effectiveDuration / targetSpeed;
      cleanup = () => {
        if (interval) clearInterval(interval);
        cancelAnimationFrame(frame);
        if (media instanceof HTMLVideoElement) { media.pause(); media.removeAttribute('src'); media.load(); }
        stream.getTracks().forEach(item => item.stop());
      };
      const recorded = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { stopped = true; cleanup(); reject(new Error('Video encoding failed. Try 720p or 1080p.')); };
        recorder.onstop = () => {
          stopped = true; cleanup();
          if (renderError) reject(renderError);
          else if (abort.signal.aborted) reject(new DOMException('Export cancelled', 'AbortError'));
          else if (!chunks.length) reject(new Error('No video frames were recorded.'));
          else resolve(new Blob(chunks, { type: mimeType }));
        };
      });
      setExportStatusLabel(`Rendering ${resolution.toUpperCase()} at ${targetSpeed}x...`);
      const started = performance.now();
      recorder.start(200);
      const tick = () => {
        if (stopped) return;
        if (abort.signal.aborted || cancelExportRef.current) { stopped = true; if (recorder.state !== 'inactive') recorder.stop(); return; }
        const elapsed = (performance.now() - started) / 1000;
        const clipTime = Math.min(effectiveDuration, elapsed * targetSpeed);
        try {
          renderSceneToCanvas(ctx, canvas, trimStart + clipTime, media, background, subtitles, style, previewDims, clipTitle, watermarkText, layers);
          (track as any).requestFrame?.();
        } catch (error: any) { renderError = error; stopped = true; recorder.stop(); return; }
        setCurrentRenderTime(clipTime); setExportProgress(Math.min(94, Math.round(clipTime / effectiveDuration * 94)));
        if (clipTime >= effectiveDuration) { stopped = true; actualWall = Math.max(0.05, elapsed); recorder.stop(); }
      };
      interval = setInterval(tick, 1000 / 60);
      const animationLoop = () => { tick(); if (!stopped) frame = requestAnimationFrame(animationLoop); };
      frame = requestAnimationFrame(animationLoop);
      const videoBlob = await recorded;
      checkCancelled();
      setExportStatusLabel('Encoding MP4 with original audio...'); setExportProgress(97);
      const params = new URLSearchParams({ ytDuration: String(effectiveDuration), speedMultiplier: String(effectiveDuration / actualWall),
        audioToken, audioRequired: 'true', fps: String(fps), width: String(targetDimensions.width), height: String(targetDimensions.height) });
      const response = await fetch(`/api/convert-mp4?${params}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: videoBlob, signal: abort.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `MP4 conversion failed (HTTP ${response.status}).`);
      }
      if (!(response.headers.get('Content-Type') || '').includes('video/mp4')) throw new Error('The server returned an invalid MP4 response.');
      const result = await response.blob();
      if (!result.size) throw new Error('The exported MP4 is empty.');
      checkCancelled();
      setExportedUrl(URL.createObjectURL(result)); setExportProgress(100);
      const id = response.headers.get('X-Clip-Export-Id');
      if (id) onExportComplete?.(id);
    } catch (error: any) {
      if (error.name !== 'AbortError') setErrorMessage(error.message || 'Export failed.');
    } finally {
      cleanup();
      if (audioToken) void fetch(`/api/export-audio-temp/${encodeURIComponent(audioToken)}`, { method: 'DELETE' }).catch(() => {});
      if (exportAbortRef.current === abort) { exportAbortRef.current = null; setIsExporting(false); }
    }
  };

  // Snapshot Poster Frame (Full-Resolution PNG with background, title, and subtitles)
  const handleTakeSnapshot = async () => {
    try {
      const previewDims = getPreviewWindowDimensions(background.aspectRatio);
      const canvas = document.createElement('canvas');
      canvas.width = targetDimensions.width;
      canvas.height = targetDimensions.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const mediaElement = await loadSafeMediaElement(background, audioSource);
      if (mediaElement instanceof HTMLVideoElement) {
        const dur = mediaElement.duration || 1;
        const target = currentTime % dur;
        if (Math.abs(mediaElement.currentTime - target) > 0.01) await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { mediaElement.onseeked = null; reject(new Error('Could not seek the poster frame.')); }, 5000);
          mediaElement.onseeked = () => { clearTimeout(timer); mediaElement.onseeked = null; resolve(); };
          mediaElement.currentTime = target;
        });
      }

      renderSceneToCanvas(
        ctx,
        canvas,
        currentTime,
        mediaElement,
        background,
        subtitles,
        style,
        previewDims,
        clipTitle,
        watermarkText
      );

      const posterBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the poster image.')), 'image/png'));
      if (mediaElement instanceof HTMLVideoElement) { mediaElement.pause(); mediaElement.removeAttribute('src'); mediaElement.load(); }
      { const blob = posterBlob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clip-poster-${resolution}-${background.aspectRatio.replace(':', 'x')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setErrorMessage((e as Error).message || 'Could not create the poster frame.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg p-6 overflow-hidden border bg-zinc-900 border-zinc-800 rounded-3xl shadow-2xl">
        {/* Close Button */}
        <button
          aria-label="Close"
          onClick={onClose}
          disabled={isExporting}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-800/80 hover:bg-zinc-700 transition-colors disabled:opacity-30 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Film className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Export MP4 Video Clip</h2>
          </div>
          <p className="text-xs text-zinc-400">
            Export H.264 .MP4 up to 4K resolution at 60 FPS with 1:1 synchronized subtitles &amp; original audio
          </p>
        </div>

        {/* Settings Form */}
        {!isExporting && !exportedUrl && (
          <div className="space-y-4">
            {/* Resolution Selector (720p, 1080p, 1440p, 4K) */}
            <div>
              <label className="block mb-1.5 text-xs font-bold text-zinc-300">
                Resolution (Up to 4K UHD .MP4)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { id: '720p', label: '720p', tag: 'HD' },
                    { id: '1080p', label: '1080p', tag: 'FHD' },
                    { id: '1440p', label: '1440p', tag: '2K' },
                    { id: '4k', label: '4K UHD', tag: '2160p' },
                  ] as { id: ExportResolution; label: string; tag: string }[]
                ).map((res) => (
                  <button
                    key={res.id}
                    onClick={() => setResolution(res.id)}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      resolution === res.id
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{res.label}</div>
                    <div className="text-[10px] text-zinc-300">{res.tag}</div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[11px] text-zinc-500 font-mono">
                <span>Output Format:</span>
                <span className="text-indigo-400">
                  {targetDimensions.width} x {targetDimensions.height} px &bull; H.264 .MP4 ({background.aspectRatio})
                </span>
              </div>
            </div>

            {/* Frame Rate & Render Speed Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1.5 text-xs font-bold text-zinc-300">
                  Frame Rate (FPS)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { fps: 24, label: '24', desc: 'Film' },
                    { fps: 30, label: '30', desc: 'Std' },
                    { fps: 60, label: '60', desc: 'Smooth' },
                  ].map((item) => (
                    <button
                      key={item.fps}
                      onClick={() => setFps(item.fps as ExportFPS)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        fps === item.fps
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] text-zinc-300">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block mb-1.5 text-xs font-bold text-zinc-300">
                  Render Engine Speed
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRenderSpeedMode('turbo')}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      renderSpeedMode === 'turbo'
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-center gap-1">
                      <Zap className="w-3 h-3" /> Turbo
                    </div>
                    <div className="text-[10px] text-zinc-200">3.5x Faster</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenderSpeedMode('standard')}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      renderSpeedMode === 'standard'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-bold">1x Realtime</div>
                    <div className="text-[10px] text-zinc-300">Standard</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Clip Details Summary */}
            <div className="p-3 border rounded-xl bg-zinc-950/80 border-zinc-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Trimmed Clip Duration:</span>
                <span className="font-mono text-white">
                  {formatTime(effectiveDuration, effectiveDuration >= 3600)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Audio Source:</span>
                <span className="font-mono text-white truncate max-w-[220px]">
                  {audioSource?.name || 'Original Audio'} (192kbps AAC)
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Subtitle Cues:</span>
                <span className="font-mono text-white">{subtitles.length} cues</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Container Format:</span>
                <span className="font-mono text-emerald-400 font-bold">.MP4 (H.264 + AAC)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleStartExport}
                className="flex-1 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Export {resolution.toUpperCase()} .MP4 Video
              </button>
              <button
                onClick={handleTakeSnapshot}
                className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700 cursor-pointer"
                title="Save High-Res Poster Frame Image (PNG)"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Progress Display */}
        {isExporting && (
          <div className="py-8 text-center space-y-4">
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
              <div
                className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"
                style={{ animationDuration: '1.2s' }}
              />
              <span className="font-mono text-lg font-bold text-white">{exportProgress}%</span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">
                {exportStatusLabel || `Rendering ${resolution.toUpperCase()} MP4 at ${fps} FPS...`}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Clip Time: {formatTime(currentRenderTime)} / {formatTime(effectiveDuration)}
              </p>
            </div>

            <button
              onClick={() => {
                cancelExportRef.current = true;
                exportAbortRef.current?.abort();
              }}
              className="px-4 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/40 border border-red-800/60 rounded-lg cursor-pointer"
            >
              Cancel Export
            </button>
          </div>
        )}

        {/* Success Export Screen */}
        {exportedUrl && (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">MP4 Clip Rendered Successfully!</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Your H.264 .MP4 video with crystal-clear AAC audio and 1:1 subtitles is ready.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={exportedUrl}
                download={`clip-${resolution}-${fps}fps-${Date.now()}.mp4`}
                className="w-full py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Video File (.MP4)
              </a>

              {onOpenN8nPanel && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenN8nPanel();
                  }}
                  className="w-full py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Workflow className="w-4 h-4" /> Auto-Post Clip to Socials via n8n
                </button>
              )}

              <button
                onClick={() => setExportedUrl(null)}
                className="py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Export another resolution
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 mt-3 text-xs text-red-400 border rounded-xl bg-red-950/40 border-red-800/60 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
